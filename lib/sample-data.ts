import type {
  AuditLogEntry,
  ImportHistory,
  League,
  Punter,
  ScoringRule,
  StandingRow,
  Team,
  Trade,
  WeeklyStats,
} from './types'

/**
 * PLACEHOLDER sample data for the Phase 1 shells only.
 * This will be replaced by live Supabase queries in Phases 2–4.
 * It exists so the public pages and dashboard render something realistic
 * before the database schema is created and wired up.
 */

export const sampleLeague: League = {
  id: 'lg_1',
  name: 'Oops All Punters',
  slug: 'oops-all-punters',
  season: '2026',
  commissioner_id: 'usr_commish',
  logo_url: null,
  announcement: null,
  sleeper_league_id: null,
  created_at: '2026-07-01T12:00:00Z',
}

export const sampleLeagues: League[] = [
  sampleLeague,
  {
    id: 'lg_2',
    name: 'Coffin Corner Club',
    slug: 'coffin-corner-club',
    season: '2026',
    commissioner_id: 'usr_commish',
    logo_url: null,
    announcement: null,
    sleeper_league_id: null,
    created_at: '2026-06-14T09:30:00Z',
  },
]

const noSleeperIdentity = {
  sleeper_user_id: null,
  sleeper_roster_id: null,
  sleeper_avatar: null,
  sleeper_display_name: null,
}

export const sampleTeams: Team[] = [
  { id: 't1', league_id: 'lg_1', team_name: 'Hangtime Heroes', owner_name: 'Marcus', sleeper_username: 'marcus_p', ...noSleeperIdentity },
  { id: 't2', league_id: 'lg_1', team_name: 'Shank City', owner_name: 'Priya', sleeper_username: 'priya23', ...noSleeperIdentity },
  { id: 't3', league_id: 'lg_1', team_name: 'Inside the 20', owner_name: 'Devon', sleeper_username: 'dvn', ...noSleeperIdentity },
  { id: 't4', league_id: 'lg_1', team_name: 'Touchback Tyrants', owner_name: 'Sam', sleeper_username: 'sammyG', ...noSleeperIdentity },
  { id: 't5', league_id: 'lg_1', team_name: 'Net Gains', owner_name: 'Alex', sleeper_username: 'alexkicks', ...noSleeperIdentity },
  { id: 't6', league_id: 'lg_1', team_name: 'Coffin Corner', owner_name: 'Jordan', sleeper_username: 'jordo', ...noSleeperIdentity },
]

export const samplePunters: Punter[] = [
  { id: 'p1', player_id: 'nfl_ajcole', name: 'AJ Cole', team: 'LV', active: true },
  { id: 'p2', player_id: 'nfl_stonehouse', name: 'Ryan Stonehouse', team: 'TEN', active: true },
  { id: 'p3', player_id: 'nfl_dixon', name: 'Riley Dixon', team: 'DEN', active: true },
  { id: 'p4', player_id: 'nfl_araiza', name: 'Matt Araiza', team: 'KC', active: true },
  { id: 'p5', player_id: 'nfl_martin', name: 'Jack Fox', team: 'DET', active: true },
  { id: 'p6', player_id: 'nfl_hekker', name: 'Johnny Hekker', team: 'CAR', active: true },
]

export const sampleStandings: StandingRow[] = [
  { team: sampleTeams[0], punter: samplePunters[4], seasonPoints: 84.5, rank: 1, lastWeekPoints: 21.0 },
  { team: sampleTeams[2], punter: samplePunters[0], seasonPoints: 79.0, rank: 2, lastWeekPoints: 18.5 },
  { team: sampleTeams[4], punter: samplePunters[2], seasonPoints: 72.5, rank: 3, lastWeekPoints: 16.0 },
  { team: sampleTeams[3], punter: samplePunters[3], seasonPoints: 68.0, rank: 4, lastWeekPoints: 19.5 },
  { team: sampleTeams[1], punter: samplePunters[1], seasonPoints: 61.5, rank: 5, lastWeekPoints: 12.0 },
  { team: sampleTeams[5], punter: samplePunters[5], seasonPoints: 54.0, rank: 6, lastWeekPoints: 9.5 },
]

export const sampleScoringRules: ScoringRule[] = [
  { id: 'sr1', league_id: 'lg_1', stat: 'gross_yards', points: 1, modifier: 'per_10' },
  { id: 'sr2', league_id: 'lg_1', stat: 'net_yards', points: 1, modifier: 'per_10' },
  { id: 'sr3', league_id: 'lg_1', stat: 'inside_20', points: 2, modifier: 'each' },
  { id: 'sr4', league_id: 'lg_1', stat: 'touchbacks', points: -2, modifier: 'each' },
  { id: 'sr5', league_id: 'lg_1', stat: 'longest', points: 1, modifier: 'flat' },
  { id: 'sr6', league_id: 'lg_1', stat: 'blocked', points: -5, modifier: 'each' },
  { id: 'sr7', league_id: 'lg_1', stat: 'fair_catches', points: 0.5, modifier: 'each' },
]

export const sampleTrades: Trade[] = [
  {
    id: 'tr1',
    league_id: 'lg_1',
    date: '2026-08-05T15:20:00Z',
    from_team: 'Shank City',
    to_team: 'Net Gains',
    punter: 'Jack Fox',
    notes: 'Two-for-one, cash considerations waived.',
  },
]

