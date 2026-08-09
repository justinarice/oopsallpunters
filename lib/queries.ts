import "server-only"

import { createClient } from "@/lib/supabase/server"
import type {
  AssignmentView,
  AuditLogEntry,
  DraftPick,
  DraftQueueEntryView,
  DraftSettings,
  DraftState,
  ImportHistory,
  League,
  Punter,
  PunterWithOwner,
  ScoringRule,
  StandingRow,
  Team,
  TeamInvite,
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

/**
 * Leagues where the current signed-in user is the commissioner. Used by the
 * dashboard. Returns [] for anonymous users.
 */
export async function getMyLeagues(): Promise<League[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from("leagues")
    .select("*")
    .eq("commissioner_id", user.id)
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[v0] getMyLeagues error:", error.message)
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

/**
 * Commissioner-only (see migration 0008 — team_invites has no public-select
 * policy, since it holds bearer-token secrets). RLS returns an empty result
 * rather than an error for anyone else calling this, matching the pattern
 * of every other read in this file.
 */
export async function getTeamInvites(leagueId: string): Promise<TeamInvite[]> {
  const supabase = await createClient()
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("league_id", leagueId)
  const teamIds = (teams ?? []).map((t) => t.id as string)
  if (teamIds.length === 0) return []

  const { data, error } = await supabase
    .from("team_invites")
    .select("*")
    .in("team_id", teamIds)
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[v0] getTeamInvites error:", error.message)
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
 *
 * When the league is linked to Sleeper and has synced weeks (see
 * lib/actions/sleeper.ts), each row also gets sleeperPoints/combinedPoints
 * and ranking switches to combined total — otherwise those fields are null
 * and ranking stays punter-points-only, exactly as before.
 */
export async function getStandings(leagueId: string): Promise<StandingRow[]> {
  const supabase = await createClient()
  const [teams, assignments, league] = await Promise.all([
    getTeams(leagueId),
    getActiveAssignments(leagueId),
    supabase
      .from("leagues")
      .select("sleeper_league_id")
      .eq("id", leagueId)
      .maybeSingle()
      .then((r) => r.data),
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

  // Sleeper points are only meaningful for a linked league — skip the query
  // entirely otherwise so unlinked leagues (the common case today) pay no
  // extra cost.
  const sleeperByTeam = new Map<string, number>()
  if (league?.sleeper_league_id) {
    const { data: sleeperPoints, error: swpError } = await supabase
      .from("sleeper_weekly_points")
      .select("team_id, points")
      .eq("league_id", leagueId)
      .not("team_id", "is", null)
    if (swpError)
      console.error("[v0] getStandings sleeper points error:", swpError.message)
    for (const s of sleeperPoints ?? []) {
      const tid = s.team_id as string
      sleeperByTeam.set(tid, (sleeperByTeam.get(tid) ?? 0) + (Number(s.points) || 0))
    }
  }

  const isLinked = !!league?.sleeper_league_id

  const rows = teams.map((team) => {
    const seasonPoints = seasonByTeam.get(team.id) ?? 0
    const sleeperPoints = isLinked ? (sleeperByTeam.get(team.id) ?? 0) : null
    return {
      team,
      punter: punterByTeam.get(team.id) ?? null,
      seasonPoints,
      lastWeekPoints: maxWeek > 0 ? (lastWeekByTeam.get(team.id) ?? 0) : null,
      sleeperPoints,
      combinedPoints: sleeperPoints != null ? seasonPoints + sleeperPoints : null,
      rank: 0,
    }
  })

  rows.sort((a, b) => {
    if (isLinked) {
      return (
        (b.combinedPoints ?? 0) - (a.combinedPoints ?? 0) ||
        a.team.team_name.localeCompare(b.team.team_name)
      )
    }
    return (
      b.seasonPoints - a.seasonPoints ||
      a.team.team_name.localeCompare(b.team.team_name)
    )
  })
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

  // Ordered oldest-first: when a corrected re-import produces a second
  // weekly_stats row for the same (week, player_id), the Map below keeps
  // whichever it sees LAST, so ascending order means the most recent
  // import always wins — without ever deleting the original row.
  const { data: stats } = await supabase
    .from("weekly_stats")
    .select("*")
    .eq("season", season)
    .in("week", weeks)
    .order("created_at", { ascending: true })

  const punterById = new Map(punters.map((p) => [p.id, p]))
  const teamByPunter = new Map<string, Team>()
  for (const a of assignments) teamByPunter.set(a.punter.id, a.team)

  type StatRow = Record<string, unknown>
  const statByKey = new Map<string, StatRow>()
  for (const st of (stats ?? []) as StatRow[])
    statByKey.set(`${st.week}:${st.player_id}`, st)

  const rowsByWeek: Record<number, WeeklyResultRow[]> = {}
  for (const w of weeks) rowsByWeek[w] = []

  for (const s of scores ?? []) {
    const week = s.week as number
    const punter = punterById.get(s.punter_id as string)
    if (!punter) continue
    const st = statByKey.get(`${week}:${punter.player_id}`)
    const owner = teamByPunter.get(punter.id)
    const num = (v: unknown) => (v == null ? 0 : Number(v))
    rowsByWeek[week].push({
      id: `${week}:${punter.id}`,
      week,
      season,
      player_id: punter.player_id,
      attempts: num(st?.attempts),
      gross_yards: num(st?.gross_yards),
      net_yards: num(st?.net_yards),
      average: num(st?.average),
      longest: num(st?.longest),
      inside_20: num(st?.inside_20),
      touchbacks: num(st?.touchbacks),
      fair_catches: num(st?.fair_catches),
      returned: num(st?.returned),
      return_yards: num(st?.return_yards),
      blocked: num(st?.blocked),
      surrender_index:
        st?.surrender_index != null ? Number(st.surrender_index) : null,
      source_import_id: (st?.source_import_id as string) ?? "",
      punterName: punter.name,
      owner: owner?.team_name ?? "Unowned",
      points: Number(s.points) || 0,
    })
  }

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

// ---------------------------------------------------------------------------
// Punter draft reads. All public-select (see migration 0012) — anyone can
// watch a draft, not just participants.
// ---------------------------------------------------------------------------

/** Null when the commissioner hasn't configured a draft yet — callers should
 *  treat that the same as { pick_seconds: 90, team_order: [], status:
 *  'not_started' } rather than an error. */
export async function getDraftSettings(
  leagueId: string,
): Promise<DraftSettings | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("draft_settings")
    .select("*")
    .eq("league_id", leagueId)
    .maybeSingle()
  if (error) {
    console.error("[v0] getDraftSettings error:", error.message)
    return null
  }
  return data
}

/** Null before a draft has ever started (no draft_state row yet). */
export async function getDraftState(leagueId: string): Promise<DraftState | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("draft_state")
    .select("*")
    .eq("league_id", leagueId)
    .maybeSingle()
  if (error) {
    console.error("[v0] getDraftState error:", error.message)
    return null
  }
  return data
}

/** All picks made so far, oldest first. Kept flat (see DraftPick's comment
 *  in lib/types.ts) — the draft board resolves team/punter client-side. */
export async function getDraftPicks(leagueId: string): Promise<DraftPick[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("draft_picks")
    .select("*")
    .eq("league_id", leagueId)
    .order("pick_number", { ascending: true })
  if (error) {
    console.error("[v0] getDraftPicks error:", error.message)
    return []
  }
  return data ?? []
}

/** Punters not yet drafted in this league, for the picker + queue UI. Active
 *  punters only — an inactive punter can't be drafted (mirrors assign_punter's
 *  rule in 0003_roster_rpcs.sql). */
export async function getAvailablePunters(leagueId: string): Promise<Punter[]> {
  const [punters, picks] = await Promise.all([getPunters(), getDraftPicks(leagueId)])
  const drafted = new Set(picks.map((p) => p.punter_id))
  return punters.filter((p) => p.active && !drafted.has(p.id))
}

/** A team's autodraft queue, ordered by priority and joined with punter info. */
export async function getDraftQueue(
  leagueId: string,
  teamId: string,
): Promise<DraftQueueEntryView[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("draft_queues")
    .select("id, priority, punters(*)")
    .eq("league_id", leagueId)
    .eq("team_id", teamId)
    .order("priority", { ascending: true })
  if (error) {
    console.error("[v0] getDraftQueue error:", error.message)
    return []
  }
  return (data ?? [])
    .filter((r) => r.punters)
    .map((r) => ({
      id: r.id as string,
      priority: r.priority as number,
      punter: r.punters as unknown as Punter,
    }))
}
