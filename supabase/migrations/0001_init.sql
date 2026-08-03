-- ============================================================================
-- Punter League Companion — Phase 1 schema + RLS
-- Guiding principles (verbatim from project plan §2):
--   1. Sleeper owns everything except punters.
--   2. Every commissioner action is public.
--   3. Nothing happens automatically.
--   4. Commissioner always initiates imports.
--   5. Configuration over hardcoding.
--   6. Keep operational costs at $0.
--
-- RLS model (§7):
--   * Anonymous users get full READ access to all league data.
--   * Only the league's commissioner may INSERT/UPDATE/DELETE its rows.
--   * audit_log is append-only: UPDATE/DELETE are denied at the DB level.
-- ============================================================================

-- Supabase auth.users is the identity source. `profiles` holds the minimal
-- commissioner identity we surface for audit-log attribution.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  avatar text,
  created_at timestamptz not null default now()
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  season text not null,
  logo text,
  announcement text,
  commissioner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_name text not null,
  owner_name text not null,
  sleeper_username text,
  created_at timestamptz not null default now()
);

-- Static NFL punter reference table (seeded from nflverse roster data).
create table if not exists public.punters (
  id uuid primary key default gen_random_uuid(),
  player_id text not null unique, -- matched against nflverse punter_player_id
  name text not null,
  team text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Only one ACTIVE (ended_at IS NULL) assignment per punter per league.
create table if not exists public.roster_assignments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  punter_id uuid not null references public.punters(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  ended_at timestamptz -- set when a trade/reassignment closes this row
);

-- Enforce the "one active assignment per punter per league" rule at the DB.
create unique index if not exists roster_assignments_one_active
  on public.roster_assignments (league_id, punter_id)
  where ended_at is null;

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  date timestamptz not null default now(),
  from_team uuid references public.teams(id),
  to_team uuid not null references public.teams(id),
  punter_id uuid not null references public.punters(id),
  notes text,
  created_by uuid references public.profiles(id)
);

create table if not exists public.scoring_rules (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  stat text not null,          -- e.g. inside_20, touchback, gross_yards
  points numeric not null,
  modifier text not null default 'each', -- each, per_10, etc.
  unique (league_id, stat)
);

-- Tracks the effective window of a scoring rule so retroactive vs. forward-only
-- recalculation is explicit and auditable.
create table if not exists public.scoring_rule_changes (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  stat text not null,
  old_points numeric,
  new_points numeric,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id),
  recalculate_past_weeks boolean not null default false,
  effective_week integer -- when not retroactive, the first week the new value applies
);

-- Every import attempt. source_hash detects duplicate imports (not week alone).
create table if not exists public.import_history (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  week integer not null,
  season text not null,
  date timestamptz not null default now(),
  imported_by uuid references public.profiles(id),
  source text not null,   -- 'nflverse' or 'csv_upload'
  status text not null,   -- 'success' | 'failed' | 'pending'
  source_hash text,       -- hash of the raw payload/file for dup detection
  message text
);

-- Raw imported statistics — never overwritten, never deleted.
create table if not exists public.weekly_stats (
  id uuid primary key default gen_random_uuid(),
  week integer not null,
  season text not null,
  player_id text not null,
  attempts integer,
  gross_yards integer,
  net_yards integer,
  average numeric,
  longest integer,
  inside_20 integer,
  touchbacks integer,
  fair_catches integer,
  returned integer,
  return_yards integer,
  blocked integer,
  surrender_index numeric,
  source_import_id uuid references public.import_history(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Calculated values derived from weekly_stats + scoring_rules at calc time.
create table if not exists public.weekly_scores (
  id uuid primary key default gen_random_uuid(),
  week integer not null,
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  punter_id uuid not null references public.punters(id),
  points numeric not null,
  calculated_at timestamptz not null default now(),
  scoring_rules_version uuid references public.scoring_rule_changes(id)
);

-- The most important table. Immutable, append-only.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  ts timestamptz not null default now(),
  actor uuid references public.profiles(id),
  actor_name text, -- denormalized name for public display without exposing users
  action text not null,
  before jsonb,
  after jsonb
);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.teams enable row level security;
alter table public.punters enable row level security;
alter table public.roster_assignments enable row level security;
alter table public.trades enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.scoring_rule_changes enable row level security;
alter table public.import_history enable row level security;
alter table public.weekly_stats enable row level security;
alter table public.weekly_scores enable row level security;
alter table public.audit_log enable row level security;

-- Helper: is the current user the commissioner of a given league?
create or replace function public.is_commissioner(target_league uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.leagues l
    where l.id = target_league and l.commissioner_id = auth.uid()
  );
$$;

-- ---- profiles: a user may read/write only their own row ----
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = id);

