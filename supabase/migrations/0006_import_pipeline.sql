-- ============================================================================
-- Import pipeline support
--
-- weekly_scores had no uniqueness constraint, so re-importing a week (e.g. a
-- corrected stat sheet) would insert duplicate rows and silently double-count
-- season totals in getStandings/getWeeklyResults. weekly_stats intentionally
-- stays unconstrained — it's the append-only raw history (§ "never
-- overwritten, never deleted"); the importer picks the most recent row per
-- (week, player_id) when calculating, so a corrected re-import naturally
-- wins without ever deleting the original submission.
-- ============================================================================

create unique index if not exists weekly_scores_league_week_punter_unique
  on public.weekly_scores (league_id, week, punter_id);
