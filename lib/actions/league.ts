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

const unlinkSchema = z.object({
  leagueId: z.string().uuid(),
})

export interface UnlinkSleeperResult {
  teamsCleared: number
  pointsCleared: number
}

/**
 * Unlinks this league from Sleeper. Clears the league's sleeper_league_id
 * and each team's *derived* Sleeper identity (user_id, roster_id, avatar,
 * display_name) — sleeper_username is left alone since it's the
 * commissioner-entered lookup key, not something Sleeper resolved for us.
 * Also purges cached sleeper_weekly_points for this league: those rows are
 * keyed by roster_id, which is meaningless once unlinked and would be
 * actively wrong if a future re-link points at a different Sleeper league,
 * so standings should revert cleanly to punter-only scoring rather than
 * keep showing a stale combined total.
 *
 * Fully reversible — re-linking re-resolves identities and re-syncing
 * rebuilds the points cache from scratch.
 */
export async function unlinkSleeperLeague(input: {
  leagueId: string
}): Promise<ActionResult<UnlinkSleeperResult>> {
  const parsed = unlinkSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId } = parsed.data

  try {
    const ctx = await requireCommissioner(leagueId)

    const { data: league, error: leagueFetchError } = await ctx.supabase
      .from("leagues")
      .select("sleeper_league_id")
      .eq("id", leagueId)
      .maybeSingle()
    if (leagueFetchError) return { ok: false, error: leagueFetchError.message }
    if (!league?.sleeper_league_id) {
      return { ok: false, error: "This league isn't linked to Sleeper." }
    }

    const { data: clearedTeams, error: teamsError } = await ctx.supabase
      .from("teams")
      .update({
        sleeper_user_id: null,
        sleeper_roster_id: null,
        sleeper_avatar: null,
        sleeper_display_name: null,
      })
      .eq("league_id", leagueId)
      .not("sleeper_user_id", "is", null)
      .select("id")
    if (teamsError) return { ok: false, error: teamsError.message }

    const { data: clearedPoints, error: pointsError } = await ctx.supabase
      .from("sleeper_weekly_points")
      .delete()
      .eq("league_id", leagueId)
      .select("id")
    if (pointsError) return { ok: false, error: pointsError.message }

    const { error: leagueUpdateError } = await ctx.supabase
      .from("leagues")
      .update({
        sleeper_league_id: null,
        sleeper_last_synced_week: null,
        sleeper_last_synced_at: null,
        sleeper_unmatched_rosters: [],
      })
      .eq("id", leagueId)
    if (leagueUpdateError) return { ok: false, error: leagueUpdateError.message }

    const teamsCleared = clearedTeams?.length ?? 0
    const pointsCleared = clearedPoints?.length ?? 0

    await logAction(
      ctx,
      `Unlinked Sleeper league (${teamsCleared} team${teamsCleared === 1 ? "" : "s"} reset, ${pointsCleared} cached score row${pointsCleared === 1 ? "" : "s"} cleared)`,
      { sleeper_league_id: league.sleeper_league_id },
      { sleeper_league_id: null },
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true, data: { teamsCleared, pointsCleared } }
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
  /** Existing local teams successfully matched to a Sleeper roster owner. */
  matched: number
  /** New teams auto-created from Sleeper rosters that had no matching local team. */
  created: number
  /** Existing local teams whose sleeper_username didn't resolve to any
   *  member of this Sleeper league — commissioner should fix a typo. */
  unmatched: string[]
  /** Sleeper rosters with no owner_id (orphaned/abandoned) — nothing to link. */
  skippedRosters: number
  totalSleeperUsers: number
}

