"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { ArrowLeftRight, UserMinus, UserPlus } from "lucide-react"
import { assignPunter, releasePunter, tradePunter } from "@/lib/actions/roster"
import type { PunterWithOwner, Team } from "@/lib/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function RosterSection({
  leagueId,
  teams,
  punters,
}: {
  leagueId: string
  teams: Team[]
  punters: PunterWithOwner[]
}) {
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [tradeTeam, setTradeTeam] = useState<Record<string, string>>({})

  const teamName = (id: string) =>
    teams.find((t) => t.id === id)?.team_name ?? "Unknown"

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return punters
    return punters.filter(
      (p) =>
        p.punter.name.toLowerCase().includes(q) ||
        (p.punter.team ?? "").toLowerCase().includes(q),
    )
  }, [punters, query])

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.ok) toast.success(success)
      else if (res.error) toast.error(res.error)
    })
  }

  if (teams.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Roster &amp; trades</CardTitle>
          <CardDescription>Assign, trade, and release punters.</CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="rounded-lg border border-dashed border-border">
            <EmptyTitle>Add teams first</EmptyTitle>
            <EmptyDescription>
              You need at least one team before you can assign punters.
            </EmptyDescription>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roster &amp; trades</CardTitle>
        <CardDescription>
          Assign free agents, trade owned punters between teams, or release them.
          Every action is recorded publicly.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Input
          placeholder="Search punters by name or NFL team…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="flex flex-col divide-y divide-border">
          {filtered.map(({ punter, ownerTeam }) => {
            const selectedTradeTarget = tradeTeam[punter.id] ?? ""
            return (
              <li
                key={punter.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {punter.name}
                    <Badge variant="secondary">{punter.team ?? "FA"}</Badge>
                    {!punter.active && <Badge variant="outline">inactive</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {ownerTeam ? `Owned by ${ownerTeam.team_name}` : "Free agent"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {!ownerTeam ? (
                    // Free agent → assign to a team
                    <>
                      <Select
                        value={selectedTradeTarget}
                        onValueChange={(v) =>
                          setTradeTeam((s) => ({ ...s, [punter.id]: v ?? "" }))
                        }
                      >
                        <SelectTrigger size="sm" className="w-40">
                          <SelectValue placeholder="Assign to…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {teams.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.team_name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={pending || !selectedTradeTarget || !punter.active}
                        onClick={() =>
                          run(
                            () =>
                              assignPunter({
                                leagueId,
                                teamId: selectedTradeTarget,
                                punterId: punter.id,
                              }),
                            `Assigned ${punter.name}.`,
                          )
                        }
                      >
                        <UserPlus data-icon="inline-start" />
                        Assign
                      </Button>
                    </>
                  ) : (
                    // Owned → trade to another team, or release
                    <>
                      <Select
                        value={selectedTradeTarget}
                        onValueChange={(v) =>
                          setTradeTeam((s) => ({ ...s, [punter.id]: v ?? "" }))
                        }
                      >
                        <SelectTrigger size="sm" className="w-40">
                          <SelectValue placeholder="Trade to…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {teams
                              .filter((t) => t.id !== ownerTeam.id)
                              .map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.team_name}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending || !selectedTradeTarget}
                        onClick={() =>
                          run(
                            () =>
                              tradePunter({
                                leagueId,
                                toTeam: selectedTradeTarget,
                                punterId: punter.id,
                              }),
                            `Traded ${punter.name} to ${teamName(selectedTradeTarget)}.`,
                          )
                        }
                      >
                        <ArrowLeftRight data-icon="inline-start" />
                        Trade
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => releasePunter({ leagueId, punterId: punter.id }),
                            `Released ${punter.name}.`,
                          )
                        }
                      >
                        <UserMinus data-icon="inline-start" />
                        Release
                      </Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No punters match “{query}”.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
