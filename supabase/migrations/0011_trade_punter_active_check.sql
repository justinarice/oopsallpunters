-- trade_punter allowed trading an inactive/retired punter even though
-- assign_punter (the otherwise-identical sibling RPC) already blocks that.
-- Bring trade_punter in line for consistency. Not a security fix — the
-- function is still fully commissioner-gated either way — just a business
-- rule that was inconsistently applied.
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
  if v_punter_active = false then
    raise exception 'punter_inactive';
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
