"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  logAction,
  requireCommissioner,
  type ActionResult,
  type CommishContext,
} from "@/lib/actions/guard"
import { calculateFantasyPoints } from "@/lib/scoring"
import type { ScoringRule, StatKey, WeeklyStats } from "@/lib/types"

const updateSchema = z.object({
  leagueId: z.string().uuid(),
  stat: z.string().min(1),
  points: z.coerce.number(),
  recalculatePastWeeks: z.union([z.literal("true"), z.literal("false")]).default("false"),
})

export interface UpdateScoringRuleResult {
  oldPoints: number
  newPoints: number
  /** Only set when recalculatePastWeeks was true. */
  recalculatedScores: number
  recalculatedWeeks: number
  /** Only set when recalculatePastWeeks was false — the first week the new
   *  value applies; past weeks keep their already-calculated points. */
  effectiveWeek: number | null
}

/**
 * Updates a single scoring rule's point value.
 *
 * The commissioner explicitly chooses whether the change is retroactive:
 *   - recalculatePastWeeks = true  -> every already-calculated weekly_scores
 *     row in this league is recomputed from weekly_stats using the FULL,
 *     now-updated rule set (not just the changed stat), via the same pure
 *     calculateFantasyPoints function the import pipeline uses.
 *   - recalculatePastWeeks = false -> only scoring_rules changes; existing
 *     weekly_scores rows are left untouched, and the new value simply takes
 *     effect the next time scores are calculated (recorded as effective_week
 *     for the audit trail).
 * Either way, a scoring_rule_changes row captures the before/after and the
 * choice made, and the whole thing is written to the public audit log.
 */
