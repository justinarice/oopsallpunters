"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, ListPlus, Search, X } from "lucide-react"
import {
  addToDraftQueue,
  removeFromDraftQueue,
  reorderDraftQueue,
} from "@/lib/actions/draft"
import type { DraftQueueEntryView, Punter } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"

/**
 * Autodraft queue for the signed-in visitor's own team. Usable any time
 * before or during the draft (see migration 0012 — draft_queues is
 * owner-scoped plain RLS, checked at the DB regardless of what this UI
 * shows). If this team's pick times out, resolve_draft_clock drafts the
 * first entry here that's still available.
 */
export function DraftQueuePanel({
  leagueId,
  teamId,
  initialQueue,
  availablePunters,
}: {
  leagueId: string
  teamId: string
  initialQueue: DraftQueueEntryView[]
  availablePunters: Punter[]
}) {
  const [queue, setQueue] = useState(initialQueue)
  const [query, setQuery] = useState("")
  const [pending, startTransition] = useTransition()

  const queuedIds = useMemo(() => new Set(queue.map((q) => q.punter.id)), [queue])
  const candidates = useMemo(
    () =>
      availablePunters
        .filter((p) => !queuedIds.has(p.id))
        .filter((p) => {
          const q = query.trim().toLowerCase()
          if (!q) return true
          return p.name.toLowerCase().includes(q) || (p.team ?? "").toLowerCase().includes(q)
        }),
    [availablePunters, queuedIds, query],
  )

  function onAdd(punter: Punter) {
    startTransition(async () => {
      const res = await addToDraftQueue({ leagueId, teamId, punterId: punter.id })
      if (res.ok && res.data) {
        const entryId = res.data.entryId
        setQueue((prev) => [...prev, { id: entryId, punter, priority: prev.length + 1 }])
        toast.success(`Added ${punter.name} to your queue.`)
      } else if (!res.ok) toast.error(res.error)
    })
  }

  function onRemove(entry: DraftQueueEntryView) {
    startTransition(async () => {
      const res = await removeFromDraftQueue({ leagueId, entryId: entry.id })
      if (res.ok) {
        setQueue((prev) => prev.filter((q) => q.id !== entry.id))
        toast.success(`Removed ${entry.punter.name} from your queue.`)
      } else if (res.error) toast.error(res.error)
    })
  }

  function onMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= queue.length) return
    const reordered = [...queue]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setQueue(reordered)
    startTransition(async () => {
      const res = await reorderDraftQueue({
        leagueId,
        teamId,
        orderedEntryIds: reordered.map((q) => q.id),
      })
      if (!res.ok) {
        toast.error(res.error)
        setQueue(queue) // revert on failure
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListPlus className="size-4 text-primary" />
          <CardTitle>Your draft queue</CardTitle>
        </div>
        <CardDescription>
          Rank punters ahead of time. If your pick&apos;s clock runs out,
          the top available punter here gets auto-drafted for you — set
          this up any time before or during the draft.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {queue.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            Your queue is empty. Add punters below in the order you&apos;d
            want them.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
            {queue.map((entry, i) => (
              <li key={entry.id} className="flex items-center gap-2 px-3 py-2">
                <span className="w-5 shrink-0 text-sm text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.punter.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.punter.team ?? "FA"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${entry.punter.name} up`}
                  disabled={pending || i === 0}
                  onClick={() => onMove(i, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${entry.punter.name} down`}
                  disabled={pending || i === queue.length - 1}
                  onClick={() => onMove(i, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${entry.punter.name}`}
                  disabled={pending}
                  onClick={() => onRemove(entry)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search punters to add…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query.trim() && (
            <ul className="flex max-h-56 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
              {candidates.length === 0 && (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No punters match &ldquo;{query}&rdquo;.
                </li>
              )}
              {candidates.slice(0, 25).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <Badge variant="secondary" className="mt-0.5">
                      {p.team ?? "FA"}
                    </Badge>
                  </div>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => onAdd(p)}>
                    {pending && <Spinner data-icon="inline-start" />}
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
