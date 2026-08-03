"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  logAction,
  requireCommissioner,
  type ActionResult,
} from "@/lib/actions/guard"

export type { ActionResult }

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

const createSchema = z.object({
  name: z.string().trim().min(1, "League name is required.").max(80),
  season: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Season must be a 4-digit year."),
})

/**
 * Create a new league owned by the current user. Any signed-in user may create
 * a league (they become its commissioner). A unique slug is derived from the
 * name, with a numeric suffix on collision.
 */
export async function createLeague(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    season: formData.get("season"),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }
  const { name, season } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  // Find an available slug.
  const base = slugify(name) || "league"
  let slug = base
  for (let i = 2; i < 100; i++) {
    const { data: existing } = await supabase
      .from("leagues")
      .select("id")
      .eq("slug", slug)
      .maybeSingle()
    if (!existing) break
    slug = `${base}-${i}`
  }

  const { data: league, error } = await supabase
    .from("leagues")
    .insert({
      name,
      season,
      slug,
      commissioner_id: user.id,
    })
    .select("id, slug")
    .single()
  if (error) return { ok: false, error: error.message }

  // Seed a default scoring rule set so the scoring page isn't empty.
  const defaultRules = [
    { stat: "inside_20", points: 2, modifier: "each" },
    { stat: "gross_yards", points: 1, modifier: "per_10" },
    { stat: "net_yards", points: 1, modifier: "per_10" },
    { stat: "touchback", points: -1, modifier: "each" },
    { stat: "blocked", points: -3, modifier: "each" },
    { stat: "fair_catch", points: 1, modifier: "each" },
    { stat: "longest", points: 1, modifier: "each" },
  ]
  await supabase.from("scoring_rules").insert(
    defaultRules.map((r) => ({ ...r, league_id: league.id })),
  )

  // Audit entry (uses the verified-commissioner context we just created).
  const ctx = await requireCommissioner(league.id)
  await logAction(ctx, `Created league "${name}" (${season})`, null, {
    slug,
    season,
  })

  revalidatePath("/dashboard")
  revalidatePath("/")
  return { ok: true }
}

const settingsSchema = z.object({
  leagueId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required.").max(80),
  season: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Season must be a 4-digit year."),
  announcement: z.string().trim().max(1000).optional().or(z.literal("")),
})

/** Update league name / season / announcement. */
export async function updateLeagueSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse({
    leagueId: formData.get("leagueId"),
    name: formData.get("name"),
    season: formData.get("season"),
    announcement: formData.get("announcement") ?? "",
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }
  const { leagueId, name, season, announcement } = parsed.data

  try {
    const ctx = await requireCommissioner(leagueId)

    const { data: before } = await ctx.supabase
      .from("leagues")
      .select("name, season, announcement")
      .eq("id", leagueId)
      .maybeSingle()

    const nextAnnouncement =
      announcement && announcement.length > 0 ? announcement : null

    const { error } = await ctx.supabase
      .from("leagues")
      .update({ name, season, announcement: nextAnnouncement })
      .eq("id", leagueId)
    if (error) return { ok: false, error: error.message }

    const changes: string[] = []
    if (before?.name !== name) changes.push("name")
    if (before?.season !== season) changes.push("season")
    if ((before?.announcement ?? null) !== nextAnnouncement)
      changes.push("announcement")

    await logAction(
      ctx,
      `Updated league settings (${changes.join(", ") || "no changes"})`,
      before ?? null,
      { name, season, announcement: nextAnnouncement },
    )

    revalidatePath(`/league/${ctx.slug}`, "layout")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
