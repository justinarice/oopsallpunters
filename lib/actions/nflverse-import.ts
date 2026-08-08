"use server"

// Fetching+parsing a ~98MB season file needs more than the default function
// duration. Hobby's ceiling is 300s (confirmed against this project's actual
// Vercel plan) — request the full allowance rather than whatever the
// unconfigured default is.
export const maxDuration = 300

import { createHash } from "node:crypto"
import { z } from "zod"
import { requireCommissioner, type ActionResult } from "@/lib/actions/guard"
import { forEachCsvRow } from "@/lib/csv"
import { finalizeImport, type ImportWeeklyStatsResult, type MatchedStatRow } from "@/lib/actions/import"

const PBP_BASE = "https://github.com/nflverse/nflverse-data/releases/download/pbp"

// The exact play-by-play columns this import needs. Punting detail (gross
// yards, touchbacks, inside-20, etc.) isn't in a dedicated "punters" table —
// nflverse only ships play-by-play, so every punt stat here is derived by
// filtering to punt_attempt == 1 rows and aggregating per punter/week.
const NEEDED_COLUMNS = [
  "week",
  "punt_attempt",
  "punter_player_id",
  "kick_distance",
  "touchback",
  "punt_inside_twenty",
  "punt_fair_catch",
  "punt_blocked",
  "punt_downed",
  "punt_out_of_bounds",
  "punt_in_endzone",
  "return_yards",
] as const

interface PuntPlay {
  playerId: string
  kickDistance: number
  returnYards: number
  touchback: boolean
  insideTwenty: boolean
  fairCatch: boolean
  blocked: boolean
  downed: boolean
  outOfBounds: boolean
  inEndzone: boolean
}

interface PunterWeekAgg {
  attempts: number
  grossYards: number
  returnYards: number
  longest: number
  touchbacks: number
  insideTwenty: number
  fairCatches: number
  blocked: number
  returned: number
}

const schema = z.object({
  leagueId: z.string().uuid(),
  week: z.coerce.number().int().min(1).max(23),
  force: z.union([z.literal("true"), z.literal("false")]).default("false"),
})

/**
 * Imports one week's punter stats from nflverse's play-by-play data.
 *
 * There's no standalone punting table in nflverse — punting detail is
 * derived from filtering the full play-by-play feed to punt plays. The feed
 * is one ~98MB CSV per season (no per-week endpoint), so this parses it in a
 * single streaming pass that projects down to the ~12 columns needed and
 * discards everything else per row, rather than holding a fully parsed
 * 372-column table in memory.
 *
 * Two known gaps versus a full stat provider:
 *   - net_yards isn't an nflverse column; it's approximated here as
 *     gross_yards - return_yards (the standard net-punting definition),
 *     which won't always exactly match official NFL touchback-adjusted net
 *     punting figures.
 *   - surrender_index (Puntalytics' own derived metric, not part of raw
 *     play-by-play) is left null rather than guessed.
 */
