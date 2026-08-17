-- ============================================================================
-- League visibility: public vs. private.
--
-- Until now every league-scoped table was unconditionally public-select (see
-- CLAUDE.md's RLS policy outline and 0001_init.sql's header). This migration
-- adds a per-league is_public flag, defaulting to false, and narrows every
-- league-scoped SELECT policy to:
--   is_public = true  OR  auth.uid() is the league's commissioner
--                     OR  auth.uid() owns a team in the league
--
-- Global reference tables that carry no league/team identity — punters
-- (the shared NFL punter catalog) and weekly_stats (raw per-player stats,
-- keyed by player_id/week/season, never by league or team) — are left
-- public-select. There's nothing league-private in them.
--
-- team_invites already has no public-select policy at all (0008) and is
-- untouched here.
-- ============================================================================

alter table public.leagues
  add column if not exists is_public boolean not null default false;

-- Owner-lookup is now on the hot path of every league-scoped read (via
-- can_view_league below), so it needs an index the way commissioner_id
-- already effectively has one (leagues.id is the PK it's compared against).
create index if not exists teams_owner_user_id_idx
  on public.teams (owner_user_id)
  where owner_user_id is not null;

-- security definer so this can be used inside leagues' own SELECT policy
-- without recursing through that same policy (matches is_commissioner's
-- pattern from 0001_init.sql).
create or replace function public.can_view_league(target_league uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.leagues l
    where l.id = target_league
      and (
        l.is_public
        or l.commissioner_id = auth.uid()
        or exists (
          select 1 from public.teams t
          where t.league_id = l.id and t.owner_user_id = auth.uid()
        )
      )
  );
$$;

-- ---- leagues ----
drop policy if exists leagues_select_public on public.leagues;
create policy leagues_select_visible on public.leagues for select
  using (public.can_view_league(id));

-- ---- teams ----
drop policy if exists teams_select_public on public.teams;
create policy teams_select_visible on public.teams for select
  using (public.can_view_league(league_id));

-- ---- roster_assignments ----
drop policy if exists ra_select_public on public.roster_assignments;
create policy ra_select_visible on public.roster_assignments for select
  using (public.can_view_league(league_id));

-- ---- trades ----
drop policy if exists trades_select_public on public.trades;
create policy trades_select_visible on public.trades for select
  using (public.can_view_league(league_id));

-- ---- scoring_rules ----
drop policy if exists sr_select_public on public.scoring_rules;
create policy sr_select_visible on public.scoring_rules for select
  using (public.can_view_league(league_id));

-- ---- scoring_rule_changes ----
drop policy if exists src_select_public on public.scoring_rule_changes;
create policy src_select_visible on public.scoring_rule_changes for select
  using (public.can_view_league(league_id));

-- ---- import_history ----
drop policy if exists ih_select_public on public.import_history;
create policy ih_select_visible on public.import_history for select
  using (public.can_view_league(league_id));

-- ---- weekly_scores ----
drop policy if exists wsc_select_public on public.weekly_scores;
create policy wsc_select_visible on public.weekly_scores for select
  using (public.can_view_league(league_id));

-- ---- audit_log ----
drop policy if exists audit_select_public on public.audit_log;
create policy audit_select_visible on public.audit_log for select
  using (public.can_view_league(league_id));

-- ---- draft_settings / draft_state / draft_picks / draft_queues (0012) ----
drop policy if exists draft_settings_select_public on public.draft_settings;
create policy draft_settings_select_visible on public.draft_settings for select
  using (public.can_view_league(league_id));

drop policy if exists draft_state_select_public on public.draft_state;
create policy draft_state_select_visible on public.draft_state for select
  using (public.can_view_league(league_id));

drop policy if exists draft_picks_select_public on public.draft_picks;
create policy draft_picks_select_visible on public.draft_picks for select
  using (public.can_view_league(league_id));

drop policy if exists draft_queues_select_public on public.draft_queues;
create policy draft_queues_select_visible on public.draft_queues for select
  using (public.can_view_league(league_id));
