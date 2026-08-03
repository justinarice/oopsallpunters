import pg from "pg"

const { Client } = pg
const client = new Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
})

async function q(label, sql, params = []) {
  const { rows } = await client.query(sql, params)
  console.log(`[test] ${label}:`, JSON.stringify(rows))
  return rows
}

async function main() {
  await client.connect()

  const [league] = await q(
    "league",
    "select id, commissioner_id from leagues where slug = 'oops-all-punters'",
  )
  const [team] = await q(
    "team",
    "select id, team_name from teams where league_id = $1 order by team_name asc limit 1",
    [league.id],
  )

  // Pick an ACTIVE free agent (not currently owned in this league).
  const [fa] = await q(
    "free agent",
    `select p.id, p.name from punters p
     where p.active = true
       and p.id not in (
         select punter_id from roster_assignments
         where league_id = $1 and ended_at is null
       )
     order by p.name asc limit 1`,
    [league.id],
  )

  console.log("\n[test] === assign_punter ===")
  try {
    await client.query(
      "select assign_punter($1,$2,$3)",
      [league.id, team.id, fa.id],
    )
    await q(
      "active assignment after assign",
      "select team_id, punter_id, ended_at from roster_assignments where league_id=$1 and punter_id=$2 order by assigned_at desc",
      [league.id, fa.id],
    )
  } catch (e) {
    console.log("[test] assign error:", e.message)
  }

  // Second team to trade to.
  const [team2] = await q(
    "team2",
    "select id, team_name from teams where league_id=$1 and id <> $2 order by team_name asc limit 1",
    [league.id, team.id],
  )

  console.log("\n[test] === trade_punter (soft-close + reopen) ===")
  try {
    await client.query(
      "select trade_punter($1,$2,$3,$4)",
      [league.id, fa.id, team2.id, "Test trade"],
    )
    await q(
      "assignment rows after trade (expect 1 closed, 1 open)",
      "select team_id, ended_at is null as active from roster_assignments where league_id=$1 and punter_id=$2 order by assigned_at asc",
      [league.id, fa.id],
    )
    await q(
      "trades row",
      "select from_team, to_team, notes from trades where league_id=$1 and punter_id=$2 order by date desc limit 1",
      [league.id, fa.id],
    )
  } catch (e) {
    console.log("[test] trade error:", e.message)
  }

  console.log("\n[test] === guard: assign already-owned should fail ===")
  try {
    await client.query("select assign_punter($1,$2,$3)", [league.id, team.id, fa.id])
    console.log("[test] UNEXPECTED: assign of owned punter succeeded")
  } catch (e) {
    console.log("[test] correctly rejected:", e.message)
  }

  // Cleanup: close the assignment so repeated runs are idempotent.
  await client.query(
    "update roster_assignments set ended_at = now() where league_id=$1 and punter_id=$2 and ended_at is null",
    [league.id, fa.id],
  )
  await client.query(
    "delete from trades where league_id=$1 and punter_id=$2 and notes='Test trade'",
    [league.id, fa.id],
  )
  console.log("\n[test] cleaned up test rows")

  await client.end()
}

main().catch((e) => {
  console.error("[test] fatal:", e.message)
  process.exit(1)
})
