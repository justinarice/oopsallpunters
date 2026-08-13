-- ============================================================================
-- Live punter draft (v1: exactly one punter per team, one round, no snake).
--
-- Four tables:
--   draft_settings — config, rarely written (pick_seconds, team_order, status)
--   draft_state    — the live pointer, written every pick/timeout
--   draft_picks    — append-only results
--   draft_queues   — owner-set autodraft preference, plain-RLS (no RPC)
-- Split settings from state deliberately: state is written on every pick and
-- every lazy clock-check, config almost never changes after the draft starts.
--
-- A draft pick IS a roster assignment — make_draft_pick / resolve_draft_clock
-- insert into public.roster_assignments the same way public.assign_punter
-- does (see 0003_roster_rpcs.sql), so drafting and rostering are one action,
-- not two.
--
-- Both RPCs follow the atomic-conditional-update discipline from
-- claim_team_invite (0008_owner_accounts.sql): the draft_picks unique
-- constraints are the real concurrency guard, not the SELECT-based checks
-- that precede the INSERT. A plain "select current state, then decide, then
-- write" has the same TOCTOU race under concurrent callers that migration
-- 0008's comment warns about, and this draft has the exact same race shape
-- (two tabs / two people trying to make or auto-resolve the same pick).
-- ============================================================================

create table if not exists public.draft_settings (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  pick_seconds int not null default 90,
  -- Ordered team ids, a permutation of this league's teams. Empty until the
  -- commissioner randomizes it. current_pick_number indexes directly into
  -- this array (1-based, matching Postgres array indexing) since v1 is a
  -- single fixed round — no snake order, no round tracking needed.
  team_order uuid[] not null default '{}',
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'paused', 'complete'))
);

create table if not exists public.draft_state (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  current_pick_number int,
  current_team_id uuid references public.teams(id),
  -- When the CURRENT pick's clock expires. Null once the draft is complete
  -- (or hasn't started), so resolve_draft_clock's "has it passed" check is a
  -- clean no-op instead of needing a separate is-active flag.
  pick_deadline timestamptz
);

create table if not exists public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  pick_number int not null,
  team_id uuid not null references public.teams(id) on delete cascade,
  punter_id uuid not null references public.punters(id) on delete restrict,
  picked_at timestamptz not null default now(),
  auto_drafted boolean not null default false,
  -- DB-level backstops, not just app checks — and the actual concurrency
  -- guard the RPCs below rely on (see header comment).
  constraint draft_picks_punter_unique unique (league_id, punter_id),
  constraint draft_picks_team_unique unique (league_id, team_id)
);

create index if not exists draft_picks_league_idx on public.draft_picks (league_id);

create table if not exists public.draft_queues (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  punter_id uuid not null references public.punters(id) on delete cascade,
  priority int not null,
  unique (league_id, team_id, punter_id)
);

create index if not exists draft_queues_team_priority_idx
  on public.draft_queues (league_id, team_id, priority);

-- ============================================================================
-- Row Level Security
--
-- Unlike team_invites (0008), none of these tables hold a secret — this is a
-- live draft board anyone should be able to watch. All four are public-select,
-- matching the rest of the app (see CLAUDE.md's RLS policy outline).
--
-- draft_settings/draft_state/draft_picks writes are commissioner-gated via
-- is_commissioner() for the setup/admin actions (configure, start, pause,
-- reset). The pick-making and clock-resolution paths never go through this
-- policy at all — they go through the two SECURITY DEFINER RPCs below, which
-- run as the function owner and so bypass RLS entirely, exactly like
-- assign_punter bypasses a plain RLS write path on roster_assignments. Both
-- RPCs re-check authorization themselves (make_draft_pick: the on-the-clock
-- owner or the commissioner; resolve_draft_clock: commissioner only).
--
-- draft_queues is different: it's an owner managing their own team's data,
-- with no cross-user mutation and no race to guard against, so it's safe as
-- plain owner-scoped RLS — an RPC here would be over-engineering.
-- ============================================================================

alter table public.draft_settings enable row level security;
alter table public.draft_state enable row level security;
alter table public.draft_picks enable row level security;
alter table public.draft_queues enable row level security;

drop policy if exists draft_settings_select_public on public.draft_settings;
create policy draft_settings_select_public on public.draft_settings for select using (true);
drop policy if exists draft_settings_write_comm on public.draft_settings;
create policy draft_settings_write_comm on public.draft_settings for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));

drop policy if exists draft_state_select_public on public.draft_state;
create policy draft_state_select_public on public.draft_state for select using (true);
drop policy if exists draft_state_write_comm on public.draft_state;
create policy draft_state_write_comm on public.draft_state for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));

