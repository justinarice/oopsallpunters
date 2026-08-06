-- ============================================================================
-- Sleeper integration — Phase A (identity & league linking)
--
-- Sleeper owns rosters/standard scoring; we only need enough identity data to
-- (a) resolve a commissioner-entered username to a stable user_id, and
-- (b) later pull that team's Sleeper points for the combined-score view
--     (Phase B). No player/transaction data is stored here — punters don't
--     exist in Sleeper, so there's nothing to sync beyond identity + points.
-- ============================================================================

-- A league may optionally be linked to a real Sleeper league. Nullable —
-- unlinked leagues keep working exactly as they do today.
alter table public.leagues
  add column if not exists sleeper_league_id text;

-- Team-level Sleeper identity. sleeper_username remains the human-entered
-- lookup key; the rest are resolved server-side via the Sleeper API and
-- should be treated as read-only/derived by the UI.
alter table public.teams
  add column if not exists sleeper_user_id text,
  add column if not exists sleeper_roster_id integer,
  add column if not exists sleeper_avatar text,
  add column if not exists sleeper_display_name text;

-- A roster_id is only meaningful within its league, so keep the pair unique
-- when both are set (avoids two teams accidentally mapping to one roster).
create unique index if not exists teams_sleeper_roster_unique
  on public.teams (league_id, sleeper_roster_id)
  where sleeper_roster_id is not null;
