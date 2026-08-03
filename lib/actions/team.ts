"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { logAction, requireCommissioner } from "@/lib/actions/guard"
import type { ActionResult } from "@/lib/actions/guard"

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
    const { data, error } = await ctx.supabase
      .from("teams")
      .insert({
        league_id: leagueId,
        team_name: teamName,
        owner_name: ownerName,
        sleeper_username: sleeperUsername || null,
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
      .select("team_name, owner_name, sleeper_username")
      .eq("id", teamId)
      .eq("league_id", leagueId)
      .maybeSingle()
    if (!before) return { ok: false, error: "Team not found." }

    const { error } = await ctx.supabase
      .from("teams")
      .update({
        team_name: teamName,
        owner_name: ownerName,
        sleeper_username: sleeperUsername || null,
      })
      .eq("id", teamId)
      .eq("league_id", leagueId)
    if (error) return { ok: false, error: error.message }

    await logAction(
      ctx,
      `Edited team ${teamName}`,
      before,
      { team_name: teamName, owner_name: ownerName, sleeper_username: sleeperUsername || null },
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
