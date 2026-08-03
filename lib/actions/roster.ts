"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { withCommissioner, logAction, type ActionResult } from "./guard"

const uuid = z.string().uuid()

/** Known Postgres RPC error code → user-facing message. */
function rpcMessage(message: string | undefined): string {
  const map: Record<string, string> = {
    already_assigned:
      "That punter already has an owner in this league. Trade instead.",
    punter_inactive: "That punter is inactive and cannot be assigned.",
    punter_not_found: "That punter could not be found.",
    team_not_in_league: "That team does not belong to this league.",
    same_team: "The punter is already on that team.",
    not_authorized: "You are not the commissioner of this league.",
  }
  for (const code of Object.keys(map)) {
    if (message?.includes(code)) return map[code]
  }
  return "Something went wrong. Please try again."
}

async function punterName(
  supabase: SupabaseClient,
  punterId: string,
): Promise<string> {
  const { data } = await supabase
    .from("punters")
    .select("name")
    .eq("id", punterId)
    .single()
  return (data?.name as string) ?? "Unknown punter"
}

async function teamName(
  supabase: SupabaseClient,
  teamId: string,
): Promise<string> {
  const { data } = await supabase
    .from("teams")
    .select("team_name")
    .eq("id", teamId)
    .single()
  return (data?.team_name as string) ?? "Unknown team"
}

const AssignSchema = z.object({
  leagueId: uuid,
  teamId: uuid,
  punterId: uuid,
})

/** Assign a free-agent punter to a team. */
export async function assignPunter(input: {
  leagueId: string
  teamId: string
  punterId: string
}): Promise<ActionResult> {
  const parsed = AssignSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid selection." }
  const { leagueId, teamId, punterId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const { error } = await ctx.supabase.rpc("assign_punter", {
      p_league_id: leagueId,
      p_team_id: teamId,
      p_punter_id: punterId,
    })
    if (error) return { ok: false, error: rpcMessage(error.message) }

    const [pName, tName] = await Promise.all([
      punterName(ctx.supabase, punterId),
      teamName(ctx.supabase, teamId),
    ])
    await logAction(ctx, `Assigned ${pName} to ${tName}`, null, {
      team_id: teamId,
      punter_id: punterId,
    })

    revalidatePath("/dashboard")
    return { ok: true }
  })
}

const ReleaseSchema = z.object({ leagueId: uuid, punterId: uuid })

/** Release a punter back to free agency (soft-close active assignment). */
export async function releasePunter(input: {
  leagueId: string
  punterId: string
}): Promise<ActionResult> {
  const parsed = ReleaseSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid selection." }
  const { leagueId, punterId } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    const pName = await punterName(ctx.supabase, punterId)

    const { error } = await ctx.supabase.rpc("release_punter", {
      p_league_id: leagueId,
      p_punter_id: punterId,
    })
    if (error) return { ok: false, error: rpcMessage(error.message) }

    await logAction(ctx, `Released ${pName} to free agency`, {
      punter_id: punterId,
    })

    revalidatePath("/dashboard")
    return { ok: true }
  })
}

const TradeSchema = z.object({
  leagueId: uuid,
  toTeam: uuid,
  punterId: uuid,
  notes: z.string().max(500).optional(),
})

/**
 * Record a trade: soft-closes the current assignment and opens a new one for
 * the destination team, atomically, then writes the audit entry. No preview
 * step by design (plan §6 — trades are simple enough to submit-and-record).
 */
export async function tradePunter(input: {
  leagueId: string
  toTeam: string
  punterId: string
  notes?: string
}): Promise<ActionResult> {
  const parsed = TradeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid trade details." }
  const { leagueId, toTeam, punterId, notes } = parsed.data

  return withCommissioner(leagueId, async (ctx) => {
    // Capture the "from" team before the RPC closes it, for the audit entry.
    const { data: activeRow } = await ctx.supabase
      .from("roster_assignments")
      .select("team_id")
      .eq("league_id", leagueId)
      .eq("punter_id", punterId)
      .is("ended_at", null)
      .maybeSingle()

    const { error } = await ctx.supabase.rpc("trade_punter", {
      p_league_id: leagueId,
      p_to_team: toTeam,
      p_punter_id: punterId,
      p_notes: notes ?? "",
    })
    if (error) return { ok: false, error: rpcMessage(error.message) }

    const [pName, toName, fromName] = await Promise.all([
      punterName(ctx.supabase, punterId),
      teamName(ctx.supabase, toTeam),
      activeRow?.team_id
        ? teamName(ctx.supabase, activeRow.team_id as string)
        : Promise.resolve("Free agency"),
    ])

    await logAction(
      ctx,
      `Traded ${pName}: ${fromName} → ${toName}`,
      { from_team: activeRow?.team_id ?? null },
      { to_team: toTeam, notes: notes ?? null },
    )

    revalidatePath("/dashboard")
    return { ok: true }
  })
}
