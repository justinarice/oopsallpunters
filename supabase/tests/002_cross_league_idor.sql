-- Cross-league attacker: authenticated as league B's commissioner, attempt
-- every kind of mutation against league A's resources — direct table
-- writes and the roster RPCs — using a real, valid ID borrowed from league
-- A. Every one must be rejected. Then a positive control confirms the same
-- operations succeed when the caller genuinely is league A's commissioner.
do $$
declare
  v_commish_a uuid := current_setting('pgtap_test.commissioner_a_id')::uuid;
  v_commish_b uuid := current_setting('pgtap_test.commissioner_b_id')::uuid;
  v_league_a  uuid;
  v_league_b  uuid;
  v_team_a    uuid;
  v_team_b    uuid;
  v_punter_id uuid;
  v_rows      int;
  v_rejected  boolean;
  v_result    uuid;
begin
  -- ---- fixtures (as the owner role, bypasses RLS) ----
  insert into public.leagues (name, slug, season, commissioner_id)
  values ('PGTAP League A', 'pgtap-league-a-' || gen_random_uuid(), '2099', v_commish_a)
  returning id into v_league_a;

  insert into public.leagues (name, slug, season, commissioner_id)
  values ('PGTAP League B', 'pgtap-league-b-' || gen_random_uuid(), '2099', v_commish_b)
  returning id into v_league_b;

  insert into public.teams (league_id, team_name, owner_name)
  values (v_league_a, 'PGTAP Team A', 'Owner A')
  returning id into v_team_a;

  insert into public.teams (league_id, team_name, owner_name)
  values (v_league_b, 'PGTAP Team B', 'Owner B')
  returning id into v_team_b;

  insert into public.punters (player_id, name, team, active)
  values ('pgtap-idor-punter-' || gen_random_uuid(), 'PGTAP IDOR Punter', 'ZZZ', true)
  returning id into v_punter_id;

  insert into public.team_invites (team_id, created_by)
  values (v_team_a, v_commish_a);

  -- ============================================================
  -- Attacker: authenticated as B, targeting A's resources.
  -- ============================================================
  perform pgtap_tests.become(v_commish_b, 'authenticated');

  update public.leagues set announcement = 'pwned' where id = v_league_a;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 0, 'B cannot update league A');

  v_rejected := false;
  begin
    insert into public.teams (league_id, team_name, owner_name)
    values (v_league_a, 'Injected Team', 'Attacker');
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'B cannot insert a team into league A');

  update public.teams set team_name = 'pwned' where id = v_team_a;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 0, 'B cannot update team A');

  delete from public.teams where id = v_team_a;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 0, 'B cannot delete team A');

  v_rejected := false;
  begin
    insert into public.scoring_rules (league_id, stat, points, modifier)
    values (v_league_a, 'pwned_stat', 999, 'each');
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'B cannot insert a scoring rule for league A');

  v_rejected := false;
  begin
    insert into public.roster_assignments (league_id, team_id, punter_id, assigned_by)
    values (v_league_a, v_team_a, v_punter_id, v_commish_b);
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'B cannot insert a roster assignment into league A');

  select count(*) into v_rows from public.team_invites where team_id = v_team_a;
  perform pgtap_tests.assert_ok(v_rows = 0, 'B cannot even see team A''s invites (not just write them)');

  -- Roster RPCs re-check commissioner status internally — same borrowed
  -- league A id, authenticated as B.
  v_rejected := false;
  begin
    perform public.assign_punter(v_league_a, v_team_a, v_punter_id);
  exception when others then
    if sqlerrm = 'not_authorized' then v_rejected := true; else raise; end if;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'B cannot call assign_punter for league A');

  v_rejected := false;
  begin
    perform public.release_punter(v_league_a, v_punter_id);
  exception when others then
    if sqlerrm = 'not_authorized' then v_rejected := true; else raise; end if;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'B cannot call release_punter for league A');

  v_rejected := false;
  begin
    perform public.trade_punter(v_league_a, v_team_a, v_punter_id, 'pwned');
  exception when others then
    if sqlerrm = 'not_authorized' then v_rejected := true; else raise; end if;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'B cannot call trade_punter for league A');

  -- ============================================================
  -- Positive control: A performing the same operations on A's own
  -- league must succeed.
  -- ============================================================
  perform pgtap_tests.become(v_commish_a, 'authenticated');

  update public.leagues set announcement = 'legit update' where id = v_league_a;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 1, 'A can update A''s own league');

  select public.assign_punter(v_league_a, v_team_a, v_punter_id) into v_result;
  perform pgtap_tests.assert_ok(v_result is not null, 'A can call assign_punter for A''s own league');

  perform pgtap_tests.become_owner();
end $$;
