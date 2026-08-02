# Punter League Companion — Development Guardrails

This file exists because two areas of this project drift silently if a code
assistant infers "smarter" default behavior. Read it before making changes.

## Guiding Principles (do not violate)

1. **Sleeper owns everything except punters.** This app never tries to
   replicate Sleeper's core league management — rosters, scoring for standard
   positions, waivers, etc. all stay in Sleeper.
2. **Every commissioner action is public.** No hidden admin behavior. If a
   commissioner changes something, everyone can see it (audit log).
3. **Nothing happens automatically.** No silent background jobs that mutate
   scoring or assignments. The commissioner initiates every state change.
4. **Commissioner always initiates imports.** No scheduled/cron auto-import.
5. **Configuration over hardcoding.** Scoring rules especially must be
   data-driven — no point values baked into code. See `lib/scoring.ts`.
6. **Keep operational costs at $0.** Vercel Hobby + Supabase Free + a free
   public data source (nflverse-data).

## Row Level Security policy outline

Anonymous users get full READ access; only commissioners get scoped WRITE
access. Per table:

- **Public tables** (`leagues`, `teams`, `punters`, `roster_assignments`,
  `trades`, `scoring_rules`, `scoring_rule_changes`, `weekly_stats`,
  `weekly_scores`, `import_history`, `audit_log`):
  - `SELECT`: allowed for all (`true`)
  - `INSERT`/`UPDATE`/`DELETE`: only where the current user is the
    commissioner of the row's `league_id` (see `public.is_commissioner()`).
- **`profiles`**: `SELECT`/`INSERT`/`UPDATE` restricted to the user's own row.
  Commissioner identity is kept minimal (name/email/avatar) for audit-log
  attribution only.
- **`audit_log`**: public `SELECT` and commissioner `INSERT` only. `UPDATE`
  and `DELETE` are disabled entirely at the database level via the
  `audit_log_immutable()` triggers — not just via RLS — enforcing true
  immutability. Never add an UPDATE/DELETE policy to this table.

The canonical schema + policies live in `supabase/migrations/0001_init.sql`.
Never loosen these policies for dev convenience.

## Phase status

Phase 1 (Foundation) is complete: schema + RLS, Supabase clients + middleware,
Google OAuth commissioner login, public league shell, and commissioner
dashboard shell. Phases 2–5 (league CRUD, scoring engine wiring, nflverse
imports) are not yet built. The public pages currently render from
`lib/sample-data.ts` until the data layer is wired in later phases.
