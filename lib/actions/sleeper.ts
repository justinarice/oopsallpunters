"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { withCommissioner, logAction, type ActionResult, type CommishContext } from "./guard"
import { getMatchups, requireRegularSeasonStarted } from "@/lib/sleeper"

// ---------------------------------------------------------------------------
// Shared per-week sync — used by both syncSleeperScores (one week) and
// backfillSleeperScores (a range of weeks) so the two never drift.
// ---------------------------------------------------------------------------

interface WeekSyncOutcome {
  week: number
  updated: number
  unmatchedRosters: number[]
}

/** Pulls and upserts one week's Sleeper matchup points. Returns `null` data
 *  (not an error) when Sleeper simply has no data for that week yet —
 *  callers decide whether that's fatal (single sync) or just "skip and
 *  continue" (backfill). */
async function syncOneWeek(
  ctx: CommishContext,
  leagueId: string,
  sleeperLeagueId: string,
  week: number,
  teamByRoster: Map<number, string>,
): Promise<
  | { ok: true; data: WeekSyncOutcome | null }
  | { ok: false; error: string }
> {
  const matchups = await getMatchups(sleeperLeagueId, week)
  if (!matchups || matchups.length === 0) {
    return { ok: true, data: null }
  }

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

  const { error } = await ctx.supabase
    .from("sleeper_weekly_points")
    .upsert(rows, { onConflict: "league_id,week,roster_id" })
  if (error) return { ok: false, error: error.message }

  return { ok: true, data: { week, updated: rows.length, unmatchedRosters } }
}

/** Team id lookup by Sleeper roster_id, shared across single/backfill sync. */
async function loadTeamByRoster(
  ctx: CommishContext,
  leagueId: string,
): Promise<Map<number, string>> {
  const { data: teams } = await ctx.supabase
    .from("teams")
    .select("id, sleeper_roster_id")
    .eq("league_id", leagueId)
    .not("sleeper_roster_id", "is", null)

  return new Map(
    (teams ?? []).map((t) => [t.sleeper_roster_id as number, t.id as string]),
  )
}

/** Persists freshness + unmatched-roster status onto the league row (see
 *  migration 0007) so both survive a page refresh instead of only living in
 *  an action's return value / toast. */
async function persistSyncStatus(
  ctx: CommishContext,
  leagueId: string,
  week: number,
  unmatchedRosters: number[],
): Promise<void> {
  const { error } = await ctx.supabase
    .from("leagues")
    .update({
      sleeper_last_synced_week: week,
      sleeper_last_synced_at: new Date().toISOString(),
      sleeper_unmatched_rosters: unmatchedRosters,
    })
    .eq("id", leagueId)
  if (error) {
    // The sync itself already succeeded and is safe to report as such —
    // only the freshness/unmatched display would be stale, not the data.
    console.error("[v0] sync status update failed:", error.message)
  }
}

async function getSleeperLeagueId(
  ctx: CommishContext,
  leagueId: string,
): Promise<string | null> {
  const { data: league } = await ctx.supabase
    .from("leagues")
    .select("sleeper_league_id")
    .eq("id", leagueId)
    .maybeSingle()
  return (league?.sleeper_league_id as string | null) ?? null
}

// ---------------------------------------------------------------------------
// Single-week sync
// ---------------------------------------------------------------------------

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

    const sleeperLeagueId = await getSleeperLeagueId(ctx, leagueId)
    if (!sleeperLeagueId) {
      return {
        ok: false,
        error: "Link this league to Sleeper first (League Settings).",
      }
    }

    const week = requestedWeek ?? seasonCheck.state.week
    const teamByRoster = await loadTeamByRoster(ctx, leagueId)

    const result = await syncOneWeek(ctx, leagueId, sleeperLeagueId, week, teamByRoster)
    if (!result.ok) return { ok: false, error: result.error }
    if (!result.data) {
      return { ok: false, error: `Sleeper had no matchup data for week ${week} yet.` }
    }

    const { updated, unmatchedRosters } = result.data
    await persistSyncStatus(ctx, leagueId, week, unmatchedRosters)

    await logAction(
      ctx,
      `Synced Sleeper scores for week ${week} (${updated} rosters, ${unmatchedRosters.length} unmatched)`,
      null,
      { week, updated, unmatchedRosters },
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true, data: { week, updated, unmatchedRosters } }
  })
}

