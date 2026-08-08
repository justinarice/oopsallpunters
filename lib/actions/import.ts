"use server"

import { revalidatePath } from "next/cache"
import { createHash } from "node:crypto"
import { z } from "zod"
import {
  logAction,
  requireCommissioner,
  type ActionResult,
  type CommishContext,
} from "@/lib/actions/guard"
import { parseCsv, type CsvRow } from "@/lib/csv"
import { calculateFantasyPoints } from "@/lib/scoring"
import type { ScoringRule, StatKey, WeeklyStats } from "@/lib/types"

const STAT_KEYS: StatKey[] = [
  "attempts",
  "gross_yards",
  "net_yards",
  "average",
  "longest",
  "inside_20",
  "touchbacks",
  "fair_catches",
  "returned",
  "return_yards",
  "blocked",
  "surrender_index",
]

// Common header spellings/aliases a commissioner might paste in, mapped to
// our canonical column names. Matching is case-insensitive and ignores
// spaces/dashes/underscores entirely, so "Gross Yards", "gross-yards", and
// "GROSSYARDS" all resolve the same way.
const HEADER_ALIASES: Record<string, string> = {
  playerid: "player_id",
  gsisid: "player_id",
  id: "player_id",
  player: "name",
  playername: "name",
  punter: "name",
  att: "attempts",
  punts: "attempts",
  yds: "gross_yards",
  grossyards: "gross_yards",
  grossyds: "gross_yards",
  netyards: "net_yards",
  netyds: "net_yards",
  net: "net_yards",
  avg: "average",
  lng: "longest",
  long: "longest",
  longestpunt: "longest",
  in20: "inside_20",
  inside20: "inside_20",
  tb: "touchbacks",
  touchback: "touchbacks",
  fc: "fair_catches",
  faircatch: "fair_catches",
  faircatches: "fair_catches",
  ret: "returned",
  returns: "returned",
  rety: "return_yards",
  returnyards: "return_yards",
  retyds: "return_yards",
  blk: "blocked",
  blocks: "blocked",
  surrenderindex: "surrender_index",
}

function normalizeKey(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[\s\-_]+/g, "")
  return HEADER_ALIASES[key] ?? raw.trim().toLowerCase().replace(/[\s-]+/g, "_")
}

/** Re-keys a raw CSV row (whatever headers were in the file) onto our
 *  canonical column names, so downstream code never deals with header
 *  variance. */
function normalizeRow(row: CsvRow): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) out[normalizeKey(k)] = v
  return out
}

function toNumber(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null
  const n = Number(v.replace(/,/g, ""))
  return Number.isNaN(n) ? null : n
}

export interface MatchedStatRow {
  punterId: string
  playerId: string
  stats: Record<string, number | null>
}

export interface ImportWeeklyStatsResult {
  matched: number
  unmatchedRows: string[]
  scoresWritten: number
}

/**
 * Shared finalize step for BOTH import sources (CSV upload and nflverse):
 * dedupe check, import_history bookkeeping, raw weekly_stats insert, score
 * calculation via the shared scoring engine, and weekly_scores upsert.
 * Keeping this in one place means the two sources can never silently drift
 * in how they write to the database.
 *
 *   - Raw stats are APPEND-ONLY: a re-import for a corrected week adds new
 *     weekly_stats rows rather than overwriting; downstream reads pick the
 *     most recent row per (week, player_id), so a correction naturally wins.
 *   - weekly_scores is unique on (league_id, week, punter_id), so re-imports
 *     update in place rather than double-counting standings.
 */
