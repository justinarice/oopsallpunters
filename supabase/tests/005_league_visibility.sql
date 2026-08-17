-- League visibility: a private league is readable only by its commissioner
-- and the owners of its own teams; a public league is readable by anyone,
-- including anon. Flipping is_public changes access immediately. Global
-- reference tables (punters) stay public regardless.
do $$
declare
  v_commish_a uuid := current_setting('pgtap_test.commissioner_a_id')::uuid;
  v_owner     uuid := current_setting('pgtap_test.outsider_id')::uuid;
  v_outsider  uuid := current_setting('pgtap_test.commissioner_b_id')::uuid;
  v_league    uuid;
  v_team_owned uuid;
  v_team_other uuid;
  v_punter_id uuid;
  v_rows      int;
begin
  -- ---- fixtures (as the owner role, bypasses RLS) ----
  insert into public.leagues (name, slug, season, commissioner_id, is_public)
  values ('PGTAP Private League', 'pgtap-private-league-' || gen_random_uuid(), '2099', v_commish_a, false)
  returning id into v_league;

  insert into public.teams (league_id, team_name, owner_name, owner_user_id)
  values (v_league, 'PGTAP Owned Team', 'Owner', v_owner)
  returning id into v_team_owned;

  insert into public.teams (league_id, team_name, owner_name)
  values (v_league, 'PGTAP Other Team', 'Nobody')
  returning id into v_team_other;

  insert into public.punters (player_id, name, team, active)
  values ('pgtap-visibility-punter-' || gen_random_uuid(), 'PGTAP Visibility Punter', 'ZZZ', true)
  returning id into v_punter_id;

  insert into public.scoring_rules (league_id, stat, points, modifier)
  values (v_league, 'inside_20', 2, 'each');

  -- ============================================================
  -- Private league: anon and an unrelated authenticated user see nothing.
  -- ============================================================
  perform pgtap_tests.become(null, 'anon');

  select count(*) into v_rows from public.leagues where id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 0, 'anon cannot see a private league');

  select count(*) into v_rows from public.teams where league_id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 0, 'anon cannot see teams in a private league');

  select count(*) into v_rows from public.scoring_rules where league_id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 0, 'anon cannot see scoring rules in a private league');

  select count(*) into v_rows from public.punters where id = v_punter_id;
  perform pgtap_tests.assert_ok(v_rows = 1, 'anon can still see the global punter catalog regardless of league privacy');

  perform pgtap_tests.become(v_outsider, 'authenticated');

  select count(*) into v_rows from public.leagues where id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 0, 'an unrelated authenticated user cannot see a private league');

  select count(*) into v_rows from public.teams where league_id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 0, 'an unrelated authenticated user cannot see teams in a private league');

  -- ============================================================
  -- Private league: the commissioner and the team owner can both see it.
  -- ============================================================
  perform pgtap_tests.become(v_commish_a, 'authenticated');

  select count(*) into v_rows from public.leagues where id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 1, 'the commissioner can see their own private league');

  select count(*) into v_rows from public.teams where league_id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 2, 'the commissioner can see all teams in their own private league');

  perform pgtap_tests.become(v_owner, 'authenticated');

  select count(*) into v_rows from public.leagues where id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 1, 'a team owner can see the private league they own a team in');

  select count(*) into v_rows from public.teams where league_id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 2, 'a team owner can see every team (not just their own) in a private league they belong to');

  select count(*) into v_rows from public.scoring_rules where league_id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 1, 'a team owner can see scoring rules for a private league they belong to');

  -- ============================================================
  -- Flip to public: the same outsider can now see everything.
  -- ============================================================
  perform pgtap_tests.become(v_commish_a, 'authenticated');
  update public.leagues set is_public = true where id = v_league;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 1, 'the commissioner can flip their league to public');

  perform pgtap_tests.become(v_outsider, 'authenticated');

  select count(*) into v_rows from public.leagues where id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 1, 'an unrelated user can see the league once it is public');

  select count(*) into v_rows from public.teams where league_id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 2, 'an unrelated user can see teams once the league is public');

  perform pgtap_tests.become(null, 'anon');

  select count(*) into v_rows from public.leagues where id = v_league;
  perform pgtap_tests.assert_ok(v_rows = 1, 'anon can see the league once it is public');

  perform pgtap_tests.become_owner();
end $$;