export async function importWeeklyStatsFromNflverse(
  _prev: ActionResult<ImportWeeklyStatsResult> | null,
  formData: FormData,
): Promise<ActionResult<ImportWeeklyStatsResult>> {
  const parsed = schema.safeParse({
    leagueId: formData.get("leagueId"),
    week: formData.get("week"),
    force: formData.get("force") ?? "false",
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." }
  }
  const { leagueId, week, force } = parsed.data

  try {
    const ctx = await requireCommissioner(leagueId)

    const { data: leagueRow, error: leagueError } = await ctx.supabase
      .from("leagues")
      .select("season")
      .eq("id", leagueId)
      .maybeSingle()
    if (leagueError || !leagueRow) {
      return { ok: false, error: leagueError?.message ?? "League not found." }
    }
    const season = leagueRow.season as string

    const url = `${PBP_BASE}/play_by_play_${season}.csv`
    let res: Response
    try {
      res = await fetch(url)
    } catch (e) {
      return { ok: false, error: `Could not reach nflverse (${(e as Error).message}).` }
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `nflverse has no play-by-play file for season ${season} (HTTP ${res.status}). It's usually published within a few days of each season starting.`,
      }
    }
    const text = await res.text()

    // --- Streaming parse: resolve column indices from the header once,
    // then for every subsequent row keep only punt plays for the requested
    // week, immediately discarding the other ~360 columns. Building a full
    // parsed table here (45k rows x 372 columns) would retain hundreds of
    // MB of short-string overhead alone — this instead retains only the
    // handful of punt plays that actually happened in the requested week. ---
    let colIndex: Record<string, number> | null = null
    const puntPlays: PuntPlay[] = []
    let headerError: string | null = null

    forEachCsvRow(text, (fields, rowIndex) => {
      if (headerError) return
      if (rowIndex === 0) {
        const map: Record<string, number> = {}
        fields.forEach((h, i) => (map[h.trim()] = i))
        for (const col of NEEDED_COLUMNS) {
          if (!(col in map)) {
            headerError = `nflverse's data is missing an expected column ("${col}") — their schema may have changed.`
            return
          }
        }
        colIndex = map
        return
      }
      if (!colIndex) return
      const idx = colIndex
      if (fields[idx.week] !== String(week)) return
      if (fields[idx.punt_attempt] !== "1") return
      const playerId = fields[idx.punter_player_id]
      if (!playerId) return

      puntPlays.push({
        playerId,
        kickDistance: Number(fields[idx.kick_distance]) || 0,
        returnYards: Number(fields[idx.return_yards]) || 0,
        touchback: fields[idx.touchback] === "1",
        insideTwenty: fields[idx.punt_inside_twenty] === "1",
        fairCatch: fields[idx.punt_fair_catch] === "1",
        blocked: fields[idx.punt_blocked] === "1",
        downed: fields[idx.punt_downed] === "1",
        outOfBounds: fields[idx.punt_out_of_bounds] === "1",
        inEndzone: fields[idx.punt_in_endzone] === "1",
      })
    })

    if (headerError) return { ok: false, error: headerError }
    if (puntPlays.length === 0) {
      return {
        ok: false,
        error: `No punt plays found for week ${week} of the ${season} season in nflverse's data yet. The week may not have been played or charted.`,
      }
    }

    const byPlayer = new Map<string, PunterWeekAgg>()
    for (const p of puntPlays) {
      const a: PunterWeekAgg = byPlayer.get(p.playerId) ?? {
        attempts: 0,
        grossYards: 0,
        returnYards: 0,
        longest: 0,
        touchbacks: 0,
        insideTwenty: 0,
        fairCatches: 0,
        blocked: 0,
        returned: 0,
      }
      a.attempts += 1
      a.grossYards += p.kickDistance
      a.returnYards += p.returnYards
      a.longest = Math.max(a.longest, p.kickDistance)
      if (p.touchback) a.touchbacks += 1
      if (p.insideTwenty) a.insideTwenty += 1
      if (p.fairCatch) a.fairCatches += 1
      if (p.blocked) a.blocked += 1
      // A punt counts as "returned" only if it wasn't fair caught, a
      // touchback, blocked, downed, out of bounds, or dead in the end zone
      // — i.e. the returner actually fielded and ran it.
      if (!p.fairCatch && !p.touchback && !p.blocked && !p.downed && !p.outOfBounds && !p.inEndzone) {
        a.returned += 1
      }
      byPlayer.set(p.playerId, a)
    }

    const { data: punters, error: puntersError } = await ctx.supabase
      .from("punters")
      .select("id, player_id")
    if (puntersError) return { ok: false, error: puntersError.message }
    const punterIdByPlayerId = new Map(
      (punters ?? []).map((p) => [p.player_id as string, p.id as string]),
    )

    const matchedRows: MatchedStatRow[] = []
    const unmatchedRows: string[] = []
    for (const [playerId, a] of byPlayer) {
      const punterId = punterIdByPlayerId.get(playerId)
      if (!punterId) {
        unmatchedRows.push(playerId)
        continue
      }
      matchedRows.push({
        punterId,
        playerId,
        stats: {
          attempts: a.attempts,
          gross_yards: a.grossYards,
          // Approximated as gross - return (standard net-punting formula);
          // not sourced from an official column. See module doc comment.
          net_yards: a.grossYards - a.returnYards,
          average: a.attempts > 0 ? Math.round((a.grossYards / a.attempts) * 10) / 10 : 0,
          longest: a.longest,
          inside_20: a.insideTwenty,
          touchbacks: a.touchbacks,
          fair_catches: a.fairCatches,
          returned: a.returned,
          return_yards: a.returnYards,
          blocked: a.blocked,
          surrender_index: null,
        },
      })
    }

    if (matchedRows.length === 0) {
      return {
        ok: false,
        error: `Found ${byPlayer.size} punter(s) in nflverse's week ${week} data, but none matched your punter catalog (player_id).`,
      }
    }

    // Hash the post-aggregation result, not the raw fetch — so an identical
    // recomputed value is correctly flagged as a duplicate, but an upstream
    // stat correction (different aggregated numbers) is not blocked.
    const sourceHash = createHash("sha256")
      .update(JSON.stringify(matchedRows.map((r) => [r.playerId, r.stats])))
      .digest("hex")

    return finalizeImport(ctx, {
      leagueId,
      week,
      season,
      source: "nflverse",
      sourceHash,
      force: force === "true",
      matchedRows,
      unmatchedRows,
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
