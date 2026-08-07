"use client"

import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { League } from "@/lib/types"

/**
 * Lets a commissioner switch which of their leagues the dashboard manages,
 * via a `?league=<slug>` search param (bookmarkable/shareable, and the
 * server component reads it directly — no client state to keep in sync).
 * Renders nothing when there's only one league, since there's nothing to
 * pick between.
 */
export function LeaguePicker({
  leagues,
  selectedSlug,
}: {
  leagues: League[]
  selectedSlug: string
}) {
  const router = useRouter()
  if (leagues.length <= 1) return null

  // Two leagues can share a display name (e.g. a friend's copy of the same
  // league name) — disambiguate with the season, and the slug if that's
  // still not enough.
  const nameCounts = new Map<string, number>()
  for (const l of leagues) nameCounts.set(l.name, (nameCounts.get(l.name) ?? 0) + 1)

  return (
    <Select
      value={selectedSlug}
      onValueChange={(slug) => {
        if (slug) router.push(`/dashboard?league=${slug}`)
      }}
    >
      <SelectTrigger className="w-full sm:w-64">
        <SelectValue placeholder="Choose a league" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {leagues.map((l) => {
            const dup = (nameCounts.get(l.name) ?? 0) > 1
            return (
              <SelectItem key={l.id} value={l.slug}>
                {l.name} · {l.season}
                {dup ? ` (${l.slug})` : ""}
              </SelectItem>
            )
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