drop policy if exists draft_picks_select_public on public.draft_picks;
create policy draft_picks_select_public on public.draft_picks for select using (true);
drop policy if exists draft_picks_write_comm on public.draft_picks;
create policy draft_picks_write_comm on public.draft_picks for all
  using (public.is_commissioner(league_id))
  with check (public.is_commissioner(league_id));

drop policy if exists draft_queues_select_public on public.draft_queues;
create policy draft_queues_select_public on public.draft_queues for select using (true);
drop policy if exists draft_queues_write_owner on public.draft_queues;
create policy draft_queues_write_owner on public.draft_queues for all
  using (
    exists (
      select 1 from public.teams t
      where t.id = draft_queues.team_id and t.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = draft_queues.team_id and t.owner_user_id = auth.uid()
    )
  );

-- ============================================================================
-- make_draft_pick — a team's own owner (or the commissioner, on their behalf)
-- makes a pick. authenticated only: anon can watch the board but never picks.
-- ============================================================================

create or replace function public.make_draft_pick(
  p_league_id uuid,
  p_punter_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_pick_number int;
  v_status text;
  v_pick_seconds int;
  v_team_order uuid[];
  v_new_pick_id uuid;
  v_next_pick_number int;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select ds.current_team_id, ds.current_pick_number
    into v_team_id, v_pick_number
  from public.draft_state ds
  where ds.league_id = p_league_id;

  select dst.status, dst.pick_seconds, dst.team_order
    into v_status, v_pick_seconds, v_team_order
  from public.draft_settings dst
  where dst.league_id = p_league_id;

  if v_team_id is null or v_status is distinct from 'in_progress' then
    raise exception 'draft_not_active';
  end if;

  -- Authorize: the on-the-clock team's own owner, or this league's
  -- commissioner overriding on behalf of an unreachable owner.
  if not exists (
    select 1 from public.leagues l
    where l.id = p_league_id and l.commissioner_id = v_uid
  ) and not exists (
    select 1 from public.teams t
    where t.id = v_team_id and t.owner_user_id = v_uid
  ) then
    raise exception 'not_your_turn';
  end if;

  -- Punter must exist and be active — mirrors assign_punter's rule
  -- (0003_roster_rpcs.sql) so a drafted punter is held to the same bar as
  -- one assigned through the roster tab.
  declare
    v_punter_active boolean;
  begin
    select p.active into v_punter_active from public.punters p where p.id = p_punter_id;
    if v_punter_active is null then
      raise exception 'punter_not_found';
    end if;
    if v_punter_active = false then
      raise exception 'punter_inactive';
    end if;
  end;

  -- The on-the-clock team must not already hold an active punter. Nothing
  -- stops the commissioner from calling assign_punter on this team mid-draft
  -- (assign_punter has no reason to know a draft is running), so re-check
  -- here rather than relying solely on startDraft's one-time precondition.
  if exists (
    select 1 from public.roster_assignments ra
    where ra.league_id = p_league_id and ra.team_id = v_team_id and ra.ended_at is null
  ) then
    raise exception 'team_already_has_punter';
  end if;

  -- Explicit pre-check for a clean error message — the INSERT's unique
  -- constraint below is the real guard under concurrency, this just avoids
  -- surfacing a raw constraint-violation message in the common case.
  if exists (
    select 1 from public.draft_picks dp
    where dp.league_id = p_league_id and dp.punter_id = p_punter_id
  ) then
    raise exception 'punter_already_drafted';
  end if;

  begin
    insert into public.draft_picks (league_id, pick_number, team_id, punter_id, auto_drafted)
    values (p_league_id, v_pick_number, v_team_id, p_punter_id, false)
    returning id into v_new_pick_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'draft_picks_team_unique' then
      -- This team's pick was already made by someone else (e.g. an autodraft
      -- that fired at the same moment) between our read and our insert.
      raise exception 'pick_already_made';
    else
      raise exception 'punter_already_drafted';
    end if;
  end;

  insert into public.roster_assignments (league_id, team_id, punter_id, assigned_by)
  values (p_league_id, v_team_id, p_punter_id, v_uid);

  if v_pick_number >= coalesce(array_length(v_team_order, 1), 0) then
    update public.draft_settings set status = 'complete' where league_id = p_league_id;
    update public.draft_state
      set current_pick_number = null, current_team_id = null, pick_deadline = null
      where league_id = p_league_id;
  else
    v_next_pick_number := v_pick_number + 1;
    update public.draft_state
      set current_pick_number = v_next_pick_number,
          current_team_id = v_team_order[v_next_pick_number],
          pick_deadline = now() + (v_pick_seconds || ' seconds')::interval
      where league_id = p_league_id;
  end if;

  return v_new_pick_id;
end;
$$;

grant execute on function public.make_draft_pick(uuid, uuid) to authenticated;