export const sampleImports: ImportHistory[] = [
  { id: 'im3', week: 3, season: '2026', date: '2026-09-22T14:02:00Z', user: 'Commissioner', source: 'nflverse', status: 'success', source_hash: 'a1b2c3' },
  { id: 'im2', week: 2, season: '2026', date: '2026-09-15T13:40:00Z', user: 'Commissioner', source: 'nflverse', status: 'success', source_hash: 'd4e5f6' },
  { id: 'im1', week: 1, season: '2026', date: '2026-09-08T13:12:00Z', user: 'Commissioner', source: 'csv_upload', status: 'success', source_hash: '7a8b9c' },
]

export const sampleAuditLog: AuditLogEntry[] = [
  { id: 'al6', timestamp: '2026-09-22T14:02:00Z', user: 'Commissioner', action: 'Imported Week 3 stats from nflverse', before: null, after: { week: 3 } },
  { id: 'al5', timestamp: '2026-08-05T15:20:00Z', user: 'Commissioner', action: 'Traded Jack Fox from Shank City to Net Gains', before: { owner: 'Shank City' }, after: { owner: 'Net Gains' } },
  { id: 'al4', timestamp: '2026-08-05T11:00:00Z', user: 'Commissioner', action: 'Touchback scoring changed: -1 → -2 (applied going forward)', before: { points: -1 }, after: { points: -2 } },
  { id: 'al3', timestamp: '2026-07-15T18:45:00Z', user: 'Commissioner', action: 'Assigned AJ Cole to Inside the 20', before: null, after: { punter: 'AJ Cole', team: 'Inside the 20' } },
  { id: 'al2', timestamp: '2026-07-15T18:30:00Z', user: 'Commissioner', action: 'Assigned Jack Fox to Hangtime Heroes', before: null, after: { punter: 'Jack Fox', team: 'Hangtime Heroes' } },
  { id: 'al1', timestamp: '2026-07-01T12:00:00Z', user: 'Commissioner', action: 'Created league "Oops All Punters" for 2026 season', before: null, after: { season: '2026' } },
]

export const sampleWeeklyStats: (WeeklyStats & { punterName: string; owner: string; points: number })[] = [
  { id: 'ws1', week: 3, season: '2026', player_id: 'nfl_martin', punterName: 'Jack Fox', owner: 'Hangtime Heroes', attempts: 5, gross_yards: 241, net_yards: 218, average: 48.2, longest: 61, inside_20: 3, touchbacks: 0, fair_catches: 2, returned: 2, return_yards: 12, blocked: 0, surrender_index: 4.1, source_import_id: 'im3', points: 21.0 },
  { id: 'ws2', week: 3, season: '2026', player_id: 'nfl_ajcole', punterName: 'AJ Cole', owner: 'Inside the 20', attempts: 4, gross_yards: 198, net_yards: 180, average: 49.5, longest: 58, inside_20: 2, touchbacks: 1, fair_catches: 1, returned: 1, return_yards: 8, blocked: 0, surrender_index: 3.2, source_import_id: 'im3', points: 18.5 },
  { id: 'ws3', week: 3, season: '2026', player_id: 'nfl_araiza', punterName: 'Matt Araiza', owner: 'Touchback Tyrants', attempts: 6, gross_yards: 288, net_yards: 244, average: 48.0, longest: 64, inside_20: 2, touchbacks: 2, fair_catches: 1, returned: 3, return_yards: 22, blocked: 0, surrender_index: 2.8, source_import_id: 'im3', points: 19.5 },
  { id: 'ws4', week: 3, season: '2026', player_id: 'nfl_dixon', punterName: 'Riley Dixon', owner: 'Net Gains', attempts: 4, gross_yards: 176, net_yards: 165, average: 44.0, longest: 52, inside_20: 2, touchbacks: 0, fair_catches: 2, returned: 1, return_yards: 5, blocked: 0, surrender_index: 3.6, source_import_id: 'im3', points: 16.0 },
  { id: 'ws5', week: 3, season: '2026', player_id: 'nfl_stonehouse', punterName: 'Ryan Stonehouse', owner: 'Shank City', attempts: 3, gross_yards: 141, net_yards: 120, average: 47.0, longest: 55, inside_20: 1, touchbacks: 1, fair_catches: 0, returned: 2, return_yards: 18, blocked: 0, surrender_index: 1.9, source_import_id: 'im3', points: 12.0 },
  { id: 'ws6', week: 3, season: '2026', player_id: 'nfl_hekker', punterName: 'Johnny Hekker', owner: 'Coffin Corner', attempts: 3, gross_yards: 129, net_yards: 110, average: 43.0, longest: 49, inside_20: 1, touchbacks: 1, fair_catches: 1, returned: 1, return_yards: 9, blocked: 1, surrender_index: 2.2, source_import_id: 'im3', points: 9.5 },
]

export const availableWeeks = [1, 2, 3]

export const STAT_LABELS: Record<string, string> = {
  attempts: 'Att',
  gross_yards: 'Gross Yds',
  net_yards: 'Net Yds',
  average: 'Avg',
  longest: 'Long',
  inside_20: 'Inside 20',
  touchbacks: 'TB',
  fair_catches: 'FC',
  returned: 'Ret',
  return_yards: 'Ret Yds',
  blocked: 'Blk',
  surrender_index: 'Surrender Idx',
}

export const MODIFIER_LABELS: Record<string, string> = {
  each: 'per each',
  per_10: 'per 10 yards',
  per_yard: 'per yard',
  flat: 'flat (once if present)',
}
