-- ============================================================================
-- Sleeper integration — Phase B (combined scoring)
--
-- Caches each linked team's Sleeper matchup points per week, captured at
-- sync time (commissioner-initiated, never a cron job — plan principle #4).
-- Storing a snapshot rather than live-fetching on every page render means:
--   - standings render fast (no external API call in the request path)
--   - historical weeks don't shift if Sleeper's own data changes later
--   - we stay well under Sleeper's rate limit regardless of traffic
-- ============================================================================

create table if not exists public.sleeper_weekly_points (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  week integer not null,
  -- Sleeper's roster_id for this league, kept even if team_id later goes
  -- null (team deleted/unmatched), so the raw sync record is never lost.
  roster_id integer not null,
  team_id uuid references public.teams(id) on delete set null,
  points numeric not null,
  synced_at timestamptz not null default now(),
  synced_by uuid references public.profiles(id)
);

-- Re-syncing a week overwrites that week's snapshot rather than duplicating.
create unique index if not exists sleeper_weekly_points_unique
  on public.sleeper_weekly_points (league_id, week, roster_id);

alter table public.sleeper_weekly_points enable row level security;

drop policy if exists swp_select_public on public.sleeper_weekly_points;
create policy swp_select_public on public.sleeper_weekly_points for select using (true);
drop policy if exists swp_write_comm on public.sleeper_weekly_points;
create policy swp_write_comm on public.sleeper_weekly_points for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));
