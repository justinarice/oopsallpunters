// Runs the pgTAP security regression suite (supabase/tests/*.sql) against a
// real Postgres instance, entirely inside rolled-back transactions so it
// never leaves data behind — except three throwaway auth users it must
// create via the Supabase Admin API (Postgres transactions can't roll back
// GoTrue's own state), which are explicitly deleted again at the end.
//
// Requires the same env vars as scripts/seed-demo.mjs / run-migration.mjs:
//   POSTGRES_URL_NON_POOLING (or POSTGRES_URL)
//   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
//
// Requires the `pgtap` extension to be available on the target Postgres
// instance (Supabase dashboard → Database → Extensions → pgtap, or this
// script will try `create extension if not exists pgtap` itself).
//
// Usage: node scripts/run-security-tests.mjs

import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import pg from "pg"
import { createClient } from "@supabase/supabase-js"

const { Client } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testsDir = path.join(__dirname, "..", "supabase", "tests")

function requireEnv(names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name]
  }
  console.error(`[security-tests] Missing env var (tried: ${names.join(", ")})`)
  process.exit(1)
}

const supabaseUrl = requireEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"])
const serviceRoleKey = requireEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"])
const connectionString = requireEnv(["POSTGRES_URL_NON_POOLING", "POSTGRES_URL"])

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const cleaned = connectionString
  .replace(/([?&])sslmode=[^&]*/i, "$1")
  .replace(/[?&]$/, "")
const db = new Client({ connectionString: cleaned, ssl: { rejectUnauthorized: false } })

// Shared helper functions injected before every test file. `assert_ok`
// wraps pgTAP's own `ok()` so a failing assertion raises a Postgres
// exception immediately (fail-fast per file) instead of pgTAP's normal
// "report everything, keep going" style — that keeps this runner's
// pass/fail detection a plain "did the query throw", with no dependency on
// parsing/collecting TAP text across multiple result sets.
const PREAMBLE = `
create schema if not exists pgtap_tests;

create or replace function pgtap_tests.assert_ok(cond boolean, description text)
returns text
language plpgsql
as $$
declare
  v_line text;
begin
  perform plan(1);
  select ok(cond, description) into v_line;
  if v_line !~ '^ok' then
    raise exception '%', v_line;
  end if;
  return v_line;
end;
$$;

-- Switches the current session to a given Supabase role + user id for the
-- rest of this transaction, setting both the legacy JSON claims GUC and the
-- newer per-claim GUCs so it works regardless of which auth.uid() variant
-- this project's Postgres version ships.
create or replace function pgtap_tests.become(p_uid uuid, p_role text)
returns void
language plpgsql
as $$
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
  perform set_config(
    'request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', p_role)::text end,
    true
  );
end;
$$;

-- Back to the owner/superuser role used for fixture setup (bypasses RLS).
create or replace function pgtap_tests.become_owner()
returns void
language plpgsql
as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
`

async function createTestUser(label) {
  const email = `pgtap-test-${crypto.randomUUID()}@example.invalid`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: `PGTAP ${label}` },
  })
  if (error) throw new Error(`Failed to create test user (${label}): ${error.message}`)
  return data.user.id
}

async function waitForProfile(userId, label) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { rows } = await db.query("select 1 from public.profiles where id = $1", [userId])
    if (rows.length > 0) return
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`profiles row for test user (${label}) never appeared — is the handle_new_user trigger installed?`)
}

async function main() {
  console.log("[security-tests] Creating throwaway test users…")
  const commissionerA = await createTestUser("Commissioner A")
  const commissionerB = await createTestUser("Commissioner B")
  const outsider = await createTestUser("Outsider")
  const testUserIds = [commissionerA, commissionerB, outsider]

  let exitCode = 0
  try {
    await db.connect()

    try {
      await db.query("create extension if not exists pgtap")
    } catch (err) {
      console.error(
        "[security-tests] Could not create the pgtap extension. Enable it via " +
          "Supabase dashboard → Database → Extensions → pgtap, then re-run.\n" +
          `  (${err.message})`,
      )
      process.exit(1)
    }

    await waitForProfile(commissionerA, "Commissioner A")
    await waitForProfile(commissionerB, "Commissioner B")
    await waitForProfile(outsider, "Outsider")

    const files = readdirSync(testsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()

    if (files.length === 0) {
      console.error(`[security-tests] No .sql files found in ${testsDir}`)
      process.exit(1)
    }

    const results = []
    for (const file of files) {
      const filePath = path.join(testsDir, file)
      const body = readFileSync(filePath, "utf8")
      process.stdout.write(`[security-tests] ${file} ... `)

      await db.query("BEGIN")
      try {
        await db.query(
          "select set_config('pgtap_test.commissioner_a_id', $1, false), " +
            "set_config('pgtap_test.commissioner_b_id', $2, false), " +
            "set_config('pgtap_test.outsider_id', $3, false)",
          [commissionerA, commissionerB, outsider],
        )
        await db.query(PREAMBLE)
        await db.query(body)
        console.log("PASS")
        results.push({ file, ok: true })
      } catch (err) {
        console.log("FAIL")
        console.error(`  ${err.message.split("\n")[0]}`)
        results.push({ file, ok: false, error: err.message })
        exitCode = 1
      } finally {
        await db.query("ROLLBACK")
      }
    }

    console.log("")
    console.log("[security-tests] Summary:")
    for (const r of results) {
      console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.file}`)
    }
  } finally {
    await db.end()
    console.log("[security-tests] Cleaning up test users…")
    for (const id of testUserIds) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) console.error(`  Could not delete test user ${id}: ${error.message}`)
    }
  }

  process.exit(exitCode)
}

main().catch((err) => {
  console.error("[security-tests] Fatal error:", err)
  process.exit(1)
})
