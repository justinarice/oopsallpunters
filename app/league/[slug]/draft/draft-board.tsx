"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, Clock, Search, Timer } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { makeDraftPick, resolveDraftClock } from "@/lib/actions/draft"
import type { DraftPick, DraftSettings, DraftState, Punter, Team } from "@/lib/types"
import { TeamAvatar } from "@/components/team-avatar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

// Client poll interval. Purely a read-only resync of settings/state/picks —
// a fallback for Realtime, which can drop a connection silently. Resolving
// an expired pick clock is never done on a timer (CLAUDE.md principle 3 —
// "the commissioner initiates every state change"): it only happens when
// the commissioner clicks "Resolve pick" below.
const POLL_MS = 4000

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  paused: "Paused",
  complete: "Complete",
}

function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.ceil(msRemaining / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export function DraftBoard({
  leagueId,
  teams,
  punters,
  initialSettings,
  initialState,
  initialPicks,
  myTeamId,
  isCommissioner,
}: {
  leagueId: string
  teams: Team[]
  punters: Punter[]
  initialSettings: DraftSettings | null
  initialState: DraftState | null
  initialPicks: DraftPick[]
  myTeamId: string | null
  isCommissioner: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [settings, setSettings] = useState<DraftSettings | null>(initialSettings)
  const [draftState, setDraftState] = useState<DraftState | null>(initialState)
  const [picks, setPicks] = useState<DraftPick[]>(initialPicks)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [query, setQuery] = useState("")
  const [picking, startPicking] = useTransition()

  const status = settings?.status ?? "not_started"
  const teamOrder = settings?.team_order ?? []
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])
  const punterById = useMemo(() => new Map(punters.map((p) => [p.id, p])), [punters])
  const draftedPunterIds = useMemo(() => new Set(picks.map((p) => p.punter_id)), [picks])
  const pickByTeam = useMemo(() => {
    const m = new Map<string, DraftPick>()
    for (const p of picks) m.set(p.team_id, p)
    return m
  }, [picks])

  const available = useMemo(
    () =>
      punters
        .filter((p) => p.active && !draftedPunterIds.has(p.id))
        .filter((p) => {
          const q = query.trim().toLowerCase()
          if (!q) return true
          return p.name.toLowerCase().includes(q) || (p.team ?? "").toLowerCase().includes(q)
        }),
    [punters, draftedPunterIds, query],
  )

  const onClockTeam = draftState?.current_team_id
    ? teamById.get(draftState.current_team_id)
    : null
  const canPickForClock =
    status === "in_progress" &&
    !!draftState?.current_team_id &&
    (isCommissioner || myTeamId === draftState.current_team_id)

  // Live 1s countdown tick, only while there's an active deadline to count
  // down to.
  useEffect(() => {
    if (status !== "in_progress" || !draftState?.pick_deadline) return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [status, draftState?.pick_deadline])

  // Realtime: near-instant updates for new picks and clock advances.
  useEffect(() => {
    const channel = supabase
      .channel(`draft-${leagueId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "draft_picks", filter: `league_id=eq.${leagueId}` },
        (payload) => {
          const row = payload.new as DraftPick
          setPicks((prev) =>
            prev.some((p) => p.id === row.id)
              ? prev
              : [...prev, row].sort((a, b) => a.pick_number - b.pick_number),
          )
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_state", filter: `league_id=eq.${leagueId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return
          setDraftState(payload.new as DraftState)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [leagueId, supabase])

  // Polling fallback + the lazy clock-resolve trigger. Paused via the Page
  // Visibility API so a backgrounded tab doesn't keep hammering the DB.
  const resync = useCallback(async () => {
    const [{ data: s }, { data: st }, { data: p }] = await Promise.all([
      supabase.from("draft_settings").select("*").eq("league_id", leagueId).maybeSingle(),
      supabase.from("draft_state").select("*").eq("league_id", leagueId).maybeSingle(),
      supabase.from("draft_picks").select("*").eq("league_id", leagueId).order("pick_number", { ascending: true }),
    ])
    if (s) setSettings(s as DraftSettings)
    setDraftState((st ?? null) as DraftState | null)
    if (p) setPicks(p as DraftPick[])
    return s as DraftSettings | null
  }, [leagueId, supabase])

  useEffect(() => {
    let cancelled = false

    async function tick() {
      if (document.visibilityState !== "visible") return
      if (cancelled) return
      await resync()
    }

    tick()
    const interval = setInterval(tick, POLL_MS)
    document.addEventListener("visibilitychange", tick)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [leagueId, resync])

  function onPick(punterId: string) {
    startPicking(async () => {
      const res = await makeDraftPick({ leagueId, punterId })
      if (res.ok) toast.success("Pick submitted.")
      else if (res.error) toast.error(res.error)
    })
  }

  const [resolving, startResolving] = useTransition()
  function onResolveClock() {
    startResolving(async () => {
      const res = await resolveDraftClock({ leagueId })
      if (!res.ok) toast.error(res.error)
      else if (res.data?.resolved) toast.success("Pick clock resolved.")
      else toast.message("The clock hasn't expired yet.")
      await resync()
    })
  }

  const totalPicks = teamOrder.length
  const madeCount = picks.length
  const msRemaining = draftState?.pick_deadline
    ? new Date(draftState.pick_deadline).getTime() - nowTick
    : 0

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Live draft board</CardTitle>
            <Badge variant={status === "in_progress" ? "default" : "secondary"}>
              {STATUS_LABEL[status]}
            </Badge>
            {totalPicks > 0 && (
              <span className="text-sm text-muted-foreground">
                {madeCount} / {totalPicks} picks made
              </span>
            )}
          </div>
          <CardDescription>
            One punter per team, one fixed round. Anyone can watch — only the
            on-the-clock team&apos;s owner (or the commissioner) can pick.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "not_started" && (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              The draft hasn&apos;t started yet.
              {isCommissioner && " Configure it from the dashboard's Draft tab."}
            </p>
          )}

          {status === "paused" && (
            <p className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 px-4 py-6 text-center text-sm text-amber-700 dark:text-amber-400">
              The draft is paused by the commissioner. Picks will resume once
              it&apos;s unpaused.
            </p>
          )}

          {status === "complete" && (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              The draft is complete — every team has a punter. Check the
              Roster tab to see final rosters.
            </p>
          )}

          {status === "in_progress" && onClockTeam && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <TeamAvatar
                    teamName={onClockTeam.team_name}
                    sleeperAvatar={onClockTeam.sleeper_avatar}
                    className="size-10"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Pick {draftState?.current_pick_number} of {totalPicks} — on the clock
                    </p>
                    <p className="font-semibold">{onClockTeam.team_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-2xl font-semibold tabular-nums">
                  <Timer className="size-5 text-muted-foreground" />
                  {msRemaining > 0 ? formatCountdown(msRemaining) : "0:00"}
                </div>
              </div>

              {canPickForClock ? (
                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <p className="text-sm font-medium">
                    {isCommissioner && myTeamId !== draftState?.current_team_id
                      ? `Pick on behalf of ${onClockTeam.team_name}`
                      : "Make your pick"}
                  </p>
                  {isCommissioner && msRemaining <= 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-2">
                      <p className="text-sm text-muted-foreground">
                        This pick&apos;s clock has run out. You can pick
                        below, or resolve it from {onClockTeam.team_name}
                        &apos;s queue (or a random available punter if
                        empty).
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolving}
                        onClick={onResolveClock}
                      >
                        {resolving && <Spinner data-icon="inline-start" />}
                        Resolve pick
                      </Button>
                    </div>
                  )}
                  <div className="relative">
                    <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search available punters…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
                    {available.length === 0 && (
                      <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No punters match &ldquo;{query}&rdquo;.
                      </li>
                    )}
                    {available.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.team ?? "FA"}</p>
                        </div>
                        <Button size="sm" disabled={picking} onClick={() => onPick(p.id)}>
                          {picking && <Spinner data-icon="inline-start" />}
                          Draft
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                  Waiting for {onClockTeam.team_name} to pick.
                  {msRemaining <= 0
                    ? " The clock has run out — waiting for the commissioner to resolve it."
                    : " If the clock runs out, the commissioner can auto-draft from their queue."}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {teamOrder.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Draft order</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col divide-y divide-border">
              {teamOrder.map((teamId, i) => {
                const team = teamById.get(teamId)
                if (!team) return null
                const pick = pickByTeam.get(teamId)
                const punter = pick ? punterById.get(pick.punter_id) : null
                const isOnClock = status === "in_progress" && draftState?.current_pick_number === i + 1
                return (
                  <li key={teamId} className="flex items-center gap-3 py-3">
                    <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">
                      {i + 1}
                    </span>
                    <TeamAvatar
                      teamName={team.team_name}
                      sleeperAvatar={team.sleeper_avatar}
                      className="size-8"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{team.team_name}</p>
                      {punter ? (
                        <p className="truncate text-sm text-muted-foreground">
                          {punter.name}
                          {pick?.auto_drafted && (
                            <Badge variant="outline" className="ml-2">
                              auto
                            </Badge>
                          )}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {isOnClock ? "On the clock" : "—"}
                        </p>
                      )}
                    </div>
                    {punter ? (
                      <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    ) : isOnClock ? (
                      <Clock className="size-4 shrink-0 text-muted-foreground" />
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
