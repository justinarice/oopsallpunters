import "server-only"

import { createClient } from "@/lib/supabase/server"
import type {
  AssignmentView,
  AuditLogEntry,
  ImportHistory,
  League,
  Punter,
  PunterWithOwner,
  ScoringRule,
  StandingRow,
  Team,
  TradeView,
} from "@/lib/types"

// ---------------------------------------------------------------------------
// Public reads. All of these run under RLS with anonymous SELECT access, so
// they work for logged-out visitors exactly as the plan (§7) requires.
// ---------------------------------------------------------------------------

export async function getLeagues(): Promise<League[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("leagues")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[v0] getLeagues error:", error.message)
    return []
  }
  return data ?? []
}

export async function getLeagueBySlug(slug: string): Promise<League | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("leagues")
    .select("*")
    .eq("slug", slug)
    .maybeSingle()
  if (error) {
    console.error("[v0] getLeagueBySlug error:", error.message)
    return null
  }
  return data
}

export async function getTeams(leagueId: string): Promise<Team[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("league_id", leagueId)
    .order("team_name")
  if (error) {
    console.error("[v0] getTeams error:", error.message)
    return []
  }
  return data ?? []
}

export async function getPunters(): Promise<Punter[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("punters")
    .select("*")
    .order("name")
  if (error) {
    console.error("[v0] getPunters error:", error.message)
    return []
  }
  return data ?? []
}

/** Active (ended_at IS NULL) roster assignments joined to team + punter. */
export async function getActiveAssignments(
  leagueId: string,
): Promise<AssignmentView[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("roster_assignments")
    .select("id, assigned_at, teams(*), punters(*)")
    .eq("league_id", leagueId)
    .is("ended_at", null)
  if (error) {
    console.error("[v0] getActiveAssignments error:", error.message)
    return []
  }
  return (data ?? [])
    .filter((r) => r.teams && r.punters)
    .map((r) => ({
      id: r.id as string,
      assigned_at: r.assigned_at as string,
      team: r.teams as unknown as Team,
      punter: r.punters as unknown as Punter,
    }))
}

export async function getScoringRules(
  leagueId: string,
): Promise<ScoringRule[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scoring_rules")
    .select("*")
    .eq("league_id", leagueId)
    .order("stat")
  if (error) {
    console.error("[v0] getScoringRules error:", error.message)
    return []
  }
  return (data ?? []) as ScoringRule[]
}

export async function getTrades(leagueId: string): Promise<TradeView[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("trades")
    .select(
      "id, date, notes, punters(name), from_team:teams!trades_from_team_fkey(team_name), to_team:teams!trades_to_team_fkey(team_name)",
    )
    .eq("league_id", leagueId)
    .order("date", { ascending: false })
  if (error) {
    console.error("[v0] getTrades error:", error.message)
    return []
  }
  return (data ?? []).map((r) => {
    const from = r.from_team as unknown as { team_name: string } | null
    const to = r.to_team as unknown as { team_name: string } | null
    const punter = r.punters as unknown as { name: string } | null
    return {
      id: r.id as string,
      date: r.date as string,
      from_team: from?.team_name ?? null,
      to_team: to?.team_name ?? "—",
      punter: punter?.name ?? "—",
      notes: (r.notes as string) ?? null,
    }
  })
}

export async function getAuditLog(leagueId: string): Promise<AuditLogEntry[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, ts, actor_name, action, before, after")
    .eq("league_id", leagueId)
    .order("ts", { ascending: false })
  if (error) {
    console.error("[v0] getAuditLog error:", error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    timestamp: r.ts as string,
    user: (r.actor_name as string) ?? "Commissioner",
    action: r.action as string,
    before: (r.before as Record<string, unknown>) ?? null,
    after: (r.after as Record<string, unknown>) ?? null,
  }))
}

export async function getImportHistory(
  leagueId: string,
): Promise<ImportHistory[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("import_history")
    .select("*")
    .eq("league_id", leagueId)
    .order("date", { ascending: false })
  if (error) {
    console.error("[v0] getImportHistory error:", error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    week: r.week as number,
    season: r.season as string,
    date: r.date as string,
    user: "Commissioner",
    source: r.source as ImportHistory["source"],
    status: r.status as ImportHistory["status"],
    source_hash: (r.source_hash as string) ?? "",
  }))
}

/**
 * Standings, computed in TS from weekly_scores. Before any scores exist
 * (Phase 2), every team shows 0 points and is ordered by name — the page
 * still renders a complete, real roster.
 */
