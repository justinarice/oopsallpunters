import { readFileSync } from "node:fs"
import { Client } from "pg"

const file = process.argv[2]
if (!file) {
  console.error("Usage: node scripts/run-migration.mjs <path-to-sql>")
  process.exit(1)
}

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!connectionString) {
  console.error("No POSTGRES_URL_NON_POOLING / POSTGRES_URL in env")
  process.exit(1)
}

const sql = readFileSync(file, "utf8")

// Strip any sslmode param so pg uses our explicit ssl object instead of
// upgrading to verify-full (which rejects Supabase's self-signed chain).
const cleaned = connectionString.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "")
const client = new Client({ connectionString: cleaned, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query(sql)
  console.log(`[migration] applied ${file}`)
} catch (err) {
  console.error("[migration] failed:", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
