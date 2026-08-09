// Seeds a fully-populated demo league owned by a confirmed commissioner.
// - Commissioner is created via the Supabase Admin API (email pre-confirmed),
//   so you can log in immediately with the printed credentials.
// - League data is inserted via direct Postgres (bypassing RLS for seeding).
//
// Run AFTER seed-punters.mjs:
//   node --env-file-if-exists=/vercel/share/.env.project scripts/seed-demo.mjs

import pg from "pg"
import { createClient } from "@supabase/supabase-js"

const { Client } = pg

const demoPassword = process.env.DEMO_COMMISSIONER_PASSWORD
if (!demoPassword) {
  console.error(
    "[demo] Set DEMO_COMMISSIONER_PASSWORD before running this script " +
      "(no default — this account is created with email_confirm: true, so a " +
      "hardcoded password would be a real, immediately-usable credential).",
  )
  process.exit(1)
}

const COMMISH = {
  email: "commissioner@oopsallpunters.app",
  password: demoPassword,
  name: "Dan the Commish",
}

const LEAGUE = {
  name: "Oops All Punters",
  slug: "oops-all-punters",
  season: "2025",
  announcement:
    "Welcome to season one! Week 1 stats import opens the Tuesday after MNF. Trade window is open.",
}

const TEAMS = [
  { team_name: "Hangtime Heroes", owner_name: "Marcus", sleeper_username: "marcus_p" },
  { team_name: "Shank City", owner_name: "Priya", sleeper_username: "priya23" },
  { team_name: "Inside the 20", owner_name: "Devon", sleeper_username: "dvn" },
  { team_name: "Touchback Tyrants", owner_name: "Sam", sleeper_username: "sammyG" },
  { team_name: "Net Gains", owner_name: "Alex", sleeper_username: "alexkicks" },
  { team_name: "Coffin Corner", owner_name: "Jordan", sleeper_username: "jordo" },
]

const SCORING_RULES = [
  { stat: "gross_yards", points: 1, modifier: "per_10" },
  { stat: "net_yards", points: 1, modifier: "per_10" },
  { stat: "inside_20", points: 2, modifier: "each" },
  { stat: "touchbacks", points: -2, modifier: "each" },
  { stat: "longest", points: 1, modifier: "flat" },
  { stat: "blocked", points: -5, modifier: "each" },
  { stat: "fair_catches", points: 0.5, modifier: "each" },
]

async function ensureCommissioner() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey)
    throw new Error("Missing SUPABASE_URL / SERVICE_ROLE key")

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Try to create; if the user already exists, find them.
  const { data: created, error } = await admin.auth.admin.createUser({
    email: COMMISH.email,
    password: COMMISH.password,
    email_confirm: true,
    user_metadata: { name: COMMISH.name },
  })
  if (created?.user) {
    console.log("[demo] Created commissioner", COMMISH.email)
    return created.user.id
  }
  if (error && !/already/i.test(error.message)) throw error

  // Already exists — page through users to find the id.
  let page = 1
  for (;;) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (listErr) throw listErr
    const match = data.users.find((u) => u.email === COMMISH.email)
    if (match) {
      console.log("[demo] Reusing existing commissioner", COMMISH.email)
      return match.id
    }
    if (data.users.length < 200) break
    page++
  }
  throw new Error("Could not create or find commissioner user")
}

async function main() {
  const commissionerId = await ensureCommissioner()

  const connectionString =
    process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
  const cleaned = connectionString
    .replace(/([?&])sslmode=[^&]*/i, "$1")
    .replace(/[?&]$/, "")
  const db = new Client({
    connectionString: cleaned,
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()

  // Make sure the profile row exists (trigger normally handles this).
  await db.query(
    `insert into public.profiles (id, email, name)
     values ($1, $2, $3)
     on conflict (id) do update set name = excluded.name`,
    [commissionerId, COMMISH.email, COMMISH.name],
  )

  // Idempotent: wipe any prior demo league (cascades to children).
  await db.query(`delete from public.leagues where slug = $1`, [LEAGUE.slug])

  const { rows: leagueRows } = await db.query(
    `insert into public.leagues (name, slug, season, announcement, commissioner_id)
     values ($1, $2, $3, $4, $5) returning id`,
    [LEAGUE.name, LEAGUE.slug, LEAGUE.season, LEAGUE.announcement, commissionerId],
  )
  const leagueId = leagueRows[0].id
  console.log("[demo] League", LEAGUE.slug, leagueId)

  // Teams
  const teamIds = []
  for (const t of TEAMS) {
    const { rows } = await db.query(
      `insert into public.teams (league_id, team_name, owner_name, sleeper_username)
       values ($1, $2, $3, $4) returning id`,
      [leagueId, t.team_name, t.owner_name, t.sleeper_username],
    )
    teamIds.push({ id: rows[0].id, ...t })
  }

  // Scoring rules
  for (const r of SCORING_RULES) {
    await db.query(
      `insert into public.scoring_rules (league_id, stat, points, modifier)
       values ($1, $2, $3, $4)`,
      [leagueId, r.stat, r.points, r.modifier],
    )
  }

  // Assign the first 6 active punters to the 6 teams.
  const { rows: punters } = await db.query(
    `select id, name from public.punters where active = true order by name limit 6`,
  )
  for (let i = 0; i < Math.min(teamIds.length, punters.length); i++) {
    await db.query(
      `insert into public.roster_assignments (league_id, team_id, punter_id, assigned_by)
       values ($1, $2, $3, $4)`,
      [leagueId, teamIds[i].id, punters[i].id, commissionerId],
    )
    await db.query(
      `insert into public.audit_log (league_id, actor, actor_name, action, after)
       values ($1, $2, $3, $4, $5)`,
      [
        leagueId,
        commissionerId,
        COMMISH.name,
        `Assigned ${punters[i].name} to ${teamIds[i].team_name}`,
        JSON.stringify({ punter: punters[i].name, team: teamIds[i].team_name }),
      ],
    )
  }

  // League creation audit entry (oldest).
  await db.query(
    `insert into public.audit_log (league_id, actor, actor_name, action, after, ts)
     values ($1, $2, $3, $4, $5, now() - interval '10 minutes')`,
    [
      leagueId,
      commissionerId,
      COMMISH.name,
      `Created league "${LEAGUE.name}" for ${LEAGUE.season} season`,
      JSON.stringify({ season: LEAGUE.season }),
    ],
  )

  await db.end()
  console.log("[demo] Done. Login:", COMMISH.email, "/", COMMISH.password)
}

main().catch((err) => {
  console.error("[demo] Error:", err)
  process.exit(1)
})
