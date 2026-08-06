import "server-only"

/**
 * Thin client for the Sleeper API (https://docs.sleeper.com).
 *
 * Sleeper's API is read-only and keyless — no auth, no secrets. It only
 * covers what Sleeper itself owns (users, leagues, rosters, matchups); it has
 * no concept of punters, so nothing punter-related lives here.
 *
 * Rate limits: Sleeper asks callers to stay under 1000 req/min. Every export
 * here is a single fetch per call — callers (server actions) are responsible
 * for not calling these in a loop per-request. League linking and score sync
 * are both commissioner-initiated (never cron/background), which keeps us
 * far under that ceiling by construction.
 */

const BASE_URL = "https://api.sleeper.app/v1"

export class SleeperApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message)
    this.name = "SleeperApiError"
  }
}

async function sleeperGet<T>(path: string): Promise<T | null> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      // Sleeper data changes slowly enough that a short edge cache avoids
      // hammering the API on repeated page loads without going stale for a
      // live-scoring use case.
      next: { revalidate: 60 },
    })
  } catch (e) {
    throw new SleeperApiError(
      `Could not reach Sleeper (${(e as Error).message}).`,
    )
  }

  if (res.status === 404) return null
  if (!res.ok) {
    throw new SleeperApiError(
      `Sleeper API error (${res.status}) for ${path}`,
      res.status,
    )
  }
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Types (only the fields we actually use — see docs.sleeper.com for the rest)
// ---------------------------------------------------------------------------

export interface SleeperUser {
  user_id: string
  username: string
  display_name: string
  avatar: string | null
}

export interface SleeperLeague {
  league_id: string
  name: string
  season: string
  season_type: string
  status: string
  total_rosters: number
  avatar: string | null
  previous_league_id: string | null
}

export interface SleeperLeagueUser {
  user_id: string
  username: string
  display_name: string
  avatar: string | null
  metadata: { team_name?: string } | null
  is_owner: boolean
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string | null
  league_id: string
  players: string[]
  starters: string[]
  settings: {
    wins: number
    losses: number
    ties: number
    fpts: number
    fpts_decimal: number
    fpts_against: number
    fpts_against_decimal: number
  }
}

export interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  points: number
  custom_points: number | null
}

export interface SleeperNflState {
  week: number
  season_type: "pre" | "post" | "regular"
  season: string
  previous_season: string
  league_season: string
  display_week: number
}

// ---------------------------------------------------------------------------
// Client functions
// ---------------------------------------------------------------------------

/** Resolve a user by username OR user_id. Returns null if not found. */
export function getUser(usernameOrId: string): Promise<SleeperUser | null> {
  return sleeperGet<SleeperUser>(`/user/${encodeURIComponent(usernameOrId)}`)
}

/** All leagues a user belongs to for a given sport/season. */
export function getUserLeagues(
  userId: string,
  season: string,
  sport: "nfl" = "nfl",
): Promise<SleeperLeague[] | null> {
  return sleeperGet<SleeperLeague[]>(
    `/user/${encodeURIComponent(userId)}/leagues/${sport}/${season}`,
  )
}

export function getLeague(leagueId: string): Promise<SleeperLeague | null> {
  return sleeperGet<SleeperLeague>(`/league/${encodeURIComponent(leagueId)}`)
}

export function getLeagueUsers(
  leagueId: string,
): Promise<SleeperLeagueUser[] | null> {
  return sleeperGet<SleeperLeagueUser[]>(
    `/league/${encodeURIComponent(leagueId)}/users`,
  )
}

export function getLeagueRosters(
  leagueId: string,
): Promise<SleeperRoster[] | null> {
  return sleeperGet<SleeperRoster[]>(
    `/league/${encodeURIComponent(leagueId)}/rosters`,
  )
}

export function getMatchups(
  leagueId: string,
  week: number,
): Promise<SleeperMatchup[] | null> {
  return sleeperGet<SleeperMatchup[]>(
    `/league/${encodeURIComponent(leagueId)}/matchups/${week}`,
  )
}

export function getNflState(): Promise<SleeperNflState | null> {
  return sleeperGet<SleeperNflState>(`/state/nfl`)
}

/** Full avatar image URL for a Sleeper avatar id. Re-exported here for
 *  convenience in server code; see lib/sleeper-avatar.ts for the
 *  client-safe original (this file is server-only). */
export { sleeperAvatarUrl as avatarUrl } from "@/lib/sleeper-avatar"
