-- A league's own commissioner can perform every legitimate write on their
-- own league; a plain authenticated user with no league of their own is
-- rejected on the same operations; profiles stay select/insert/update-own
-- only for everyone.
do $$
declare
  v_commish_a uuid := current_setting('pgtap_test.commissioner_a_id')::uuid;
  v_outsider  uuid := current_setting('pgtap_test.outsider_id')::uuid;
  v_league_a  uuid;
  v_team_id   uuid;
  v_rows      int;
  v_rejected  boolean;
begin
  -- ---- fixtures (as the owner role, bypasses RLS) ----
  insert into public.leagues (name, slug, season, commissioner_id)
  values ('PGTAP League A', 'pgtap-league-a-' || gen_random_uuid(), '2099', v_commish_a)
  returning id into v_league_a;

  -- ============================================================
  -- Commissioner A: full legitimate CRUD lifecycle on their own league.
  -- ============================================================
  perform pgtap_tests.become(v_commish_a, 'authenticated');

  insert into public.teams (league_id, team_name, owner_name)
  values (v_league_a, 'PGTAP Lifecycle Team', 'Owner') returning id into v_team_id;
  perform pgtap_tests.assert_ok(v_team_id is not null, 'commissioner can create a team in their own league');

  update public.teams set team_name = 'Renamed Team' where id = v_team_id;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 1, 'commissioner can rename their own team');

  insert into public.scoring_rules (league_id, stat, points, modifier)
  values (v_league_a, 'gross_yards', 1, 'per_10');
  select count(*) into v_rows from public.scoring_rules where league_id = v_league_a and stat = 'gross_yards';
  perform pgtap_tests.assert_ok(v_rows = 1, 'commissioner can add a scoring rule for their own league');

  insert into public.team_invites (team_id, created_by) values (v_team_id, v_commish_a);
  select count(*) into v_rows from public.team_invites where team_id = v_team_id and claimed_at is null;
  perform pgtap_tests.assert_ok(v_rows = 1, 'commissioner can create an invite for their own team');

  delete from public.team_invites where team_id = v_team_id and claimed_at is null;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 1, 'commissioner can revoke their own unclaimed invite');

  delete from public.teams where id = v_team_id;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 1, 'commissioner can delete their own team');

  -- ============================================================
  -- Plain authenticated user with no league of their own: rejected on
  -- the same operations against league A.
  -- ============================================================
  perform pgtap_tests.become(v_outsider, 'authenticated');

  v_rejected := false;
  begin
    insert into public.teams (league_id, team_name, owner_name)
    values (v_league_a, 'Injected Team', 'Attacker');
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'a non-commissioner cannot create a team in someone else''s league');

  v_rejected := false;
  begin
    insert into public.scoring_rules (league_id, stat, points, modifier)
    values (v_league_a, 'pwned_stat', 999, 'each');
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'a non-commissioner cannot add a scoring rule to someone else''s league');

  -- ============================================================
  -- profiles: strictly select/insert/update-own, for everyone.
  -- ============================================================
  select count(*) into v_rows from public.profiles where id = v_outsider;
  perform pgtap_tests.assert_ok(v_rows = 1, 'a user can select their own profile');

  select count(*) into v_rows from public.profiles where id = v_commish_a;
  perform pgtap_tests.assert_ok(v_rows = 0, 'a user cannot select another user''s profile row');

  update public.profiles set name = 'pwned' where id = v_commish_a;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 0, 'a user cannot update another user''s profile row');

  v_rejected := false;
  begin
    insert into public.profiles (id, email, name) values (v_commish_a, 'x@example.invalid', 'Impersonator');
  exception when others then
    -- Either RLS (insufficient_privilege) or the primary-key conflict on an
    -- existing row both correctly prevent impersonation here.
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'a user cannot insert a profile row claiming another user''s id');

  perform pgtap_tests.become_owner();
end $$;
