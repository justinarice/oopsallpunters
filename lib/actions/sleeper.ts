"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { withCommissioner, logAction, type ActionResult } from "./guard"
import { getMatchups, requireRegularSeasonStarted } from "@/lib/sleeper"

const SyncSchema = z.object({
  leagueId: z.string().uuid(),
  // Optional — defaults to the current NFL week when omitted, so the
  // "sync this week" button needs no manual week entry.
  week: z.number().int().min(1).max(23).optional(),
})

export interface SyncSleeperScoresResult {
  week: number
  updated: number
  unmatchedRosters: number[]
}

/**
 * Pulls this week's Sleeper matchup points for a linked league and caches
 * them in sleeper_weekly_points, keyed by team via each team's
 * sleeper_roster_id (set when the league was linked / re-linked).
 *
 * Commissioner-initiated only — there is no background sync. Rosters that
 * don't currently map to a team (e.g. a Sleeper-only bye-week roster, or a
 * team not yet matched) are still recorded with team_id = null so the raw
 * snapshot is complete, and reported back as unmatched.
 */
export async function syncSleeperScores(input: {
  leagueId: string
  week?: number
}): Promise<ActionResult<SyncSleeperScoresResult>> {
  const parsed = SyncSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid sync request." }
  const { leagueId, week: requestedWeek } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const seasonCheck = await requireRegularSeasonStarted()
    if (!seasonCheck.ok) return { ok: false, error: seasonCheck.error }

    const { data: league } = await ctx.supabase
      .from("leagues")
      .select("sleeper_league_id")
      .eq("id", leagueId)
      .maybeSingle()

    const sleeperLeagueId = league?.sleeper_league_id as string | null
    if (!sleeperLeagueId) {
      return {
        ok: false,
        error: "Link this league to Sleeper first (League Settings).",
      }
    }

    const week = requestedWeek ?? seasonCheck.state.week

    const matchups = await getMatchups(sleeperLeagueId, week)
    if (!matchups) {
      return {
        ok: false,
        error: `Sleeper had no matchup data for week ${week} yet.`,
      }
    }

    const { data: teams } = await ctx.supabase
      .from("teams")
      .select("id, sleeper_roster_id")
      .eq("league_id", leagueId)
      .not("sleeper_roster_id", "is", null)

    const teamByRoster = new Map(
      (teams ?? []).map((t) => [t.sleeper_roster_id as number, t.id as string]),
    )

    const unmatchedRosters: number[] = []
    const rows = matchups.map((m) => {
      const teamId = teamByRoster.get(m.roster_id) ?? null
      if (!teamId) unmatchedRosters.push(m.roster_id)
      return {
        league_id: leagueId,
        week,
        roster_id: m.roster_id,
        team_id: teamId,
        points: m.custom_points ?? m.points,
        synced_by: ctx.userId,
      }
    })

    if (rows.length === 0) {
      return { ok: false, error: `No rosters found for week ${week}.` }
    }

    const { error } = await ctx.supabase
      .from("sleeper_weekly_points")
      .upsert(rows, { onConflict: "league_id,week,roster_id" })
    if (error) return { ok: false, error: error.message }

    // Persist freshness + unmatched-roster status onto the league row so
    // both survive a page refresh instead of only living in this action's
    // return value / toast. Overwritten wholesale each sync — see migration
    // 0007 for why that's the right behavior for unmatched rosters.
    const { error: statusError } = await ctx.supabase
      .from("leagues")
      .update({
        sleeper_last_synced_week: week,
        sleeper_last_synced_at: new Date().toISOString(),
        sleeper_unmatched_rosters: unmatchedRosters,
      })
      .eq("id", leagueId)
    if (statusError) {
      // The sync itself already succeeded and is safe to report as such —
      // only the freshness/unmatched display would be stale, not the data.
      console.error("[v0] sync status update failed:", statusError.message)
    }

    await logAction(
      ctx,
      `Synced Sleeper scores for week ${week} (${rows.length} rosters, ${unmatchedRosters.length} unmatched)`,
      null,
      { week, updated: rows.length, unmatchedRosters },
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return {
      ok: true,
      data: { week, updated: rows.length, unmatchedRosters },
    }
  })
}
