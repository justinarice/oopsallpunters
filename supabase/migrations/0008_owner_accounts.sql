-- ============================================================================
-- Owner accounts & team-claim invites
--
-- Reuses the existing Supabase Auth (same login/sign-up pages commissioners
-- already use — auth doesn't distinguish "commissioner" vs "owner", the
-- app does, via which row references your profile). What's new here is
-- purely the identity link (teams.owner_user_id) and a secure way for an
-- owner to establish it (claim an invite link), needed before anything
-- owner-facing (starting with the punter draft) can be built.
--
-- Security note: team_invites.token is a bearer secret. Unlike every other
-- league-scoped table in this app, it is deliberately NOT public-select —
-- claiming happens through a SECURITY DEFINER function instead, matching
-- the existing pattern in 0003_roster_rpcs.sql, so the claiming user never
-- needs row-level visibility into the invites table at all.
-- ============================================================================

alter table public.teams
  add column if not exists owner_user_id uuid references public.profiles(id) on delete set null;

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  -- Null until claimed. Write-once: the claim function refuses to touch a
  -- row that already has claimed_at set, so a token can't be reused.
  claimed_at timestamptz,
  claimed_by uuid references public.profiles(id),
  -- Denormalized at claim time (via the SECURITY DEFINER function below,
  -- which can read public.profiles for the claiming user even though the
  -- profiles table itself is select-own-only). Lets the commissioner see
  -- who claimed a team without needing a public profiles-read policy that
  -- would otherwise leak every user's name/email league-wide.
  claimed_by_name text,
  claimed_by_email text
);

create index if not exists team_invites_team_id_idx on public.team_invites (team_id);

alter table public.team_invites enable row level security;

drop policy if exists team_invites_all_comm on public.team_invites;
create policy team_invites_all_comm on public.team_invites for all
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_invites.team_id and public.is_commissioner(t.league_id)
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_invites.team_id and public.is_commissioner(t.league_id)
    )
  );

-- ----------------------------------------------------------------------------
-- Preview an invite before the visitor signs in: team + league name, and
-- whether it's already been used. No auth required (anon can call it) since
-- someone clicking an invite link isn't signed in yet — that's the whole
-- point of showing them what they're about to claim first.
-- ----------------------------------------------------------------------------
create or replace function public.get_invite_preview(p_token uuid)
returns table(
  team_name text,
  league_name text,
  league_slug text,
  already_claimed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select t.team_name, l.name, l.slug, (ti.claimed_at is not null)
  from public.team_invites ti
  join public.teams t on t.id = ti.team_id
  join public.leagues l on l.id = t.league_id
  where ti.token = p_token;
end;
$$;

grant execute on function public.get_invite_preview(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Claim an invite for the signed-in caller. The token itself is the sole
-- authorization — no commissioner check here, deliberately, since anyone
-- holding the (unguessable) link is meant to be able to claim it.
--
-- Both updates below are atomic check-and-set (WHERE ... IS NULL, then
-- check FOUND) rather than "select the current state, then update" —
-- selecting first and updating second would leave a window where two
-- concurrent claims of the same link could both read "unclaimed" before
-- either commits. Conditioning the UPDATE itself on the row still being
-- unclaimed closes that race: only one concurrent caller's UPDATE can
-- match the WHERE clause.
-- ----------------------------------------------------------------------------
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
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.team_invites where token = p_token) then
    raise exception 'invite_not_found';
  end if;

  select p.name, p.email into v_name, v_email
  from public.profiles p where p.id = v_uid;

  update public.team_invites
  set claimed_at = now(),
      claimed_by = v_uid,
      claimed_by_name = v_name,
      claimed_by_email = v_email
  where token = p_token and claimed_at is null
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
