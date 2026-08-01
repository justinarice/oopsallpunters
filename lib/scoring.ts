import type { ScoringRule, WeeklyStats, StatKey } from './types'

/**
 * The one and only scoring engine. Point values are NEVER hardcoded here —
 * every value comes from `scoringRules`, which is data-driven from the
 * `scoring_rules` table. Adding or changing scoring requires zero code changes.
 *
 * This is a pure function: same inputs always produce the same output, which
 * makes retroactive recalculation (§10) safe and auditable.
 */
export function calculateFantasyPoints(
  playerStats: Pick<WeeklyStats, StatKey> | Partial<Record<StatKey, number>>,
  scoringRules: ScoringRule[],
): number {
  let total = 0

  for (const rule of scoringRules) {
    const raw = playerStats[rule.stat]
    if (raw == null || Number.isNaN(raw)) continue

    switch (rule.modifier) {
      case 'each':
      case 'per_yard':
        total += raw * rule.points
        break
      case 'per_10':
        total += (raw / 10) * rule.points
        break
      case 'flat':
        // Flat award applies once if the stat is present and non-zero.
        total += raw !== 0 ? rule.points : 0
        break
      default:
        break
    }
  }

  // Round to 2 decimals to avoid floating point noise in stored scores.
  return Math.round(total * 100) / 100
}