// ---------------------------------------------------------------------------
// Backfill sync (multiple weeks in one go)
// ---------------------------------------------------------------------------

const BackfillSchema = z.object({
  leagueId: z.string().uuid(),
  fromWeek: z.number().int().min(1).max(23).default(1),
  // Optional — defaults to the current NFL week when omitted.
  throughWeek: z.number().int().min(1).max(23).optional(),
})

export interface BackfillSleeperScoresResult {
  weeksSynced: number[]
  /** Weeks Sleeper had no matchup data for yet (e.g. future weeks) — not an
   *  error, just nothing to pull. */
  weeksSkipped: number[]
  totalUpdated: number
  /** Unmatched rosters as of the LAST week synced (highest week number),
   *  matching what a single sync of that week would report — not a union
   *  across the whole range, which would over-report rosters that got
   *  matched partway through. */
  unmatchedRosters: number[]
}

/**
 * Syncs a range of weeks (default: week 1 through the current NFL week) in
 * one commissioner-initiated action, for catching up a league linked
 * mid-season or recovering from a stretch of missed syncs. Still no
 * background/scheduled component — this is one click that does N fetches,
 * not a job that runs on its own.
 *
 * Each week is fetched and upserted independently; a week Sleeper has no
 * data for yet is skipped (not fatal) so the range can safely extend up to
 * "the current week" without erroring on weeks that haven't happened.
 */
export async function backfillSleeperScores(input: {
  leagueId: string
  fromWeek?: number
  throughWeek?: number
}): Promise<ActionResult<BackfillSleeperScoresResult>> {
  const parsed = BackfillSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid backfill request." }
  const { leagueId, fromWeek, throughWeek: requestedThroughWeek } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const seasonCheck = await requireRegularSeasonStarted()
    if (!seasonCheck.ok) return { ok: false, error: seasonCheck.error }

    const sleeperLeagueId = await getSleeperLeagueId(ctx, leagueId)
    if (!sleeperLeagueId) {
      return {
        ok: false,
        error: "Link this league to Sleeper first (League Settings).",
      }
    }

    const throughWeek = requestedThroughWeek ?? seasonCheck.state.week
    if (fromWeek > throughWeek) {
      return { ok: false, error: "Start week must be before the end week." }
    }

    const teamByRoster = await loadTeamByRoster(ctx, leagueId)

    const weeksSynced: number[] = []
    const weeksSkipped: number[] = []
    let totalUpdated = 0
    let lastSyncedUnmatched: number[] = []

    for (let week = fromWeek; week <= throughWeek; week++) {
      const result = await syncOneWeek(ctx, leagueId, sleeperLeagueId, week, teamByRoster)
      if (!result.ok) return { ok: false, error: `Week ${week}: ${result.error}` }
      if (!result.data) {
        weeksSkipped.push(week)
        continue
      }
      weeksSynced.push(week)
      totalUpdated += result.data.updated
      lastSyncedUnmatched = result.data.unmatchedRosters
    }

    if (weeksSynced.length === 0) {
      return {
        ok: false,
        error: `Sleeper had no matchup data for weeks ${fromWeek}–${throughWeek} yet.`,
      }
    }

    const lastWeek = weeksSynced[weeksSynced.length - 1]
    await persistSyncStatus(ctx, leagueId, lastWeek, lastSyncedUnmatched)

    await logAction(
      ctx,
      `Backfilled Sleeper scores for weeks ${fromWeek}–${throughWeek} (${weeksSynced.length} synced, ${weeksSkipped.length} skipped, ${totalUpdated} rosters updated)`,
      null,
      { fromWeek, throughWeek, weeksSynced, weeksSkipped, totalUpdated },
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return {
      ok: true,
      data: {
        weeksSynced,
        weeksSkipped,
        totalUpdated,
        unmatchedRosters: lastSyncedUnmatched,
      },
    }
  })
}