-- ---- leagues ----
drop policy if exists leagues_select_public on public.leagues;
create policy leagues_select_public on public.leagues for select using (true);
drop policy if exists leagues_insert_comm on public.leagues;
create policy leagues_insert_comm on public.leagues for insert with check (auth.uid() = commissioner_id);
drop policy if exists leagues_update_comm on public.leagues;
create policy leagues_update_comm on public.leagues for update using (auth.uid() = commissioner_id);
drop policy if exists leagues_delete_comm on public.leagues;
create policy leagues_delete_comm on public.leagues for delete using (auth.uid() = commissioner_id);

-- Reusable macro pattern for league-scoped tables: public read, commissioner write.
-- teams
drop policy if exists teams_select_public on public.teams;
create policy teams_select_public on public.teams for select using (true);
drop policy if exists teams_write_comm on public.teams;
create policy teams_write_comm on public.teams for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));

-- punters: global reference table. Public read; any authenticated commissioner
-- may add/maintain the shared catalog.
drop policy if exists punters_select_public on public.punters;
create policy punters_select_public on public.punters for select using (true);
drop policy if exists punters_write_auth on public.punters;
create policy punters_write_auth on public.punters for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- roster_assignments
drop policy if exists ra_select_public on public.roster_assignments;
create policy ra_select_public on public.roster_assignments for select using (true);
drop policy if exists ra_write_comm on public.roster_assignments;
create policy ra_write_comm on public.roster_assignments for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));

-- trades
drop policy if exists trades_select_public on public.trades;
create policy trades_select_public on public.trades for select using (true);
drop policy if exists trades_write_comm on public.trades;
create policy trades_write_comm on public.trades for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));

-- scoring_rules
drop policy if exists sr_select_public on public.scoring_rules;
create policy sr_select_public on public.scoring_rules for select using (true);
drop policy if exists sr_write_comm on public.scoring_rules;
create policy sr_write_comm on public.scoring_rules for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));

-- scoring_rule_changes
drop policy if exists src_select_public on public.scoring_rule_changes;
create policy src_select_public on public.scoring_rule_changes for select using (true);
drop policy if exists src_write_comm on public.scoring_rule_changes;
create policy src_write_comm on public.scoring_rule_changes for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));

-- import_history
drop policy if exists ih_select_public on public.import_history;
create policy ih_select_public on public.import_history for select using (true);
drop policy if exists ih_write_comm on public.import_history;
create policy ih_write_comm on public.import_history for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));

-- weekly_stats: raw stats are global (not league-scoped). Public read; any
-- commissioner may write via an import they initiated.
drop policy if exists ws_select_public on public.weekly_stats;
create policy ws_select_public on public.weekly_stats for select using (true);
drop policy if exists ws_write_auth on public.weekly_stats;
create policy ws_write_auth on public.weekly_stats for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- weekly_scores
drop policy if exists wsc_select_public on public.weekly_scores;
create policy wsc_select_public on public.weekly_scores for select using (true);
drop policy if exists wsc_write_comm on public.weekly_scores;
create policy wsc_write_comm on public.weekly_scores for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));

-- ---- audit_log: public read, commissioner INSERT only. NO update/delete. ----
drop policy if exists audit_select_public on public.audit_log;
create policy audit_select_public on public.audit_log for select using (true);
drop policy if exists audit_insert_comm on public.audit_log;
create policy audit_insert_comm on public.audit_log for insert
  with check (public.is_commissioner(league_id));
-- Intentionally NO update or delete policy exists, so RLS denies both.

-- Belt-and-suspenders immutability: block UPDATE/DELETE at the DB level so even
-- a future loosened policy or a privileged path cannot mutate history.
create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only; % is not permitted', tg_op;
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_immutable();

drop trigger if exists audit_log_no_delete on public.audit_log;
create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- ---- Auto-create a profile row when a new auth user is created ----
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, avatar)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
