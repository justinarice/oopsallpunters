"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { withCommissioner, logAction, type ActionResult } from "./guard"

const uuid = z.string().uuid()

/** Known Postgres RPC error code → user-facing message (mirrors the pattern
 *  in lib/actions/roster.ts). */
function rpcMessage(message: string | undefined): string {
  const map: Record<string, string> = {
    not_authenticated: "You must be signed in to draft.",
    not_authorized: "You are not the commissioner of this league.",
    draft_not_active: "The draft isn't currently active.",
    not_your_turn: "It's not your team's turn to pick.",
    punter_not_found: "That punter could not be found.",
    punter_inactive: "That punter is inactive and cannot be drafted.",
    team_already_has_punter: "That team already has a punter — release it before drafting another.",
    punter_already_drafted: "That punter has already been drafted.",
    pick_already_made: "Your team's pick was already made — refresh to see it.",
  }
  for (const code of Object.keys(map)) {
    if (message?.includes(code)) return map[code]
  }
  return "Something went wrong. Please try again."
}

async function leagueSlug(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("leagues")
    .select("slug")
    .eq("id", leagueId)
    .maybeSingle()
  return (data?.slug as string) ?? null
}

async function punterName(supabase: SupabaseClient, punterId: string): Promise<string> {
  const { data } = await supabase.from("punters").select("name").eq("id", punterId).single()
  return (data?.name as string) ?? "Unknown punter"
}

async function teamName(supabase: SupabaseClient, teamId: string): Promise<string> {
  const { data } = await supabase.from("teams").select("team_name").eq("id", teamId).single()
  return (data?.team_name as string) ?? "Unknown team"
}

/**
 * make_draft_pick allows the commissioner to pick on behalf of a stalled
 * team, and that path IS a commissioner mutation (unlike a plain owner
 * making their own pick, which can't write audit_log under RLS anyway — see
 * the module note below). Writes the audit entry only when the acting user
 * is actually this league's commissioner, matching guard.ts's "every
 * commissioner mutation MUST call logAction" rule.
 */
async function logIfCommissionerPick(
  supabase: SupabaseClient,
  leagueId: string,
  pickId: string | null,
): Promise<void> {
  if (!pickId) return
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: league } = await supabase
    .from("leagues")
    .select("slug, commissioner_id")
    .eq("id", leagueId)
    .maybeSingle()
  if (!league || league.commissioner_id !== user.id) return

  const { data: pick } = await supabase
    .from("draft_picks")
    .select("team_id, punter_id")
    .eq("id", pickId)
    .maybeSingle()
  if (!pick) return

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle()
  const actorName =
    (profile?.name as string | null) ??
    (user.user_metadata?.name as string | undefined) ??
    "Commissioner"

  const [pName, tName] = await Promise.all([
    punterName(supabase, pick.punter_id as string),
    teamName(supabase, pick.team_id as string),
  ])

  await logAction(
    { supabase, userId: user.id, actorName, leagueId, slug: league.slug as string },
    `Drafted ${pName} for ${tName}`,
    null,
    { team_id: pick.team_id, punter_id: pick.punter_id },
  )
}

/** Fisher-Yates. Used for "randomize order" — the only v1 draft-order UI. */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// ---------------------------------------------------------------------------
// Commissioner setup/admin actions. All withCommissioner-gated + logAction'd.
// These write draft_settings/draft_state/draft_picks directly (not via RPC)
// since only the commissioner calls them and there's no concurrency to guard
// against — unlike make_draft_pick/resolve_draft_clock below, which many
// people's browsers can call at once.
// ---------------------------------------------------------------------------

const LeagueIdSchema = z.object({ leagueId: uuid })

const ConfigureSchema = z.object({
  leagueId: uuid,
  pickSeconds: z.coerce
    .number()
    .int()
    .min(10, "At least 10 seconds.")
    .max(3600, "At most an hour."),
})

