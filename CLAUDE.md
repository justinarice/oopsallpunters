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

Only commissioners get scoped WRITE access, everywhere. READ access depends
on each league's `is_public` flag (see migration `0013_league_visibility.sql`):
leagues default to **private** on creation, and a commissioner can flip a
league to public in league settings. Per table:

- **League-scoped tables** (`leagues`, `teams`, `roster_assignments`,
  `trades`, `scoring_rules`, `scoring_rule_changes`, `weekly_scores`,
  `import_history`, `audit_log`, `draft_settings`, `draft_state`,
  `draft_picks`, `draft_queues`):
  - `SELECT`: allowed when `public.can_view_league(league_id)` is true —
    the league is public, OR the current user is its commissioner, OR the
    current user owns a team in it. (For `leagues` itself, `id` stands in
    for `league_id`.)
  - `INSERT`/`UPDATE`/`DELETE`: only where the current user is the
    commissioner of the row's `league_id` (see `public.is_commissioner()`).
    Unaffected by `is_public` — write access never depends on visibility.
- **Global reference tables** (`punters`, `weekly_stats`): carry no
  league/team identity, so they stay public-`SELECT` regardless of any
  league's privacy setting. `INSERT`/`UPDATE`/`DELETE` require any
  authenticated user (matches existing behavior).
- **`team_invites`**: never public-`SELECT`, regardless of league privacy —
  bearer-token secrets, commissioner-scoped only (see migration `0008`).
- **`profiles`**: `SELECT`/`INSERT`/`UPDATE` restricted to the user's own row.
  Commissioner identity is kept minimal (name/email/avatar) for audit-log
  attribution only.
- **`audit_log`**: visibility follows the league (see above); commissioner
  `INSERT` only. `UPDATE` and `DELETE` are disabled entirely at the database
  level via the `audit_log_immutable()` triggers — not just via RLS —
  enforcing true immutability. Never add an UPDATE/DELETE policy to this
  table. A private league's audit log is just as complete and immutable as
  a public one's — "every commissioner action is public" (principle 2) means
  no hidden admin behavior *among who can already see the league*, not that
  every league's history is visible to the entire internet.

The canonical schema + policies live in `supabase/migrations/0001_init.sql`,
with league visibility layered on in `0013_league_visibility.sql`. Never
loosen these policies for dev convenience.

## Phase status

Phase 1 (Foundation) is complete: schema + RLS, Supabase clients + middleware,
Google OAuth commissioner login, public league shell, and commissioner
dashboard shell. Phases 2–5 (league CRUD, scoring engine wiring, nflverse
imports) are not yet built. The public pages currently render from
`lib/sample-data.ts` until the data layer is wired in later phases.
