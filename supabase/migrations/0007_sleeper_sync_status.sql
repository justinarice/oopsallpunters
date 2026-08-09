-- ============================================================================
-- Sleeper integration — sync status (freshness + persistent unmatched rosters)
--
-- Two P1 backlog items share one storage need: after a sync, both "when did
-- this last run" and "which rosters didn't match a team" need to survive a
-- page refresh, not just live in a toast the moment the sync finishes.
--
-- These columns are written once, at the end of syncSleeperScores, alongside
-- its existing audit_log entry — no new table, no background job, consistent
-- with plan principle #3 (nothing happens automatically).
-- ============================================================================

alter table public.leagues
  add column if not exists sleeper_last_synced_week integer,
  add column if not exists sleeper_last_synced_at timestamptz,
  -- Sleeper roster_ids that didn't map to a local team as of the most recent
  -- sync. Overwritten wholesale on every sync (not appended), so a roster
  -- that gets matched and re-synced naturally drops off the list instead of
  -- requiring separate cleanup.
  add column if not exists sleeper_unmatched_rosters integer[] not null default '{}';