/** Sets the per-pick clock length. Locked once the draft has started (v1
 *  simplification — see plan's "defaults already decided"). */
export async function configureDraft(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = ConfigureSchema.safeParse({
    leagueId: formData.get("leagueId"),
    pickSeconds: formData.get("pickSeconds"),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { leagueId, pickSeconds } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { data: existing } = await ctx.supabase
      .from("draft_settings")
      .select("status")
      .eq("league_id", leagueId)
      .maybeSingle()
    if (existing && existing.status !== "not_started") {
      return { ok: false, error: "Pick time is locked once the draft has started." }
    }

    // Upsert with only the columns being set — on conflict, PostgREST only
    // updates those columns, leaving team_order/status untouched; on first
    // insert, they take their table defaults ('{}' / 'not_started').
    const { error } = await ctx.supabase
      .from("draft_settings")
      .upsert({ league_id: leagueId, pick_seconds: pickSeconds }, { onConflict: "league_id" })
    if (error) return { ok: false, error: error.message }

    await logAction(ctx, `Set the draft pick clock to ${pickSeconds}s`)

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true }
  })
}

export interface RandomizeDraftOrderResult {
  teamOrder: string[]
}

/** Shuffles this league's current teams into a fresh draft order. v1 has no
 *  manual reorder — randomize is the only way to set/change it, and only
 *  before the draft starts. */
export async function randomizeDraftOrder(input: {
  leagueId: string
}): Promise<ActionResult<RandomizeDraftOrderResult>> {
  const parsed = LeagueIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { data: existing } = await ctx.supabase
      .from("draft_settings")
      .select("status")
      .eq("league_id", leagueId)
      .maybeSingle()
    if (existing && existing.status !== "not_started") {
      return { ok: false, error: "Draft order is locked once the draft has started." }
    }

    const { data: teams, error: teamsError } = await ctx.supabase
      .from("teams")
      .select("id")
      .eq("league_id", leagueId)
    if (teamsError) return { ok: false, error: teamsError.message }
    if (!teams || teams.length === 0) {
      return { ok: false, error: "Add teams before setting a draft order." }
    }

    const teamOrder = shuffle(teams.map((t) => t.id as string))

    const { error } = await ctx.supabase
      .from("draft_settings")
      .upsert({ league_id: leagueId, team_order: teamOrder }, { onConflict: "league_id" })
    if (error) return { ok: false, error: error.message }

    await logAction(ctx, "Randomized the draft order")

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true, data: { teamOrder } }
  })
}

/** Starts the draft: validates the order matches current teams and that no
 *  team already has a punter (the draft IS how rosters get set in v1 — see
 *  plan's "Preconditions"), then opens pick #1's clock. */
export async function startDraft(input: { leagueId: string }): Promise<ActionResult> {
  const parsed = LeagueIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { data: settings } = await ctx.supabase
      .from("draft_settings")
      .select("status, pick_seconds, team_order")
      .eq("league_id", leagueId)
      .maybeSingle()
    if (!settings) return { ok: false, error: "Configure the draft before starting it." }
    if (settings.status !== "not_started") {
      return { ok: false, error: "The draft has already been started." }
    }

    const { data: teams } = await ctx.supabase
      .from("teams")
      .select("id")
      .eq("league_id", leagueId)
    const teamIds = new Set((teams ?? []).map((t) => t.id as string))
    const teamOrder = (settings.team_order as string[] | null) ?? []
    if (
      teamOrder.length === 0 ||
      teamOrder.length !== teamIds.size ||
      !teamOrder.every((id) => teamIds.has(id))
    ) {
      return {
        ok: false,
        error: "Draft order doesn't match this league's current teams — randomize it again.",
      }
    }

    const { data: active } = await ctx.supabase
      .from("roster_assignments")
      .select("team_id, teams(team_name)")
      .eq("league_id", leagueId)
      .is("ended_at", null)
    if (active && active.length > 0) {
      const teamName =
        (active[0].teams as unknown as { team_name: string } | null)?.team_name ?? "A team"
      return {
        ok: false,
        error: `${teamName} already has a punter assigned — release it first.`,
      }
    }

    // JS arrays are 0-indexed, team_order[1] in SQL is 1-indexed — pick #1
    // is teamOrder[0] here, deliberately mirroring how make_draft_pick reads
    // the same array from the SQL side.
    const { error: stateError } = await ctx.supabase.from("draft_state").upsert(
      {
        league_id: leagueId,
        current_pick_number: 1,
        current_team_id: teamOrder[0],
        pick_deadline: new Date(Date.now() + settings.pick_seconds * 1000).toISOString(),
      },
      { onConflict: "league_id" },
    )
    if (stateError) return { ok: false, error: stateError.message }

    const { error: statusError } = await ctx.supabase
      .from("draft_settings")
      .update({ status: "in_progress" })
      .eq("league_id", leagueId)
    if (statusError) return { ok: false, error: statusError.message }

    await logAction(ctx, "Started the draft")

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true }
  })
}

