-- Atomic roster operations. These run as SECURITY DEFINER so the close+open of
-- assignment rows (and the unique-active-index enforcement) happen in one
-- transaction. Each function re-checks that the caller is the league's
-- commissioner, so it is safe to expose to authenticated users.
--
-- search_path is pinned empty and every table is fully-qualified.

-- Assign a free-agent punter to a team (no existing active assignment).
create or replace function public.assign_punter(
  p_league_id uuid,
  p_team_id uuid,
  p_punter_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_active_count int;
  v_punter_active boolean;
  v_new_id uuid;
begin
  -- Authorize: caller must be this league's commissioner.
  if not exists (
    select 1 from public.leagues l
    where l.id = p_league_id and l.commissioner_id = v_uid
  ) then
    raise exception 'not_authorized';
  end if;

  -- Team and punter must belong to / be valid for this league.
  if not exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.league_id = p_league_id
  ) then
    raise exception 'team_not_in_league';
  end if;

  -- Punter must be active in the catalog.
  select p.active into v_punter_active
  from public.punters p where p.id = p_punter_id;
  if v_punter_active is null then
    raise exception 'punter_not_found';
  end if;
  if v_punter_active = false then
    raise exception 'punter_inactive';
  end if;

  -- Must not already have an active assignment in this league.
  select count(*) into v_active_count
  from public.roster_assignments ra
  where ra.league_id = p_league_id
    and ra.punter_id = p_punter_id
    and ra.ended_at is null;
  if v_active_count > 0 then
    raise exception 'already_assigned';
  end if;

  insert into public.roster_assignments (league_id, team_id, punter_id, assigned_by)
  values (p_league_id, p_team_id, p_punter_id, v_uid)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- Release a punter (soft-close the active assignment).
create or replace function public.release_punter(
  p_league_id uuid,
  p_punter_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (
    select 1 from public.leagues l
    where l.id = p_league_id and l.commissioner_id = v_uid
  ) then
    raise exception 'not_authorized';
  end if;

  update public.roster_assignments ra
  set ended_at = now()
  where ra.league_id = p_league_id
    and ra.punter_id = p_punter_id
    and ra.ended_at is null;
end;
$$;

-- Trade a punter: soft-close the current active assignment (if any) and open a
-- new one for the destination team, recording a trades row. Atomic.
create or replace function public.trade_punter(
  p_league_id uuid,
  p_to_team uuid,
  p_punter_id uuid,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_from_team uuid;
  v_punter_active boolean;
  v_trade_id uuid;
begin
  if not exists (
    select 1 from public.leagues l
    where l.id = p_league_id and l.commissioner_id = v_uid
  ) then
    raise exception 'not_authorized';
  end if;

  if not exists (
    select 1 from public.teams t
    where t.id = p_to_team and t.league_id = p_league_id
  ) then
    raise exception 'team_not_in_league';
  end if;

  select p.active into v_punter_active
  from public.punters p where p.id = p_punter_id;
  if v_punter_active is null then
    raise exception 'punter_not_found';
  end if;

  -- Find + close the current active assignment (may be none = free agent add).
  select ra.team_id into v_from_team
  from public.roster_assignments ra
  where ra.league_id = p_league_id
    and ra.punter_id = p_punter_id
    and ra.ended_at is null
  limit 1;

  if v_from_team = p_to_team then
    raise exception 'same_team';
  end if;

  update public.roster_assignments ra
  set ended_at = now()
  where ra.league_id = p_league_id
    and ra.punter_id = p_punter_id
    and ra.ended_at is null;

  insert into public.roster_assignments (league_id, team_id, punter_id, assigned_by)
  values (p_league_id, p_to_team, p_punter_id, v_uid);

  insert into public.trades (league_id, from_team, to_team, punter_id, notes, created_by)
  values (p_league_id, v_from_team, p_to_team, p_punter_id, nullif(p_notes, ''), v_uid)
  returning id into v_trade_id;

  return v_trade_id;
end;
$$;

grant execute on function public.assign_punter(uuid, uuid, uuid) to authenticated;
grant execute on function public.release_punter(uuid, uuid) to authenticated;
grant execute on function public.trade_punter(uuid, uuid, uuid, text) to authenticated;
