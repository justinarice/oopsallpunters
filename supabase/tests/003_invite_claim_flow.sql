-- Invite token lifecycle: unguessable/unlisted, single-use, expiring,
-- and never lets a claimant end up attached to any team other than the
-- one their specific token names.
do $$
declare
  v_commish_a uuid := current_setting('pgtap_test.commissioner_a_id')::uuid;
  v_outsider  uuid := current_setting('pgtap_test.outsider_id')::uuid;
  v_league_a  uuid;
  v_team_open uuid;
  v_team_claimed uuid;
  v_team_expired uuid;
  v_token_open uuid;
  v_token_claimed uuid;
  v_token_expired uuid;
  v_rows      int;
  v_rejected  boolean;
  v_preview   record;
  v_claimed_team uuid;
begin
  -- ---- fixtures (as the owner role, bypasses RLS) ----
  insert into public.leagues (name, slug, season, commissioner_id)
  values ('PGTAP League A', 'pgtap-league-a-' || gen_random_uuid(), '2099', v_commish_a)
  returning id into v_league_a;

  insert into public.teams (league_id, team_name, owner_name)
  values (v_league_a, 'PGTAP Open Team', 'Owner Open') returning id into v_team_open;
  insert into public.teams (league_id, team_name, owner_name)
  values (v_league_a, 'PGTAP Claimed Team', 'Owner Claimed') returning id into v_team_claimed;
  insert into public.teams (league_id, team_name, owner_name)
  values (v_league_a, 'PGTAP Expired Team', 'Owner Expired') returning id into v_team_expired;

  insert into public.team_invites (team_id, created_by)
  values (v_team_open, v_commish_a)
  returning token into v_token_open;

  insert into public.team_invites (team_id, created_by, claimed_at, claimed_by)
  values (v_team_claimed, v_commish_a, now(), v_commish_a)
  returning token into v_token_claimed;

  insert into public.team_invites (team_id, created_by, expires_at)
  values (v_team_expired, v_commish_a, now() - interval '1 day')
  returning token into v_token_expired;

  -- ============================================================
  -- Preview: unauthenticated-safe, minimal disclosure.
  -- ============================================================
  perform pgtap_tests.become(null, 'anon');

  select count(*) into v_rows from public.team_invites where team_id = v_team_open;
  perform pgtap_tests.assert_ok(v_rows = 0, 'anon cannot select team_invites directly (no public-select policy)');

  select * into v_preview from public.get_invite_preview(v_token_open);
  perform pgtap_tests.assert_ok(
    v_preview.team_name = 'PGTAP Open Team' and v_preview.already_claimed = false and v_preview.is_expired = false,
    'anon can preview a valid unclaimed invite via the RPC'
  );

  select * into v_preview from public.get_invite_preview(v_token_expired);
  perform pgtap_tests.assert_ok(
    v_preview.is_expired = true and v_preview.already_claimed = false,
    'preview correctly flags an expired invite as expired, not claimed'
  );

  select count(*) into v_rows from public.get_invite_preview(gen_random_uuid());
  perform pgtap_tests.assert_ok(v_rows = 0, 'preview of a nonexistent token returns nothing');

  v_rejected := false;
  begin
    perform public.claim_team_invite(v_token_open);
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'anon cannot execute claim_team_invite at all');

  -- ============================================================
  -- Claim: the token is the sole authorization; a client-side attempt
  -- to redirect a valid token to a different team/league is impossible
  -- because claim_team_invite takes no team/league id at all.
  -- ============================================================
  perform pgtap_tests.become(v_outsider, 'authenticated');

  select public.claim_team_invite(v_token_open) into v_claimed_team;
  perform pgtap_tests.assert_ok(v_claimed_team = v_team_open, 'claiming a valid invite attaches exactly the token''s own team');

  select owner_user_id into v_claimed_team from public.teams where id = v_team_open;
  perform pgtap_tests.assert_ok(v_claimed_team = v_outsider, 'the claimed team''s owner_user_id is now the claimant');

  perform pgtap_tests.become(v_commish_a, 'authenticated');

  v_rejected := false;
  begin
    perform public.claim_team_invite(v_token_open);
  exception when others then
    if sqlerrm = 'invite_already_claimed' then v_rejected := true; else raise; end if;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'the same token cannot be claimed twice');

  v_rejected := false;
  begin
    perform public.claim_team_invite(v_token_claimed);
  exception when others then
    if sqlerrm = 'invite_already_claimed' then v_rejected := true; else raise; end if;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'a pre-claimed invite cannot be claimed');

  v_rejected := false;
  begin
    perform public.claim_team_invite(v_token_expired);
  exception when others then
    if sqlerrm = 'invite_expired' then v_rejected := true; else raise; end if;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'an expired invite is rejected as expired, not silently treated as claimed');

  v_rejected := false;
  begin
    perform public.claim_team_invite(gen_random_uuid());
  exception when others then
    if sqlerrm = 'invite_not_found' then v_rejected := true; else raise; end if;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'claiming a nonexistent token fails with invite_not_found');

  perform pgtap_tests.become_owner();
end $$;