/**
 * Links this league to a real Sleeper league, resolves each existing team to
 * its Sleeper roster/owner identity, and auto-creates a local team for any
 * Sleeper roster that doesn't already have one — so linking a brand-new
 * league needs zero manual team entry.
 *
 * Commissioner-initiated only (never automatic, per CLAUDE.md principle #4).
 * Strategy:
 *   1. For each EXISTING local team: match by already-resolved
 *      sleeper_user_id first, then by sleeper_username (case-insensitive).
 *      Matched teams get their identity + roster_id updated in place —
 *      existing punter assignments/trade history on that team are untouched.
 *   2. For each Sleeper ROSTER with an owner not claimed by step 1: create a
 *      new local team, named from Sleeper's own league team_name if set
 *      (falls back to display_name, then a generic "Team <roster_id>").
 *      The commissioner can rename it afterward like any other team.
 *   3. Rosters with no owner_id (abandoned in Sleeper) are skipped and
 *      counted, not created as phantom teams.
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
    // requireCommissioner scopes everything below strictly to this league's
    // UUID — never resolved by name/slug, so linking always targets exactly
    // the league the commissioner is currently managing.
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
        .map((r) => [r.owner_id as string, r]),
    )
    // Some Sleeper league members have a null username (e.g. joined via
    // invite link and never set a public one) — only those with one can be
    // matched by username, so filter before building the lookup map.
    const userByUsernameLower = new Map(
      sleeperUsers
        .filter((u): u is typeof u & { username: string } => !!u.username)
        .map((u) => [u.username.toLowerCase(), u]),
    )
    const userById = new Map(sleeperUsers.map((u) => [u.user_id, u]))

    const { data: teams, error: teamsError } = await ctx.supabase
      .from("teams")
      .select("id, team_name, sleeper_user_id, sleeper_username")
      .eq("league_id", leagueId)
    if (teamsError) return { ok: false, error: teamsError.message }

    let matched = 0
    const unmatched: string[] = []
    // Sleeper user_ids already claimed by an existing local team, so step 2
    // knows which rosters still need a brand-new team created.
    const claimedUserIds = new Set<string>()

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

      const roster = rosterByOwner.get(user.user_id)
      const { error: updateError } = await ctx.supabase
        .from("teams")
        .update({
          sleeper_user_id: user.user_id,
          // Sleeper doesn't always expose a username; don't blank out a
          // value the commissioner already had stored if so.
          sleeper_username: user.username ?? team.sleeper_username,
          sleeper_avatar: user.avatar,
          sleeper_display_name: user.display_name,
          sleeper_roster_id: roster?.roster_id ?? null,
        })
        .eq("id", team.id as string)
      if (updateError) {
        unmatched.push(team.team_name as string)
        continue
      }
      matched++
      claimedUserIds.add(user.user_id)
    }

    // Step 2: auto-create a team for every Sleeper roster whose owner isn't
    // already tied to a local team.
    let created = 0
    let skippedRosters = 0
    for (const roster of sleeperRosters) {
      if (!roster.owner_id) {
        skippedRosters++
        continue
      }
      if (claimedUserIds.has(roster.owner_id)) continue

      const user = userById.get(roster.owner_id)
      const teamName =
        user?.metadata?.team_name?.trim() ||
        user?.display_name ||
        `Team ${roster.roster_id}`

      const { error: insertError } = await ctx.supabase.from("teams").insert({
        league_id: leagueId,
        team_name: teamName,
        owner_name: user?.display_name ?? teamName,
        sleeper_user_id: roster.owner_id,
        sleeper_username: user?.username ?? null,
        sleeper_avatar: user?.avatar ?? null,
        sleeper_display_name: user?.display_name ?? null,
        sleeper_roster_id: roster.roster_id,
      })
      if (insertError) {
        // Don't fail the whole link over one bad insert (e.g. a rare name
        // collision) — report it as skipped and keep going.
        skippedRosters++
        continue
      }
      created++
      claimedUserIds.add(roster.owner_id)
    }

    const { error: leagueUpdateError } = await ctx.supabase
      .from("leagues")
      .update({ sleeper_league_id: sleeperLeagueId })
      .eq("id", leagueId)
    if (leagueUpdateError) return { ok: false, error: leagueUpdateError.message }

    await logAction(
      ctx,
      `Linked Sleeper league "${sleeperLeague.name}" (${matched} matched, ${created} created, ${unmatched.length} unmatched)`,
      { sleeper_league_id: null },
      { sleeper_league_id: sleeperLeagueId, matched, created, unmatched },
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return {
      ok: true,
      data: {
        matched,
        created,
        unmatched,
        skippedRosters,
        totalSleeperUsers: sleeperUsers.length,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
