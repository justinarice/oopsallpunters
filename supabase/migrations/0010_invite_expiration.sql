-- ============================================================================
-- Invite token expiration.
--
-- team_invites tokens previously had no expiry — an unclaimed link stayed
-- valid indefinitely until manually revoked. The token itself is an
-- unguessable UUID and single-use, so this isn't a fix for a live exploit;
-- it's bounding how long a leaked/forwarded link stays a valid credential.
-- 30 days is long enough to onboard a whole league at season start and short
-- enough to bound the risk of an old, forgotten link.
-- ============================================================================

alter table public.team_invites
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days');

-- Return type is changing (new is_expired column), so this must be dropped
-- and recreated rather than CREATE OR REPLACE.
drop function if exists public.get_invite_preview(uuid);

create function public.get_invite_preview(p_token uuid)
returns table(
  team_name text,
  league_name text,
  league_slug text,
  already_claimed boolean,
  is_expired boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    t.team_name,
    l.name,
    l.slug,
    (ti.claimed_at is not null),
    (ti.expires_at <= now())
  from public.team_invites ti
  join public.teams t on t.id = ti.team_id
  join public.leagues l on l.id = t.league_id
  where ti.token = p_token;
end;
$$;

grant execute on function public.get_invite_preview(uuid) to anon, authenticated;

create or replace function public.claim_team_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_name text;
  v_email text;
  v_expires_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select expires_at into v_expires_at
  from public.team_invites where token = p_token;

  if v_expires_at is null then
    raise exception 'invite_not_found';
  end if;

  if v_expires_at <= now() then
    raise exception 'invite_expired';
  end if;

  select p.name, p.email into v_name, v_email
  from public.profiles p where p.id = v_uid;

  -- Re-check expiry inside the atomic UPDATE's WHERE clause too, closing the
  -- same kind of race the claimed_at check already guards against (a link
  -- expiring in the gap between the SELECT above and this UPDATE).
  update public.team_invites
  set claimed_at = now(),
      claimed_by = v_uid,
      claimed_by_name = v_name,
      claimed_by_email = v_email
  where token = p_token and claimed_at is null and expires_at > now()
  returning team_id into v_team_id;

  if v_team_id is null then
    raise exception 'invite_already_claimed';
  end if;

  -- Same atomic guard on the team itself, in case a second, different
  -- invite for the same team was claimed a moment earlier.
  update public.teams
  set owner_user_id = v_uid
  where id = v_team_id and owner_user_id is null;

  if not found then
    raise exception 'team_already_claimed';
  end if;

  return v_team_id;
end;
$$;

grant execute on function public.claim_team_invite(uuid) to authenticated;