export async function getStandings(leagueId: string): Promise<StandingRow[]> {
  const supabase = await createClient()
  const [teams, assignments] = await Promise.all([
    getTeams(leagueId),
    getActiveAssignments(leagueId),
  ])

  const punterByTeam = new Map<string, Punter>()
  for (const a of assignments) punterByTeam.set(a.team.id, a.punter)

  const { data: scores, error } = await supabase
    .from("weekly_scores")
    .select("team_id, points, week")
    .eq("league_id", leagueId)
  if (error) console.error("[v0] getStandings scores error:", error.message)

  const seasonByTeam = new Map<string, number>()
  const maxWeek = (scores ?? []).reduce(
    (m, s) => Math.max(m, (s.week as number) ?? 0),
    0,
  )
  const lastWeekByTeam = new Map<string, number>()
  for (const s of scores ?? []) {
    const tid = s.team_id as string
    const pts = Number(s.points) || 0
    seasonByTeam.set(tid, (seasonByTeam.get(tid) ?? 0) + pts)
    if ((s.week as number) === maxWeek) {
      lastWeekByTeam.set(tid, (lastWeekByTeam.get(tid) ?? 0) + pts)
    }
  }

  const rows = teams.map((team) => ({
    team,
    punter: punterByTeam.get(team.id) ?? null,
    seasonPoints: seasonByTeam.get(team.id) ?? 0,
    lastWeekPoints: maxWeek > 0 ? (lastWeekByTeam.get(team.id) ?? 0) : null,
    rank: 0,
  }))

  rows.sort(
    (a, b) =>
      b.seasonPoints - a.seasonPoints ||
      a.team.team_name.localeCompare(b.team.team_name),
  )
  rows.forEach((r, i) => (r.rank = i + 1))
  return rows
}

export interface WeeklyResultRow {
  id: string
  week: number
  season: string
  player_id: string
  attempts: number
  gross_yards: number
  net_yards: number
  average: number
  longest: number
  inside_20: number
  touchbacks: number
  fair_catches: number
  returned: number
  return_yards: number
  blocked: number
  surrender_index: number | null
  source_import_id: string
  punterName: string
  owner: string
  points: number
}

/**
 * Weekly results: per-week punter stats joined with the calculated score and
 * current owner. Returns the weeks that have any scores (fallback [1] so the
 * "not imported yet" empty state renders).
 */
export async function getWeeklyResults(
  leagueId: string,
  season: string,
): Promise<{ weeks: number[]; rowsByWeek: Record<number, WeeklyResultRow[]> }> {
  const supabase = await createClient()

  const [{ data: scores }, punters, assignments] = await Promise.all([
    supabase
      .from("weekly_scores")
      .select("week, points, team_id, punter_id")
      .eq("league_id", leagueId),
    getPunters(),
    getActiveAssignments(leagueId),
  ])

  const weeksSet = new Set<number>()
  for (const s of scores ?? []) weeksSet.add(s.week as number)
  const weeks = [...weeksSet].sort((a, b) => a - b)
  if (weeks.length === 0) return { weeks: [1], rowsByWeek: { 1: [] } }

  const { data: stats } = await supabase
    .from("weekly_stats")
    .select("*")
    .eq("season", season)
    .in("week", weeks)

  const punterById = new Map(punters.map((p) => [p.id, p]))
  const teamByPunter = new Map<string, Team>()
  for (const a of assignments) teamByPunter.set(a.punter.id, a.team)

  const statByKey = new Map<string, (typeof stats)[number]>()
  for (const st of stats ?? [])
    statByKey.set(`${st.week}:${st.player_id}`, st)

  const rowsByWeek: Record<number, WeeklyResultRow[]> = {}
  for (const w of weeks) rowsByWeek[w] = []

  for (const s of scores ?? []) {
    const week = s.week as number
    const punter = punterById.get(s.punter_id as string)
    if (!punter) continue
    const st = statByKey.get(`${week}:${punter.player_id}`)
    const owner = teamByPunter.get(punter.id)
    rowsByWeek[week].push({
      id: `${week}:${punter.id}`,
      week,
      season,
      player_id: punter.player_id,
      attempts: (st?.attempts as number) ?? 0,
      gross_yards: (st?.gross_yards as number) ?? 0,
      net_yards: (st?.net_yards as number) ?? 0,
      average: st?.average != null ? Number(st.average) : 0,
      longest: (st?.longest as number) ?? 0,
      inside_20: (st?.inside_20 as number) ?? 0,
      touchbacks: (st?.touchbacks as number) ?? 0,
      fair_catches: (st?.fair_catches as number) ?? 0,
      returned: (st?.returned as number) ?? 0,
      return_yards: (st?.return_yards as number) ?? 0,
      blocked: (st?.blocked as number) ?? 0,
      surrender_index:
        st?.surrender_index != null ? Number(st.surrender_index) : null,
      source_import_id: (st?.source_import_id as string) ?? "",
      punterName: punter.name,
      owner: owner?.team_name ?? "Unowned",
      points: Number(s.points) || 0,
    })
  }

  // keep punterByPlayerId referenced for potential future use
  void punterByPlayerId

  for (const w of weeks)
    rowsByWeek[w].sort((a, b) => b.points - a.points)

  return { weeks, rowsByWeek }
}

/** Punters catalog joined with their current owner in this league. */
export async function getPuntersWithOwners(
  leagueId: string,
): Promise<PunterWithOwner[]> {
  const [punters, assignments] = await Promise.all([
    getPunters(),
    getActiveAssignments(leagueId),
  ])
  const ownerByPunter = new Map<string, Team>()
  for (const a of assignments) ownerByPunter.set(a.punter.id, a.team)
  return punters.map((punter) => ({
    punter,
    ownerTeam: ownerByPunter.get(punter.id) ?? null,
  }))
}
