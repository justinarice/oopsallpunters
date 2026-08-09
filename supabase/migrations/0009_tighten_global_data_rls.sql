-- ============================================================================
-- Security fix: punters/weekly_stats write policies checked only
-- `auth.uid() is not null`, not commissioner status, so ANY signed-in user
-- (not just a league commissioner) could write these global tables directly
-- via the anon key + PostgREST, bypassing the app's requireCommissioner()
-- checks entirely. Neither policy has a legitimate app-level consumer today
-- that this fix would break:
--   * punters   — no app code writes it at all; only scripts/seed-punters.mjs
--                 (a direct superuser Postgres connection that never goes
--                 through RLS in the first place).
--   * weekly_stats — the only writer is finalizeImport() (lib/actions/import.ts),
--                 called only from commissioner-gated server actions, and it
--                 only ever INSERTs (never UPDATEs/DELETEs).
-- ============================================================================

-- punters: no legitimate RLS-governed writer exists. Lock writes down
-- entirely; the shared catalog is maintained out-of-band via a direct
-- Postgres connection (scripts/seed-punters.mjs), not through the API.
drop policy if exists punters_write_auth on public.punters;

-- Helper: is the current user the commissioner of at least one league?
-- Mirrors is_commissioner(target_league) but for tables that are global
-- (no league_id) yet still need to be restricted to commissioners.
create or replace function public.is_any_commissioner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.leagues l
    where l.commissioner_id = auth.uid()
  );
$$;

-- weekly_stats: raw stats are global (no league_id) and append-only by
-- design (finalizeImport() only ever inserts). Replace the "any signed-in
-- user" policy with insert-only, restricted to commissioners of at least one
-- league. No update/delete policy is added, so RLS denies both for everyone
-- — same pattern as audit_log.
drop policy if exists ws_write_auth on public.weekly_stats;
create policy ws_insert_comm on public.weekly_stats for insert
  with check (public.is_any_commissioner());