export async function updateScoringRule(
  _prev: ActionResult<UpdateScoringRuleResult> | null,
  formData: FormData,
): Promise<ActionResult<UpdateScoringRuleResult>> {
  const parsed = updateSchema.safeParse({
    leagueId: formData.get("leagueId"),
    stat: formData.get("stat"),
    points: formData.get("points"),
    recalculatePastWeeks: formData.get("recalculatePastWeeks") ?? "false",
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." }
  }
  const { leagueId, stat, points, recalculatePastWeeks } = parsed.data
  const doRecalculate = recalculatePastWeeks === "true"

  try {
    const ctx = await requireCommissioner(leagueId)

    const { data: existingRule, error: ruleError } = await ctx.supabase
      .from("scoring_rules")
      .select("id, points")
      .eq("league_id", leagueId)
      .eq("stat", stat)
      .maybeSingle()
    if (ruleError) return { ok: false, error: ruleError.message }
    if (!existingRule) {
      return { ok: false, error: `No scoring rule found for "${stat}".` }
    }

    const oldPoints = Number(existingRule.points)
    if (oldPoints === points) {
      return {
        ok: true,
        data: {
          oldPoints,
          newPoints: points,
          recalculatedScores: 0,
          recalculatedWeeks: 0,
          effectiveWeek: null,
        },
      }
    }

    const { error: updateRuleError } = await ctx.supabase
      .from("scoring_rules")
      .update({ points })
      .eq("id", existingRule.id as string)
    if (updateRuleError) return { ok: false, error: updateRuleError.message }

    // For a forward-only change, record which week the new value takes
    // effect from: one past the latest week that already has scores (or
    // week 1 if nothing's been calculated yet).
    let effectiveWeek: number | null = null
    if (!doRecalculate) {
      const { data: maxWeekRow } = await ctx.supabase
        .from("weekly_scores")
        .select("week")
        .eq("league_id", leagueId)
        .order("week", { ascending: false })
        .limit(1)
        .maybeSingle()
      effectiveWeek = ((maxWeekRow?.week as number | undefined) ?? 0) + 1
    }

    const { data: changeRow, error: changeError } = await ctx.supabase
      .from("scoring_rule_changes")
      .insert({
        league_id: leagueId,
        stat,
        old_points: oldPoints,
        new_points: points,
        changed_by: ctx.userId,
        recalculate_past_weeks: doRecalculate,
        effective_week: effectiveWeek,
      })
      .select("id")
      .single()
    if (changeError) return { ok: false, error: changeError.message }

    let recalculatedScores = 0
    let recalculatedWeeks = 0
    if (doRecalculate) {
      const result = await recalculatePastScores(
        ctx,
        leagueId,
        changeRow.id as string,
      )
      recalculatedScores = result.scores
      recalculatedWeeks = result.weeks
    }

    await logAction(
      ctx,
      doRecalculate
        ? `Changed scoring: ${stat} ${oldPoints} → ${points} (recalculated ${recalculatedScores} scores across ${recalculatedWeeks} weeks)`
        : `Changed scoring: ${stat} ${oldPoints} → ${points} (effective week ${effectiveWeek}, past weeks unchanged)`,
      { stat, points: oldPoints },
      { stat, points, recalculatePastWeeks: doRecalculate, effectiveWeek },
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    return {
      ok: true,
      data: { oldPoints, newPoints: points, recalculatedScores, recalculatedWeeks, effectiveWeek },
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Recomputes every existing weekly_scores row for this league from its
 * underlying weekly_stats row, using the current (just-updated) full rule
 * set — not just the one changed stat, since other rules may interact.
 * Rows with no matching weekly_stats (shouldn't normally happen) are left
 * alone rather than zeroed out.
 */
async function recalculatePastScores(
  ctx: CommishContext,
  leagueId: string,
  changeId: string,
): Promise<{ scores: number; weeks: number }> {
  const { data: rulesData } = await ctx.supabase
    .from("scoring_rules")
    .select("*")
    .eq("league_id", leagueId)
  const scoringRules = (rulesData ?? []) as ScoringRule[]

  const { data: scores } = await ctx.supabase
    .from("weekly_scores")
    .select("id, week, punter_id, points")
    .eq("league_id", leagueId)
  if (!scores || scores.length === 0) return { scores: 0, weeks: 0 }

  const { data: leagueRow } = await ctx.supabase
    .from("leagues")
    .select("season")
    .eq("id", leagueId)
    .maybeSingle()
  const season = (leagueRow?.season as string | undefined) ?? ""

  const punterIds = [...new Set(scores.map((s) => s.punter_id as string))]
  const { data: puntersData } = await ctx.supabase
    .from("punters")
    .select("id, player_id")
    .in("id", punterIds)
  const playerIdByPunter = new Map(
    (puntersData ?? []).map((p) => [p.id as string, p.player_id as string]),
  )

  const weeks = [...new Set(scores.map((s) => s.week as number))]
  const { data: statsData } = await ctx.supabase
    .from("weekly_stats")
    .select("*")
    .eq("season", season)
    .in("week", weeks)
  const statByKey = new Map<string, Record<string, unknown>>()
  for (const st of (statsData ?? []) as Record<string, unknown>[]) {
    statByKey.set(`${st.week}:${st.player_id}`, st)
  }

  let updated = 0
  const touchedWeeks = new Set<number>()
  for (const s of scores) {
    const playerId = playerIdByPunter.get(s.punter_id as string)
    if (!playerId) continue
    const stats = statByKey.get(`${s.week}:${playerId}`)
    if (!stats) continue

    const newPoints = calculateFantasyPoints(
      stats as unknown as Pick<WeeklyStats, StatKey>,
      scoringRules,
    )
    if (newPoints === Number(s.points)) continue

    const { error } = await ctx.supabase
      .from("weekly_scores")
      .update({ points: newPoints, scoring_rules_version: changeId })
      .eq("id", s.id as string)
    if (!error) {
      updated++
      touchedWeeks.add(s.week as number)
    }
  }

  return { scores: updated, weeks: touchedWeeks.size }
}
