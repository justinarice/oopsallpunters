"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { withCommissioner, logAction, type ActionResult } from "./guard"

// ---------------------------------------------------------------------------
// Commissioner side: create / revoke invites, remove an owner.
// ---------------------------------------------------------------------------

const teamScopedSchema = z.object({
  leagueId: z.string().uuid(),
  teamId: z.string().uuid(),
})

export interface CreateTeamInviteResult {
  /** Relative path — the client builds the absolute URL from window.origin
   *  since the server has no reliable notion of the deployed domain. */
  path: string
}

/**
 * Creates (or reuses) an unclaimed invite link for a team. Idempotent: if
 * an unclaimed invite already exists for this team, its token is reused
 * rather than minting a new one each click, so re-opening the dialog
 * doesn't silently invalidate a link someone was already sent.
 */
export async function createTeamInvite(input: {
  leagueId: string
  teamId: string
}): Promise<ActionResult<CreateTeamInviteResult>> {
  const parsed = teamScopedSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId, teamId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { data: team, error: teamError } = await ctx.supabase
      .from("teams")
      .select("id, team_name, owner_user_id")
      .eq("id", teamId)
      .eq("league_id", leagueId)
      .maybeSingle()
    if (teamError) return { ok: false, error: teamError.message }
    if (!team) return { ok: false, error: "Team not found in this league." }
    if (team.owner_user_id) {
      return {
        ok: false,
        error: `${team.team_name} already has an owner. Remove them first to issue a new invite.`,
      }
    }

    const { data: existing, error: existingError } = await ctx.supabase
      .from("team_invites")
      .select("token")
      .eq("team_id", teamId)
      .is("claimed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingError) return { ok: false, error: existingError.message }

    let token = existing?.token as string | undefined

    if (!token) {
      const { data: created, error: createError } = await ctx.supabase
        .from("team_invites")
        .insert({ team_id: teamId, created_by: ctx.userId })
        .select("token")
        .single()
      if (createError) return { ok: false, error: createError.message }
      token = created.token as string

      // Deliberately no token in the audit log — audit_log is publicly
      // readable (see guard.ts), and the token is a bearer secret.
      await logAction(ctx, `Created an invite link for ${team.team_name}`)
    }

    revalidatePath("/dashboard")
    return { ok: true, data: { path: `/invite/${token}` } }
  })
}

/** Revokes any unclaimed invite(s) for a team, invalidating a link that was
 *  shared but shouldn't work anymore. Already-claimed invites are left in
 *  place as history — this can't un-claim a team, see removeTeamOwner. */
export async function revokeTeamInvite(input: {
  leagueId: string
  teamId: string
}): Promise<ActionResult<{ revoked: number }>> {
  const parsed = teamScopedSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId, teamId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { data: team } = await ctx.supabase
      .from("teams")
      .select("team_name")
      .eq("id", teamId)
      .eq("league_id", leagueId)
      .maybeSingle()
    if (!team) return { ok: false, error: "Team not found in this league." }

    const { data: revoked, error } = await ctx.supabase
      .from("team_invites")
      .delete()
      .eq("team_id", teamId)
      .is("claimed_at", null)
      .select("id")
    if (error) return { ok: false, error: error.message }

    const count = revoked?.length ?? 0
    if (count > 0) {
      await logAction(ctx, `Revoked the invite link for ${team.team_name}`)
    }

    revalidatePath("/dashboard")
    return { ok: true, data: { revoked: count } }
  })
}

/** Clears a team's owner, e.g. the wrong person claimed it, or an owner is
 *  leaving. Fully reversible — a fresh invite can be created right after. */
export async function removeTeamOwner(input: {
  leagueId: string
  teamId: string
}): Promise<ActionResult> {
  const parsed = teamScopedSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid request." }
  const { leagueId, teamId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { data: team, error: teamError } = await ctx.supabase
      .from("teams")
      .update({ owner_user_id: null })
      .eq("id", teamId)
      .eq("league_id", leagueId)
      .select("team_name")
      .maybeSingle()
    if (teamError) return { ok: false, error: teamError.message }
    if (!team) return { ok: false, error: "Team not found in this league." }

    await logAction(ctx, `Removed the owner from ${team.team_name}`)

    revalidatePath("/dashboard")
    return { ok: true }
  })
}

// ---------------------------------------------------------------------------
// Claimant side: preview + claim. Any signed-in user, not just commissioners
// — see migration 0008 for why this goes through security-definer functions
// instead of a normal RLS-scoped query.
// ---------------------------------------------------------------------------

export interface InvitePreview {
  teamName: string
  leagueName: string
  leagueSlug: string
  alreadyClaimed: boolean
}

/** No auth required — a visitor isn't signed in yet when they first open an
 *  invite link, and needs to see what they're claiming before being asked
 *  to sign in. */
export async function getInvitePreview(
  token: string,
): Promise<InvitePreview | null> {
  if (!z.string().uuid().safeParse(token).success) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc("get_invite_preview", { p_token: token })
    .maybeSingle()
  if (error || !data) return null
  const row = data as {
    team_name: string
    league_name: string
    league_slug: string
    already_claimed: boolean
  }
  return {
    teamName: row.team_name,
    leagueName: row.league_name,
    leagueSlug: row.league_slug,
    alreadyClaimed: row.already_claimed,
  }
}

export interface ClaimTeamInviteResult {
  leagueSlug: string
}

export async function claimTeamInvite(
  token: string,
): Promise<ActionResult<ClaimTeamInviteResult>> {
  if (!z.string().uuid().safeParse(token).success) {
    return { ok: false, error: "This invite link isn't valid." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: "You must be signed in to claim a team." }
  }

  const { data: teamId, error } = await supabase.rpc("claim_team_invite", {
    p_token: token,
  })

  if (error) {
    if (error.message.includes("invite_not_found")) {
      return { ok: false, error: "This invite link isn't valid." }
    }
    if (error.message.includes("invite_already_claimed")) {
      return { ok: false, error: "This invite has already been used." }
    }
    if (error.message.includes("team_already_claimed")) {
      return { ok: false, error: "This team already has an owner." }
    }
    return { ok: false, error: "Couldn't claim this team. Please try again." }
  }

  const { data: team } = await supabase
    .from("teams")
    .select("league_id")
    .eq("id", teamId as string)
    .maybeSingle()
  const { data: league } = team
    ? await supabase
        .from("leagues")
        .select("slug")
        .eq("id", team.league_id as string)
        .maybeSingle()
    : { data: null }

  revalidatePath("/dashboard")
  return { ok: true, data: { leagueSlug: (league?.slug as string) ?? "" } }
}
