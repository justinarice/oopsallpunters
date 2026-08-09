-- Regression test for migration 0009: punters and weekly_stats must reject
-- writes from anon and from authenticated non-commissioners; weekly_stats
-- must accept inserts from a commissioner (of any league) but never allow
-- update/delete from anyone; punters must reject writes from everyone,
-- including commissioners (no legitimate app path writes it).
do $$
declare
  v_commish_a uuid := current_setting('pgtap_test.commissioner_a_id')::uuid;
  v_outsider  uuid := current_setting('pgtap_test.outsider_id')::uuid;
  v_league_a  uuid;
  v_punter_id uuid;
  v_rows      int;
  v_rejected  boolean;
begin
  -- ---- fixtures (as the owner role, bypasses RLS) ----
  insert into public.leagues (name, slug, season, commissioner_id)
  values ('PGTAP League A', 'pgtap-league-a-' || gen_random_uuid(), '2099', v_commish_a)
  returning id into v_league_a;

  insert into public.punters (player_id, name, team, active)
  values ('pgtap-punter-' || gen_random_uuid(), 'PGTAP Test Punter', 'ZZZ', true)
  returning id into v_punter_id;

  -- ============================================================
  -- punters: nobody can write, not even a commissioner.
  -- ============================================================

  perform pgtap_tests.become(null, 'anon');
  v_rejected := false;
  begin
    insert into public.punters (player_id, name, team, active)
    values ('pgtap-anon-insert', 'Should Fail', 'ZZZ', true);
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'anon cannot insert into punters');

  perform pgtap_tests.become(v_outsider, 'authenticated');
  v_rejected := false;
  begin
    insert into public.punters (player_id, name, team, active)
    values ('pgtap-outsider-insert', 'Should Fail', 'ZZZ', true);
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'authenticated non-commissioner cannot insert into punters');

  perform pgtap_tests.become(v_commish_a, 'authenticated');
  v_rejected := false;
  begin
    insert into public.punters (player_id, name, team, active)
    values ('pgtap-commish-insert', 'Should Fail', 'ZZZ', true);
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'a commissioner cannot insert into punters (no legitimate app writer exists)');

  update public.punters set name = 'Hacked' where id = v_punter_id;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 0, 'a commissioner cannot update punters (0 rows affected)');

  perform pgtap_tests.become(null, 'anon');
  delete from public.punters where id = v_punter_id;
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 0, 'anon cannot delete from punters (0 rows affected)');

  select count(*) into v_rows from public.punters where id = v_punter_id;
  perform pgtap_tests.assert_ok(v_rows = 1, 'anon can still select punters (public read preserved)');

  -- ============================================================
  -- weekly_stats: insert-only, restricted to commissioners (of any
  -- league); nobody may update/delete.
  -- ============================================================

  perform pgtap_tests.become_owner();

  perform pgtap_tests.become(null, 'anon');
  v_rejected := false;
  begin
    insert into public.weekly_stats (week, season, player_id, gross_yards)
    values (1, '2099', 'pgtap-anon', 100);
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'anon cannot insert into weekly_stats');

  perform pgtap_tests.become(v_outsider, 'authenticated');
  v_rejected := false;
  begin
    insert into public.weekly_stats (week, season, player_id, gross_yards)
    values (1, '2099', 'pgtap-outsider', 100);
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pgtap_tests.assert_ok(v_rejected, 'authenticated non-commissioner cannot insert into weekly_stats');

  perform pgtap_tests.become(v_commish_a, 'authenticated');
  insert into public.weekly_stats (week, season, player_id, gross_yards)
  values (1, '2099', 'pgtap-commish', 100);
  select count(*) into v_rows from public.weekly_stats where player_id = 'pgtap-commish' and season = '2099';
  perform pgtap_tests.assert_ok(v_rows = 1, 'a commissioner (of any league) can insert into weekly_stats');

  update public.weekly_stats set gross_yards = 999 where player_id = 'pgtap-commish' and season = '2099';
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 0, 'nobody, not even a commissioner, can update weekly_stats');

  delete from public.weekly_stats where player_id = 'pgtap-commish' and season = '2099';
  get diagnostics v_rows = row_count;
  perform pgtap_tests.assert_ok(v_rows = 0, 'nobody, not even a commissioner, can delete weekly_stats');

  perform pgtap_tests.become(null, 'anon');
  select count(*) into v_rows from public.weekly_stats where player_id = 'pgtap-commish' and season = '2099';
  perform pgtap_tests.assert_ok(v_rows = 1, 'anon can still select weekly_stats (public read preserved)');

  perform pgtap_tests.become_owner();
end $$;
