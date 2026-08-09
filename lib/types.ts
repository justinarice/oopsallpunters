/**
 * Domain types mirroring the Supabase schema (see supabase/schema.sql).
 * These are the shapes the app reads/writes once the database is wired up.
 * Phase 1 renders shells from sample data using these same types, so moving
 * to live Supabase queries in later phases is a drop-in change.
 */

export type StatKey =
  | 'attempts'
  | 'gross_yards'
  | 'net_yards'
  | 'average'
  | 'longest'
  | 'inside_20'
  | 'touchbacks'
  | 'fair_catches'
  | 'returned'
  | 'return_yards'
  | 'blocked'
  | 'surrender_index'

export type ScoringModifier = 'each' | 'per_10' | 'per_yard' | 'flat'

export type ImportSource = 'nflverse' | 'csv_upload'
export type ImportStatus = 'pending' | 'success' | 'failed'

export interface User {
  id: string
  email: string
  name: string | null
  avatar: string | null
}

export interface League {
  id: string
  name: string
  slug: string
  season: string
  commissioner_id: string
  logo_url: string | null
  announcement: string | null
  /** Sleeper's league_id when this league is linked. Null = unlinked. */
  sleeper_league_id: string | null
  /** Week most recently synced via syncSleeperScores. Null = never synced. */
  sleeper_last_synced_week: number | null
  /** When that sync ran, for a "last synced X ago" indicator. */
  sleeper_last_synced_at: string | null
  /** Sleeper roster_ids that didn't match a local team as of that sync. */
  sleeper_unmatched_rosters: number[]
  created_at: string
}

export interface Team {
  id: string
  league_id: string
  team_name: string
  owner_name: string
  /** Commissioner-entered lookup value. May be a stale username; prefer
   *  sleeper_user_id for identity once resolved. */
  sleeper_username: string | null
  /** Stable Sleeper identity, resolved server-side from sleeper_username.
   *  Usernames can change over time; this does not. */
  sleeper_user_id: string | null
  /** roster_id within the linked Sleeper league, once resolved via
   *  linkSleeperLeague. Null until the league is linked and matched. */
  sleeper_roster_id: number | null
  sleeper_avatar: string | null
  sleeper_display_name: string | null
  /** Supabase auth user (via public.profiles) who claimed this team, if
   *  any. Null = unclaimed — no owner has signed in and linked themselves
   *  to this team yet. Set via claim_team_invite(), never directly. */
  owner_user_id: string | null
}

/** A team-claim invite. team_invites is deliberately NOT public-readable
 *  (see migration 0008) — this type is only ever populated from a
 *  commissioner-scoped query or the get_invite_preview()/claim_team_invite()
 *  RPCs, never from a public teams/leagues read. */
export interface TeamInvite {
  id: string
  team_id: string
  token: string
  created_at: string
  claimed_at: string | null
  claimed_by_name: string | null
  claimed_by_email: string | null
}

export interface Punter {
  id: string
  player_id: string
  name: string
  team: string
  active: boolean
}

export interface RosterAssignment {
  id: string
  league_id: string
  team_id: string
  punter_id: string
  assigned_at: string
  assigned_by: string
  ended_at: string | null
}

export interface Trade {
  id: string
  league_id: string
  date: string
  from_team: string
  to_team: string
  punter: string
  notes: string | null
}

export interface ScoringRule {
  id: string
  league_id: string
  stat: StatKey
  points: number
  modifier: ScoringModifier
}

export interface ScoringRuleChange {
  id: string
  league_id: string
  stat: StatKey
  old_points: number
  new_points: number
  changed_at: string
  changed_by: string
  recalculate_past_weeks: boolean
  effective_week: number | null
}

export interface WeeklyStats {
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
}

export interface WeeklyScore {
  id: string
  week: number
  league_id: string
  team_id: string
  punter_id: string
  points: number
  calculated_at: string
  scoring_rules_version: string
}

export interface ImportHistory {
  id: string
  week: number
  season: string
  date: string
  user: string
  source: ImportSource
  status: ImportStatus
  source_hash: string
}

export interface AuditLogEntry {
  id: string
  timestamp: string
  user: string
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

/** Denormalized row used by standings + team views in the UI. */
export interface StandingRow {
  team: Team
  punter: Punter | null
  seasonPoints: number
  rank: number
  lastWeekPoints: number | null
  /** Sum of this team's synced Sleeper matchup points across the season.
   *  Null when the league isn't linked to Sleeper (or nothing's synced yet) —
   *  the UI should omit the Sleeper/Combined columns entirely in that case. */
  sleeperPoints: number | null
  /** seasonPoints + sleeperPoints. Null under the same conditions as sleeperPoints. */
  combinedPoints: number | null
}

/** Active roster assignment joined with its team and punter. */
export interface AssignmentView {
  id: string
  team: Team
  punter: Punter
  assigned_at: string
}

/** Trade row with resolved team/punter names for public display. */
export interface TradeView {
  id: string
  date: string
  from_team: string | null
  to_team: string
  punter: string
  notes: string | null
}

/** A punter joined with its current owner (if any) in a given league. */
export interface PunterWithOwner {
  punter: Punter
  ownerTeam: Team | null
}
