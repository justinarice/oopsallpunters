"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  logAction,
  requireCommissioner,
  type ActionResult,
} from "@/lib/actions/guard"
import {
  getLeague as getSleeperLeague,
  getLeagueRosters,
  getLeagueUsers,
} from "@/lib/sleeper"

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

const createSchema = z.object({
  name: z.string().trim().min(1, "League name is required.").max(80),
  season: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Season must be a 4-digit year."),
})

/**
 * Create a new league owned by the current user. Any signed-in user may create
 * a league (they become its commissioner). A unique slug is derived from the
 * name, with a numeric suffix on collision.
 */
export async function createLeague(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    season: formData.get("season"),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }
  const { name, season } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  // Find an available slug.
  const base = slugify(name) || "league"
  let slug = base
  for (let i = 2; i < 100; i++) {
    const { data: existing } = await supabase
      .from("leagues")
      .select("id")
      .eq("slug", slug)
      .maybeSingle()
    if (!existing) break
    slug = `${base}-${i}`
  }

  const { data: league, error } = await supabase
    .from("leagues")
    .insert({
      name,
      season,
      slug,
      commissioner_id: user.id,
    })
    .select("id, slug")
    .single()
  if (error) return { ok: false, error: error.message }

  // Seed a default scoring rule set so the scoring page isn't empty.
  const defaultRules = [
    { stat: "inside_20", points: 2, modifier: "each" },
    { stat: "gross_yards", points: 1, modifier: "per_10" },
    { stat: "net_yards", points: 1, modifier: "per_10" },
    { stat: "touchback", points: -1, modifier: "each" },
    { stat: "blocked", points: -3, modifier: "each" },
    { stat: "fair_catch", points: 1, modifier: "each" },
    { stat: "longest", points: 1, modifier: "each" },
  ]
  await supabase.from("scoring_rules").insert(
    defaultRules.map((r) => ({ ...r, league_id: league.id })),
  )

  // Audit entry (uses the verified-commissioner context we just created).
  const ctx = await requireCommissioner(league.id)
  await logAction(ctx, `Created league "${name}" (${season})`, null, {
    slug,
    season,
  })

  revalidatePath("/dashboard")
  revalidatePath("/")
  return { ok: true }
}

const settingsSchema = z.object({
  leagueId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required.").max(80),
  season: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Season must be a 4-digit year."),
  announcement: z.string().trim().max(1000).optional().or(z.literal("")),
})

