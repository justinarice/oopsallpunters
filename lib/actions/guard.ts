import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface CommishContext {
  supabase: SupabaseClient
  userId: string
  actorName: string
  leagueId: string
  slug: string
}

/** Uniform result shape returned by every server action. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

/**
 * Runs `fn` with a verified commissioner context, translating thrown auth /
 * validation errors into a friendly ActionResult instead of an unhandled
 * server-action rejection.
 */
export async function withCommissioner<T = undefined>(
  leagueId: string,
  fn: (ctx: CommishContext) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  let ctx: CommishContext
  try {
    ctx = await requireCommissioner(leagueId)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  try {
    return await fn(ctx)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Verifies the current user is signed in AND is the commissioner of the given
 * league, returning a context bundle for the action to use.
 *
 * This is defense-in-depth on TOP of RLS: RLS already blocks writes where
 * auth.uid() != leagues.commissioner_id (see supabase/migrations/0001_init.sql),
 * but checking here lets us fail fast with a clear message instead of a raw
 * policy violation, and lets us capture the actor for the audit log.
 */
export async function requireCommissioner(
  leagueId: string,
): Promise<CommishContext> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("You must be signed in.")

  const { data: league, error } = await supabase
    .from("leagues")
    .select("id, slug, commissioner_id")
    .eq("id", leagueId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!league) throw new Error("League not found.")
  if (league.commissioner_id !== user.id)
    throw new Error("Only the league commissioner can do that.")

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle()

  const actorName =
    (profile?.name as string | null) ??
    (user.user_metadata?.name as string | undefined) ??
    "Commissioner"

  return { supabase, userId: user.id, actorName, leagueId, slug: league.slug }
}

/**
 * Appends an immutable entry to the public audit log. Every commissioner
 * mutation MUST call this so the "every action is public" principle holds.
 * The audit_log table has no UPDATE/DELETE policy and a DB-level trigger
 * blocking both, so these rows can never be altered afterward.
 */
export async function logAction(
  ctx: CommishContext,
  action: string,
  before: unknown = null,
  after: unknown = null,
): Promise<void> {
  const { error } = await ctx.supabase.from("audit_log").insert({
    league_id: ctx.leagueId,
    actor: ctx.userId,
    actor_name: ctx.actorName,
    action,
    before: before === null ? null : (before as Record<string, unknown>),
    after: after === null ? null : (after as Record<string, unknown>),
  })
  if (error) {
    // The mutation already happened; surface the logging failure loudly since
    // an unlogged action violates the transparency principle.
    console.error("[v0] audit log write failed:", error.message)
    throw new Error("Action completed but failed to write the audit log.")
  }
}
