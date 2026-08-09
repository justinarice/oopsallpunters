# oopsallpunters

Oops All Punters is a fan-made fantasy football companion app for tracking punter-only fantasy scoring alongside a Sleeper league.

It is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕-FFDD00?style=flat-square)](https://buymeacoffee.com/justinrice)

## How It Works

Oops All Punters combines your Sleeper league with NFL punting statistics to create a fantasy scoring experience focused entirely on punters.

1. **Connect your Sleeper league** — The app reads public league data from Sleeper to identify your league and its teams.
2. **Pull NFL statistics** — Player and game statistics are sourced from [nflverse](https://github.com/nflverse), specifically the [nflverse-data](https://github.com/nflverse/nflverse-data) repository.
3. **Calculate punter fantasy scores** — Punting statistics are converted into fantasy points using the league's punter-specific scoring rules.
4. **Track the competition** — Scores and rankings let you see how your punters are performing throughout the season.

The goal is simple: **take the most undervalued positions in fantasy football and make it valued.**

## Data Sources & Attribution

NFL player and statistical data used by Oops All Punters is provided by the [nflverse](https://github.com/nflverse) project, specifically the [nflverse-data](https://github.com/nflverse/nflverse-data) repository.

A huge thank-you to the nflverse contributors for collecting, maintaining, and making this data available to the community.

Please note that the NFL data is provided by nflverse and ultimately belongs to its respective data owners. Oops All Punters is not affiliated with or endorsed by nflverse or the NFL.

## Disclaimer

Oops All Punters is an independent, fan-made companion app for tracking punter-only fantasy scoring alongside a Sleeper league. It is **not affiliated with, endorsed by, or created by Sleeper**.

"Sleeper" and any related marks belong to their respective owners. This project only reads public league data via Sleeper's API to support its own punter-scoring feature.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open http://localhost:3000 with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment variables

Browser-exposed (`NEXT_PUBLIC_*`, required for the app to run):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (safe to expose — access is enforced by RLS, not by keeping this secret) |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL, used for building absolute links |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Overrides the auth email-confirmation redirect target in local dev |

Server-only, needed only to run the one-off scripts in `scripts/` (never read by the deployed app itself):

| Variable | Purpose |
|---|---|
| `POSTGRES_URL_NON_POOLING` / `POSTGRES_URL` | Direct Postgres connection used by `scripts/run-migration.mjs`, `scripts/run-security-tests.mjs`, and the seed scripts to apply SQL outside of RLS |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | Supabase Admin API key, used by `scripts/seed-demo.mjs` and `scripts/run-security-tests.mjs` to create/delete auth users |
| `DEMO_COMMISSIONER_PASSWORD` | Password for the demo commissioner account created by `scripts/seed-demo.mjs` — no default, must be set explicitly |

## Security model

Row Level Security enforces almost everything: anonymous users get full public `SELECT` on league data; only a league's own commissioner (`public.is_commissioner(league_id)`) may `INSERT`/`UPDATE`/`DELETE` that league's rows. Two tables are global (not scoped to a single league) and are handled differently:

- **`punters`** (the shared punter catalog) has no write policy at all — nobody can write it through the API, not even a commissioner. It's maintained out-of-band via `scripts/seed-punters.mjs`, which connects directly to Postgres and bypasses RLS entirely.
- **`weekly_stats`** (raw imported stats) allows `INSERT` from any authenticated commissioner (of any league) via `public.is_any_commissioner()`, and denies `UPDATE`/`DELETE` to everyone — matching the app's own append-only, never-overwritten import design.

`profiles` is select/insert/update-own only. `audit_log` is public-`SELECT` + commissioner-`INSERT`, with `UPDATE`/`DELETE` disabled at the database level (not just via RLS) so it's genuinely immutable. `team_invites` has no public-select policy at all — claiming happens exclusively through the `SECURITY DEFINER` RPCs `get_invite_preview`/`claim_team_invite`, and invite tokens expire 30 days after creation. See `supabase/migrations/0001_init.sql`, `0009_tighten_global_data_rls.sql`, and `0010_invite_expiration.sql` for the canonical policy definitions — never loosen them for dev convenience.

## Running migrations

```bash
node scripts/run-migration.mjs supabase/migrations/000N_description.sql
```

Migrations are flat, sequentially-numbered `.sql` files under `supabase/migrations/`, applied via a direct Postgres connection (no Supabase CLI is used in this project).

## Running the security test suite

```bash
pnpm test:security
```

Runs the pgTAP regression suite in `supabase/tests/**` (RLS policy checks, cross-league IDOR attempts, the invite-claim lifecycle, and commissioner-scoped operations) against the database identified by `POSTGRES_URL_NON_POOLING`/`POSTGRES_URL`. Requires the `pgtap` Postgres extension to be available, and runs entirely inside rolled-back transactions — it doesn't touch real data, aside from creating and then deleting a few throwaway auth users via the Supabase Admin API.

## Learn More

To learn more, take a look at these resources:

* [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
* [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
* [v0 Documentation](https://v0.app/docs) - learn how to build with v0.
* [nflverse](https://github.com/nflverse) - NFL data and analytics community.
* [nflverse-data](https://github.com/nflverse/nflverse-data) - source repository for nflverse data.
* [Sleeper API Documentation](https://docs.sleeper.com/) - documentation for the public Sleeper API.
