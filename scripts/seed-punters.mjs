// Seeds the punters catalog from nflverse roster data.
// Fetches the most recent available season roster, filters to position "P",
// dedupes by gsis_id (nflverse punter_player_id), and upserts into public.punters.
//
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/seed-punters.mjs

import pg from "pg"

const { Client } = pg

function parseCsvToArrays(text) {
  const rows = []
  let field = ""
  let row = []
  let inQuotes = false
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field)
      rows.push(row)
      field = ""
      row = []
    } else field += ch
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function parseCsv(text) {
  const rows = parseCsvToArrays(text)
  if (!rows.length) return []
  const header = rows[0]
  return rows.slice(1).flatMap((cells) => {
    if (cells.length === 1 && cells[0] === "") return []
    const obj = {}
    header.forEach((h, i) => (obj[h] = cells[i] ?? ""))
    return [obj]
  })
}

async function fetchRoster() {
  const seasons = [2025, 2024]
  for (const season of seasons) {
    const url = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.log(`[seed] ${season} roster not available (${res.status})`)
        continue
      }
      const text = await res.text()
      console.log(`[seed] Using ${season} roster (${text.length} bytes)`)
      return parseCsv(text)
    } catch (err) {
      console.log(`[seed] fetch failed for ${season}:`, err.message)
    }
  }
  throw new Error("Could not fetch any nflverse roster")
}

// Prefer the row that best reflects a punter's current standing.
const STATUS_RANK = { ACT: 5, RES: 4, RET: 3, TRC: 2, CUT: 1 }

async function main() {
  const rows = await fetchRoster()
  const punters = new Map()

  for (const r of rows) {
    if (r.position !== "P") continue
    const playerId = r.gsis_id?.trim()
    const name = r.full_name?.trim()
    if (!playerId || !name) continue

    const week = Number.parseInt(r.week || "0", 10) || 0
    const rank = STATUS_RANK[r.status] ?? 0
    const existing = punters.get(playerId)
    // Keep the latest week; break ties by status rank.
    if (
      !existing ||
      week > existing.week ||
      (week === existing.week && rank > existing.rank)
    ) {
      punters.set(playerId, {
        playerId,
        name,
        team: r.team?.trim() || null,
        active: r.status === "ACT",
        week,
        rank,
      })
    }
  }

  const list = [...punters.values()]
  console.log(`[seed] ${list.length} unique punters found`)

  const connectionString =
    process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
  if (!connectionString) throw new Error("No POSTGRES_URL configured")
  const cleaned = connectionString
    .replace(/([?&])sslmode=[^&]*/i, "$1")
    .replace(/[?&]$/, "")

  const client = new Client({
    connectionString: cleaned,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  let count = 0
  for (const p of list) {
    await client.query(
      `insert into public.punters (player_id, name, team, active)
       values ($1, $2, $3, $4)
       on conflict (player_id) do update
         set name = excluded.name,
             team = excluded.team,
             active = excluded.active`,
      [p.playerId, p.name, p.team, p.active],
    )
    count++
  }

  await client.end()
  console.log(`[seed] Upserted ${count} punters`)
}

main().catch((err) => {
  console.error("[seed] Error:", err)
  process.exit(1)
})