export async function finalizeImport(
  ctx: CommishContext,
  params: {
    leagueId: string
    week: number
    season: string
    source: "csv_upload" | "nflverse"
    sourceHash: string
    force: boolean
    matchedRows: MatchedStatRow[]
    unmatchedRows: string[]
  },
): Promise<ActionResult<ImportWeeklyStatsResult>> {
  const { leagueId, week, season, source, sourceHash, force, matchedRows, unmatchedRows } = params

  if (!force) {
    const { data: dupe } = await ctx.supabase
      .from("import_history")
      .select("id, date")
      .eq("league_id", leagueId)
      .eq("week", week)
      .eq("source_hash", sourceHash)
      .eq("status", "success")
      .maybeSingle()
    if (dupe) {
      return {
        ok: false,
        error: `This exact data was already imported for week ${week} on ${new Date(dupe.date as string).toLocaleDateString()}. Check "force re-import" if this is intentional.`,
      }
    }
  }

  const { data: importRow, error: importInsertError } = await ctx.supabase
    .from("import_history")
    .insert({
      league_id: leagueId,
      week,
      season,
      imported_by: ctx.userId,
      source,
      status: "pending",
      source_hash: sourceHash,
    })
    .select("id")
    .single()
  if (importInsertError || !importRow) {
    return { ok: false, error: importInsertError?.message ?? "Could not start import." }
  }
  const importId = importRow.id as string

  const statInserts = matchedRows.map((r) => ({
    week,
    season,
    player_id: r.playerId,
    ...r.stats,
    source_import_id: importId,
  }))
  const { error: statsError } = await ctx.supabase.from("weekly_stats").insert(statInserts)
  if (statsError) {
    await ctx.supabase
      .from("import_history")
      .update({ status: "failed", message: statsError.message })
      .eq("id", importId)
    return { ok: false, error: statsError.message }
  }

  const { data: rulesData } = await ctx.supabase
    .from("scoring_rules")
    .select("*")
    .eq("league_id", leagueId)
  const scoringRules = (rulesData ?? []) as ScoringRule[]

  const { data: assignments } = await ctx.supabase
    .from("roster_assignments")
    .select("team_id, punter_id")
    .eq("league_id", leagueId)
    .is("ended_at", null)
  const teamByPunter = new Map(
    (assignments ?? []).map((a) => [a.punter_id as string, a.team_id as string]),
  )

  const calculatedAt = new Date().toISOString()
  const scoreRows = matchedRows.map((r) => ({
    league_id: leagueId,
    week,
    team_id: teamByPunter.get(r.punterId) ?? null,
    punter_id: r.punterId,
    points: calculateFantasyPoints(
      r.stats as unknown as Pick<WeeklyStats, StatKey>,
      scoringRules,
    ),
    calculated_at: calculatedAt,
  }))

  const { error: scoresError } = await ctx.supabase
    .from("weekly_scores")
    .upsert(scoreRows, { onConflict: "league_id,week,punter_id" })
  if (scoresError) {
    await ctx.supabase
      .from("import_history")
      .update({ status: "failed", message: scoresError.message })
      .eq("id", importId)
    return { ok: false, error: scoresError.message }
  }

  await ctx.supabase
    .from("import_history")
    .update({
      status: "success",
      message: `${matchedRows.length} matched, ${unmatchedRows.length} unmatched`,
    })
    .eq("id", importId)

  await logAction(
    ctx,
    `Imported week ${week} stats via ${source === "nflverse" ? "nflverse" : "CSV upload"} (${matchedRows.length} punters, ${unmatchedRows.length} unmatched)`,
    null,
    { week, source, matched: matchedRows.length, unmatched: unmatchedRows },
  )

  revalidatePath(`/league/${ctx.slug}`, "layout")
  revalidatePath("/dashboard")
  return {
    ok: true,
    data: { matched: matchedRows.length, unmatchedRows, scoresWritten: scoreRows.length },
  }
}

const importSchema = z.object({
  leagueId: z.string().uuid(),
  week: z.coerce.number().int().min(1).max(23),
  csvText: z.string().min(1, "Paste or upload a CSV first."),
  force: z.union([z.literal("true"), z.literal("false")]).default("false"),
})

/**
 * Imports one week's punter stats from a commissioner-provided CSV.
 * Matches rows to punters by player_id (preferred) or name, optionally
 * disambiguated by team, then hands off to finalizeImport.
 */
export async function importWeeklyStats(
  _prev: ActionResult<ImportWeeklyStatsResult> | null,
  formData: FormData,
): Promise<ActionResult<ImportWeeklyStatsResult>> {
  const parsed = importSchema.safeParse({
    leagueId: formData.get("leagueId"),
    week: formData.get("week"),
    csvText: formData.get("csvText"),
    force: formData.get("force") ?? "false",
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." }
  }
  const { leagueId, week, csvText, force } = parsed.data

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

    const sourceHash = createHash("sha256").update(csvText.trim()).digest("hex")

    const rows = parseCsv(csvText).map(normalizeRow)
    if (rows.length === 0) {
      return { ok: false, error: "No data rows found in that CSV." }
    }

    const { data: punters, error: puntersError } = await ctx.supabase
      .from("punters")
      .select("id, player_id, name, team")
    if (puntersError) return { ok: false, error: puntersError.message }

    const punterByPlayerId = new Map(
      (punters ?? []).map((p) => [(p.player_id as string).toLowerCase(), p]),
    )
    const puntersByName = new Map<string, typeof punters>()
    for (const p of punters ?? []) {
      const key = (p.name as string).trim().toLowerCase()
      const list = puntersByName.get(key) ?? []
      list.push(p)
      puntersByName.set(key, list as typeof punters)
    }

    const matchedRows: MatchedStatRow[] = []
    const unmatchedRows: string[] = []

    for (const row of rows) {
      let punter: { id: string; player_id: string } | undefined

      const playerIdVal = row.player_id?.trim()
      if (playerIdVal) {
        punter = punterByPlayerId.get(playerIdVal.toLowerCase()) as
          | { id: string; player_id: string }
          | undefined
      }
      if (!punter && row.name?.trim()) {
        const candidates = (puntersByName.get(row.name.trim().toLowerCase()) ?? []) as {
          id: string
          player_id: string
          team: string | null
        }[]
        if (candidates.length === 1) {
          punter = candidates[0]
        } else if (candidates.length > 1 && row.team?.trim()) {
          punter = candidates.find(
            (c) => (c.team ?? "").toLowerCase() === row.team.trim().toLowerCase(),
          )
        }
      }

      if (!punter) {
        unmatchedRows.push(playerIdVal || row.name || JSON.stringify(row))
        continue
      }

      const stats: Record<string, number | null> = {}
      for (const key of STAT_KEYS) stats[key] = toNumber(row[key])
      matchedRows.push({ punterId: punter.id, playerId: punter.player_id, stats })
    }

    if (matchedRows.length === 0) {
      return {
        ok: false,
        error: `None of the ${rows.length} rows matched a punter in the catalog. Check the player_id/name column.`,
      }
    }

    return finalizeImport(ctx, {
      leagueId,
      week,
      season,
      source: "csv_upload",
      sourceHash,
      force: force === "true",
      matchedRows,
      unmatchedRows,
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