-- ============================================================================
-- resolve_draft_clock — resolves an expired pick clock by auto-drafting for
-- the stalled team. NOT automatic: CLAUDE.md principle 3 ("the commissioner
-- initiates every state change") rules out firing this off a client-side
-- timer for anyone who happens to have a tab open, so it's commissioner-only
-- and only ever called from an explicit "Resolve pick" button click (see
-- draft-board.tsx) — never from the polling loop. The commissioner could
-- always just draft manually on the stalled team's behalf instead; this RPC
-- exists only so their explicit "resolve" click can honor the team's queue.
-- ============================================================================

create or replace function public.resolve_draft_clock(p_league_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_pick_number int;
  v_deadline timestamptz;
  v_status text;
  v_pick_seconds int;
  v_team_order uuid[];
  v_punter_id uuid;
  v_new_pick_id uuid;
  v_next_pick_number int;
begin
  if not exists (
    select 1 from public.leagues l
    where l.id = p_league_id and l.commissioner_id = v_uid
  ) then
    raise exception 'not_authorized';
  end if;

  select ds.current_team_id, ds.current_pick_number, ds.pick_deadline
    into v_team_id, v_pick_number, v_deadline
  from public.draft_state ds
  where ds.league_id = p_league_id;

  select dst.status, dst.pick_seconds, dst.team_order
    into v_status, v_pick_seconds, v_team_order
  from public.draft_settings dst
  where dst.league_id = p_league_id;

  if v_status is distinct from 'in_progress' or v_team_id is null or v_deadline is null then
    return false;
  end if;

  if now() < v_deadline then
    return false;
  end if;

  -- Autopick: the on-the-clock team's queue in priority order, first entry
  -- that's still active and not already drafted in this league.
  select dq.punter_id into v_punter_id
  from public.draft_queues dq
  join public.punters p on p.id = dq.punter_id
  where dq.league_id = p_league_id
    and dq.team_id = v_team_id
    and p.active = true
    and not exists (
      select 1 from public.draft_picks dp
      where dp.league_id = p_league_id and dp.punter_id = dq.punter_id
    )
  order by dq.priority
  limit 1;

  -- Queue empty/exhausted: any available active punter. The draft must keep
  -- moving, never skip a team.
  if v_punter_id is null then
    select p.id into v_punter_id
    from public.punters p
    where p.active = true
      and not exists (
        select 1 from public.draft_picks dp
        where dp.league_id = p_league_id and dp.punter_id = p.id
      )
    order by random()
    limit 1;
  end if;

  -- No active punters left at all — nothing to do until the catalog grows or
  -- someone frees one up. Not expected in practice (punter pool >> teams).
  if v_punter_id is null then
    return false;
  end if;

  begin
    insert into public.draft_picks (league_id, pick_number, team_id, punter_id, auto_drafted)
    values (p_league_id, v_pick_number, v_team_id, v_punter_id, true)
    returning id into v_new_pick_id;
  exception when unique_violation then
    -- Another concurrent caller (a fellow open tab, or the owner picking
    -- manually at the same instant) already resolved this pick. No-op.
    return false;
  end;

  -- assigned_by is null: the queue/random pick was never a specific person's
  -- decision, even though the commissioner is the one who triggered
  -- resolving it (v_uid, checked above) — that's why this whole action gets
  -- audit-logged by the caller (resolveDraftClock) rather than attributed
  -- here the way make_draft_pick attributes to v_uid.
  insert into public.roster_assignments (league_id, team_id, punter_id, assigned_by)
  values (p_league_id, v_team_id, v_punter_id, null);

  if v_pick_number >= coalesce(array_length(v_team_order, 1), 0) then
    update public.draft_settings set status = 'complete' where league_id = p_league_id;
    update public.draft_state
      set current_pick_number = null, current_team_id = null, pick_deadline = null
      where league_id = p_league_id;
  else
    v_next_pick_number := v_pick_number + 1;
    update public.draft_state
      set current_pick_number = v_next_pick_number,
          current_team_id = v_team_order[v_next_pick_number],
          pick_deadline = now() + (v_pick_seconds || ' seconds')::interval
      where league_id = p_league_id;
  end if;

  return true;
end;
$$;

grant execute on function public.resolve_draft_clock(uuid) to authenticated;

-- ============================================================================
-- Realtime — first use in this app. Supplements, not replaces, the client's
-- plain resync polling (draft-board.tsx): Realtime can drop a connection, so
-- polling is what guarantees eventual consistency even if a broadcast is
-- missed. (Only the read-only resync is on a timer — resolving an expired
-- pick clock always requires an explicit commissioner click.)
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'draft_picks'
  ) then
    alter publication supabase_realtime add table public.draft_picks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'draft_state'
  ) then
    alter publication supabase_realtime add table public.draft_state;
  end if;
end $$;