/** Update league name / season / announcement. */
export async function updateLeagueSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse({
    leagueId: formData.get("leagueId"),
    name: formData.get("name"),
    season: formData.get("season"),
    announcement: formData.get("announcement") ?? "",
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }
  const { leagueId, name, season, announcement } = parsed.data

  try {
    const ctx = await requireCommissioner(leagueId)

    const { data: before } = await ctx.supabase
      .from("leagues")
      .select("name, season, announcement")
      .eq("id", leagueId)
      .maybeSingle()

    const nextAnnouncement =
      announcement && announcement.length > 0 ? announcement : null

    const { error } = await ctx.supabase
      .from("leagues")
      .update({ name, season, announcement: nextAnnouncement })
      .eq("id", leagueId)
    if (error) return { ok: false, error: error.message }

    const changes: string[] = []
    if (before?.name !== name) changes.push("name")
    if (before?.season !== season) changes.push("season")
    if ((before?.announcement ?? null) !== nextAnnouncement)
      changes.push("announcement")

    await logAction(
      ctx,
      `Updated league settings (${changes.join(", ") || "no changes"})`,
      before ?? null,
      { name, season, announcement: nextAnnouncement },
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

const linkSleeperSchema = z.object({
  leagueId: z.string().uuid(),
  sleeperLeagueId: z
    .string()
    .trim()
    .regex(/^\d+$/, "That doesn't look like a Sleeper league ID."),
})

export interface LinkSleeperResult {
  matched: number
  unmatched: string[] // team_name values that couldn't be matched
  totalSleeperUsers: number
}

/**
 * Links this league to a real Sleeper league and resolves each existing team
 * to its Sleeper roster/owner identity.
 *
 * Commissioner-initiated only (never automatic, per CLAUDE.md principle #4).
 * Matching strategy, in order:
 *   1. team.sleeper_user_id already resolved and present among the league's
 *      Sleeper users -> match directly.
 *   2. team.sleeper_username matches a Sleeper user's username (case
 *      insensitive) -> resolve and match.
 * Teams that don't match either way are left alone and reported back so the
 * commissioner can fix the username and re-run the link.
 */
export async function linkSleeperLeague(
  _prev: ActionResult<LinkSleeperResult> | null,
  formData: FormData,
): Promise<ActionResult<LinkSleeperResult>> {
  const parsed = linkSleeperSchema.safeParse({
    leagueId: formData.get("leagueId"),
    sleeperLeagueId: formData.get("sleeperLeagueId"),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { leagueId, sleeperLeagueId } = parsed.data

  try {
    const ctx = await requireCommissioner(leagueId)

    const [sleeperLeague, sleeperUsers, sleeperRosters] = await Promise.all([
      getSleeperLeague(sleeperLeagueId),
      getLeagueUsers(sleeperLeagueId),
      getLeagueRosters(sleeperLeagueId),
    ])
    if (!sleeperLeague || !sleeperUsers || !sleeperRosters) {
      return {
        ok: false,
        error: "Couldn't find that Sleeper league. Double-check the league ID.",
      }
    }

    const rosterByOwner = new Map(
      sleeperRosters
        .filter((r) => r.owner_id)
        .map((r) => [r.owner_id as string, r.roster_id]),
    )
    const userByUsernameLower = new Map(
      sleeperUsers.map((u) => [u.username.toLowerCase(), u]),
    )
    const userById = new Map(sleeperUsers.map((u) => [u.user_id, u]))

    const { data: teams, error: teamsError } = await ctx.supabase
      .from("teams")
      .select("id, team_name, sleeper_user_id, sleeper_username")
      .eq("league_id", leagueId)
    if (teamsError) return { ok: false, error: teamsError.message }

    let matched = 0
    const unmatched: string[] = []

    for (const team of teams ?? []) {
      // Prefer the already-resolved user_id if it's a member of this league.
      let user = team.sleeper_user_id
        ? userById.get(team.sleeper_user_id as string)
        : undefined
      // Fall back to matching on the entered username.
      if (!user && team.sleeper_username) {
        user = userByUsernameLower.get(
          (team.sleeper_username as string).toLowerCase(),
        )
      }

      if (!user) {
        unmatched.push(team.team_name as string)
        continue
      }

      const rosterId = rosterByOwner.get(user.user_id)
      const { error: updateError } = await ctx.supabase
        .from("teams")
        .update({
          sleeper_user_id: user.user_id,
          sleeper_username: user.username,
          sleeper_avatar: user.avatar,
          sleeper_display_name: user.display_name,
          sleeper_roster_id: rosterId ?? null,
        })
        .eq("id", team.id as string)
      if (updateError) {
        unmatched.push(team.team_name as string)
        continue
      }
      matched++
    }

    const { error: leagueUpdateError } = await ctx.supabase
      .from("leagues")
      .update({ sleeper_league_id: sleeperLeagueId })
      .eq("id", leagueId)
    if (leagueUpdateError) return { ok: false, error: leagueUpdateError.message }

    await logAction(
      ctx,
      `Linked Sleeper league "${sleeperLeague.name}" (${matched}/${(teams ?? []).length} teams matched)`,
      { sleeper_league_id: null },
      { sleeper_league_id: sleeperLeagueId, matched, unmatched },
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return {
      ok: true,
      data: { matched, unmatched, totalSleeperUsers: sleeperUsers.length },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