export async function pauseDraft(input: { leagueId: string }): Promise<ActionResult> {
  const parsed = LeagueIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { data, error } = await ctx.supabase
      .from("draft_settings")
      .update({ status: "paused" })
      .eq("league_id", leagueId)
      .eq("status", "in_progress")
      .select("league_id")
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: "The draft isn't currently in progress." }

    await logAction(ctx, "Paused the draft")

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true }
  })
}

/** Resumes a paused draft. Gives the current pick a fresh full clock rather
 *  than trying to track/restore however much time was left before the
 *  pause — simpler, and "the clock resets on resume" is an easy rule for
 *  everyone in the draft to understand. */
export async function resumeDraft(input: { leagueId: string }): Promise<ActionResult> {
  const parsed = LeagueIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { data: settings } = await ctx.supabase
      .from("draft_settings")
      .select("status, pick_seconds")
      .eq("league_id", leagueId)
      .maybeSingle()
    if (!settings || settings.status !== "paused") {
      return { ok: false, error: "The draft isn't currently paused." }
    }

    const { error: stateError } = await ctx.supabase
      .from("draft_state")
      .update({
        pick_deadline: new Date(Date.now() + settings.pick_seconds * 1000).toISOString(),
      })
      .eq("league_id", leagueId)
    if (stateError) return { ok: false, error: stateError.message }

    const { error } = await ctx.supabase
      .from("draft_settings")
      .update({ status: "in_progress" })
      .eq("league_id", leagueId)
    if (error) return { ok: false, error: error.message }

    await logAction(ctx, "Resumed the draft")

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true }
  })
}

/** Destructive: undoes every pick this draft made, including the roster
 *  assignments it created. Soft-closes those assignments (ended_at = now())
 *  rather than hard-deleting, mirroring release_punter's soft-close in
 *  0003_roster_rpcs.sql, so this stays consistent with how every other
 *  roster change in this app preserves history. draft_picks rows themselves
 *  ARE hard-deleted — unlike audit_log, they were never meant to be an
 *  immutable record, just the live board's data. */
export async function resetDraft(input: { leagueId: string }): Promise<ActionResult> {
  const parsed = LeagueIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { data: picks } = await ctx.supabase
      .from("draft_picks")
      .select("pick_number, team_id, punter_id, auto_drafted")
      .eq("league_id", leagueId)
    const punterIds = (picks ?? []).map((p) => p.punter_id as string)

    if (punterIds.length > 0) {
      const { error: releaseError } = await ctx.supabase
        .from("roster_assignments")
        .update({ ended_at: new Date().toISOString() })
        .eq("league_id", leagueId)
        .in("punter_id", punterIds)
        .is("ended_at", null)
      if (releaseError) return { ok: false, error: releaseError.message }
    }

    const { error: picksError } = await ctx.supabase
      .from("draft_picks")
      .delete()
      .eq("league_id", leagueId)
    if (picksError) return { ok: false, error: picksError.message }

    const { error: stateError } = await ctx.supabase
      .from("draft_state")
      .delete()
      .eq("league_id", leagueId)
    if (stateError) return { ok: false, error: stateError.message }

    const { error: settingsError } = await ctx.supabase
      .from("draft_settings")
      .update({ status: "not_started" })
      .eq("league_id", leagueId)
    if (settingsError) return { ok: false, error: settingsError.message }

    await logAction(
      ctx,
      `Reset the draft (${punterIds.length} pick${punterIds.length === 1 ? "" : "s"} undone)`,
      { picks: picks ?? [] },
      null,
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true }
  })
}

