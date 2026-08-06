"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { logAction, requireCommissioner } from "@/lib/actions/guard"
import type { ActionResult } from "@/lib/actions/guard"
import { getUser as getSleeperUser } from "@/lib/sleeper"

/**
 * Resolves a commissioner-entered Sleeper username to its stable identity
 * fields. Returns nulls (not a thrown error) when the field is blank or the
 * username doesn't resolve -- a bad/unknown Sleeper username shouldn't block
 * creating or editing a team, since sleeper_username is optional.
 */
async function resolveSleeperIdentity(username: string | undefined) {
  const empty = {
    sleeper_username: null as string | null,
    sleeper_user_id: null as string | null,
    sleeper_avatar: null as string | null,
    sleeper_display_name: null as string | null,
  }
  if (!username) return empty

  const user = await getSleeperUser(username)
  if (!user) {
    // Keep what the commissioner typed even though it didn't resolve, so
    // they can see/fix it later, but don't fabricate an identity.
    return { ...empty, sleeper_username: username }
  }
  return {
    sleeper_username: username,
    sleeper_user_id: user.user_id,
    sleeper_avatar: user.avatar,
    sleeper_display_name: user.display_name,
  }
}

const createSchema = z.object({
  leagueId: z.string().uuid(),
  teamName: z.string().trim().min(1, "Team name is required.").max(80),
  ownerName: z.string().trim().min(1, "Owner name is required.").max(80),
  sleeperUsername: z.string().trim().max(80).optional().or(z.literal("")),
})

export async function createTeam(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    leagueId: formData.get("leagueId"),
    teamName: formData.get("teamName"),
    ownerName: formData.get("ownerName"),
    sleeperUsername: formData.get("sleeperUsername") ?? "",
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { leagueId, teamName, ownerName, sleeperUsername } = parsed.data

  try {
    const ctx = await requireCommissioner(leagueId)
    const identity = await resolveSleeperIdentity(sleeperUsername || undefined)

    const { data, error } = await ctx.supabase
      .from("teams")
      .insert({
        league_id: leagueId,
        team_name: teamName,
        owner_name: ownerName,
        ...identity,
      })
      .select("id, team_name, owner_name")
      .single()
    if (error) return { ok: false, error: error.message }

    await logAction(ctx, `Added team ${teamName} (${ownerName})`, null, data)

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

const updateSchema = z.object({
  leagueId: z.string().uuid(),
  teamId: z.string().uuid(),
  teamName: z.string().trim().min(1, "Team name is required.").max(80),
  ownerName: z.string().trim().min(1, "Owner name is required.").max(80),
  sleeperUsername: z.string().trim().max(80).optional().or(z.literal("")),
})

export async function updateTeam(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse({
    leagueId: formData.get("leagueId"),
    teamId: formData.get("teamId"),
    teamName: formData.get("teamName"),
    ownerName: formData.get("ownerName"),
    sleeperUsername: formData.get("sleeperUsername") ?? "",
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { leagueId, teamId, teamName, ownerName, sleeperUsername } = parsed.data

  try {
    const ctx = await requireCommissioner(leagueId)

    const { data: before } = await ctx.supabase
      .from("teams")
      .select(
        "team_name, owner_name, sleeper_username, sleeper_user_id, sleeper_avatar, sleeper_display_name",
      )
      .eq("id", teamId)
      .eq("league_id", leagueId)
      .maybeSingle()
    if (!before) return { ok: false, error: "Team not found." }

    // Only re-resolve against Sleeper if the username actually changed --
    // avoids an extra API call on every unrelated edit (e.g. renaming a team).
    const usernameChanged = (before.sleeper_username ?? "") !== (sleeperUsername || "")
    const identity = usernameChanged
      ? await resolveSleeperIdentity(sleeperUsername || undefined)
      : {
          sleeper_username: before.sleeper_username,
          sleeper_user_id: before.sleeper_user_id,
          sleeper_avatar: before.sleeper_avatar,
          sleeper_display_name: before.sleeper_display_name,
        }

    const { error } = await ctx.supabase
      .from("teams")
      .update({
        team_name: teamName,
        owner_name: ownerName,
        ...identity,
      })
      .eq("id", teamId)
      .eq("league_id", leagueId)
    if (error) return { ok: false, error: error.message }

    await logAction(
      ctx,
      `Edited team ${teamName}`,
      before,
      { team_name: teamName, owner_name: ownerName, ...identity },
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

const deleteSchema = z.object({
  leagueId: z.string().uuid(),
  teamId: z.string().uuid(),
})

export async function deleteTeam(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse({
    leagueId: formData.get("leagueId"),
    teamId: formData.get("teamId"),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { leagueId, teamId } = parsed.data

  try {
    const ctx = await requireCommissioner(leagueId)

    const { data: before } = await ctx.supabase
      .from("teams")
      .select("team_name, owner_name")
      .eq("id", teamId)
      .eq("league_id", leagueId)
      .maybeSingle()
    if (!before) return { ok: false, error: "Team not found." }

    // Close any active roster assignment first so we don't orphan it, and so
    // the punter returns to the free-agent pool.
    await ctx.supabase
      .from("roster_assignments")
      .update({ ended_at: new Date().toISOString() })
      .eq("league_id", leagueId)
      .eq("team_id", teamId)
      .is("ended_at", null)

    const { error } = await ctx.supabase
      .from("teams")
      .delete()
      .eq("id", teamId)
      .eq("league_id", leagueId)
    if (error) return { ok: false, error: error.message }

    await logAction(ctx, `Removed team ${before.team_name}`, before, null)

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