// ---------------------------------------------------------------------------
// makeDraftPick — called by anyone on the public draft board, not just the
// commissioner, so it deliberately does NOT go through withCommissioner.
// Authorization lives entirely in the RPC itself (migration 0012): the
// on-the-clock team's own owner, or the commissioner picking on their
// behalf. Only the latter is a commissioner mutation and gets audit-logged
// (logIfCommissionerPick, above) — a plain owner's own pick can't write
// audit_log under RLS anyway, and the draft board itself (draft_picks,
// publicly readable and Realtime-broadcast) is already that pick's public
// record, satisfying the same "every action is public" principle.
// ---------------------------------------------------------------------------

const MakePickSchema = z.object({ leagueId: uuid, punterId: uuid })

export async function makeDraftPick(input: {
  leagueId: string
  punterId: string
}): Promise<ActionResult> {
  const parsed = MakePickSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid selection." }
  const { leagueId, punterId } = parsed.data

  const supabase = await createClient()
  const { data: pickId, error } = await supabase.rpc("make_draft_pick", {
    p_league_id: leagueId,
    p_punter_id: punterId,
  })
  if (error) return { ok: false, error: rpcMessage(error.message) }

  await logIfCommissionerPick(supabase, leagueId, pickId as string | null)

  const slug = await leagueSlug(supabase, leagueId)
  if (slug) revalidatePath(`/league/${slug}`, "layout")
  revalidatePath("/dashboard")
  return { ok: true }
}

const ResolveClockSchema = z.object({ leagueId: uuid })

/** Resolves an expired pick clock by auto-drafting for the stalled team.
 *  Commissioner-only (CLAUDE.md principle 3 — "the commissioner initiates
 *  every state change" rules out firing this from a passive client timer),
 *  and only ever called from an explicit "Resolve pick" button click in the
 *  board UI, never from the polling loop. Every call is a commissioner
 *  mutation, so a successful resolve is always audit-logged. */
export async function resolveDraftClock(input: {
  leagueId: string
}): Promise<ActionResult<{ resolved: boolean }>> {
  const parsed = ResolveClockSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { data: state } = await ctx.supabase
      .from("draft_state")
      .select("current_pick_number")
      .eq("league_id", leagueId)
      .maybeSingle()
    const pickNumber = (state?.current_pick_number as number | null) ?? null

    const { data, error } = await ctx.supabase.rpc("resolve_draft_clock", {
      p_league_id: leagueId,
    })
    if (error) return { ok: false, error: rpcMessage(error.message) }

    const resolved = data === true
    if (resolved && pickNumber != null) {
      const { data: pick } = await ctx.supabase
        .from("draft_picks")
        .select("team_id, punter_id")
        .eq("league_id", leagueId)
        .eq("pick_number", pickNumber)
        .maybeSingle()
      if (pick) {
        const [pName, tName] = await Promise.all([
          punterName(ctx.supabase, pick.punter_id as string),
          teamName(ctx.supabase, pick.team_id as string),
        ])
        await logAction(
          ctx,
          `Resolved the expired pick clock: auto-drafted ${pName} for ${tName}`,
          null,
          { team_id: pick.team_id, punter_id: pick.punter_id },
        )
      }
    }

    if (resolved) {
      revalidatePath(`/league/${ctx.slug}`, "layout")
      revalidatePath("/dashboard")
    }
    return { ok: true, data: { resolved } }
  })
}

// ---------------------------------------------------------------------------
// Owner draft-queue management. Plain RLS-gated reads/writes (see migration
// 0012 — draft_queues' owner-write policy is the real authorization here);
// no RPC needed since this is one owner editing their own team's data, never
// a cross-user race.
// ---------------------------------------------------------------------------

const QueueAddSchema = z.object({ leagueId: uuid, teamId: uuid, punterId: uuid })

export interface AddToDraftQueueResult {
  entryId: string
}

export async function addToDraftQueue(input: {
  leagueId: string
  teamId: string
  punterId: string
}): Promise<ActionResult<AddToDraftQueueResult>> {
  const parsed = QueueAddSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid selection." }
  const { leagueId, teamId, punterId } = parsed.data

  const supabase = await createClient()

  const { data: punter } = await supabase
    .from("punters")
    .select("active")
    .eq("id", punterId)
    .maybeSingle()
  if (!punter || punter.active === false) {
    return { ok: false, error: "That punter isn't available to draft." }
  }

  const { data: existing } = await supabase
    .from("draft_queues")
    .select("priority")
    .eq("league_id", leagueId)
    .eq("team_id", teamId)
    .order("priority", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPriority = ((existing?.priority as number) ?? 0) + 1

  // Return the real row id — the client needs it for any subsequent
  // reorder/remove call, so an optimistic placeholder id would silently
  // fail to match on the next mutation.
  const { data, error } = await supabase
    .from("draft_queues")
    .insert({
      league_id: leagueId,
      team_id: teamId,
      punter_id: punterId,
      priority: nextPriority,
    })
    .select("id")
    .single()
  if (error) {
    if (error.message.includes("duplicate key")) {
      return { ok: false, error: "That punter is already in your queue." }
    }
    if (error.message.includes("row-level security")) {
      return { ok: false, error: "You can only manage your own team's queue." }
    }
    return { ok: false, error: error.message }
  }

  const slug = await leagueSlug(supabase, leagueId)
  if (slug) revalidatePath(`/league/${slug}`, "layout")
  return { ok: true, data: { entryId: data.id as string } }
}

const QueueEntrySchema = z.object({ leagueId: uuid, entryId: uuid })

export async function removeFromDraftQueue(input: {
  leagueId: string
  entryId: string
}): Promise<ActionResult> {
  const parsed = QueueEntrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId, entryId } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from("draft_queues").delete().eq("id", entryId)
  if (error) return { ok: false, error: "Couldn't remove that entry." }

  const slug = await leagueSlug(supabase, leagueId)
  if (slug) revalidatePath(`/league/${slug}`, "layout")
  return { ok: true }
}

const ReorderSchema = z.object({
  leagueId: uuid,
  teamId: uuid,
  orderedEntryIds: z.array(uuid).min(1),
})

/** Rewrites priority (1-based) to match the given order. Not wrapped in a
 *  single transaction — one owner editing their own queue has no concurrent
 *  writer to race against (see the module-level RLS note above). */
export async function reorderDraftQueue(input: {
  leagueId: string
  teamId: string
  orderedEntryIds: string[]
}): Promise<ActionResult> {
  const parsed = ReorderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId, teamId, orderedEntryIds } = parsed.data

  const supabase = await createClient()
  for (let i = 0; i < orderedEntryIds.length; i++) {
    const { error } = await supabase
      .from("draft_queues")
      .update({ priority: i + 1 })
      .eq("id", orderedEntryIds[i])
      .eq("team_id", teamId)
    if (error) return { ok: false, error: "Couldn't save the new order." }
  }

  const slug = await leagueSlug(supabase, leagueId)
  if (slug) revalidatePath(`/league/${slug}`, "layout")
  return { ok: true }
}
