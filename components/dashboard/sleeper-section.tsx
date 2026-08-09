"use client"

import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"
import { AlertTriangle, History, Link2, RefreshCw, Search, Unlink } from "lucide-react"
import {
  discoverSleeperLeagues,
  linkSleeperLeague,
  unlinkSleeperLeague,
  type DiscoveredSleeperLeague,
  type LinkSleeperResult,
} from "@/lib/actions/league"
import {
  backfillSleeperScores,
  syncSleeperScores,
} from "@/lib/actions/sleeper"
import type { ActionResult } from "@/lib/actions/guard"
import type { League, Team } from "@/lib/types"
import { formatRelativeTime, initials } from "@/lib/format"
import { sleeperAvatarUrl } from "@/lib/sleeper-avatar"
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
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export function SleeperSection({
  league,
  teams,
}: {
  league: League
  teams: Team[]
}) {
  const isLinked = !!league.sleeper_league_id
  const rosteredCount = teams.filter((t) => t.sleeper_roster_id != null).length
  const [unmatched, setUnmatched] = useState<string[]>([])

  // The Sleeper league ID field is controlled (rather than defaultValue)
  // so a discovered league can fill it in without a full form remount.
  const [sleeperLeagueIdValue, setSleeperLeagueIdValue] = useState(
    league.sleeper_league_id ?? "",
  )

  const [, linkAction, linking] = useActionState(
    async (
      prev: ActionResult<LinkSleeperResult> | null,
      fd: FormData,
    ) => {
      const res = await linkSleeperLeague(prev, fd)
      if (res.ok && res.data) {
        setUnmatched(res.data.unmatched)
        const { matched, created, skippedRosters } = res.data
        const parts = [`${matched} matched`]
        if (created > 0) parts.push(`${created} new team${created === 1 ? "" : "s"} created`)
        if (skippedRosters > 0) parts.push(`${skippedRosters} roster${skippedRosters === 1 ? "" : "s"} skipped (no owner)`)
        toast.success(`Linked to Sleeper — ${parts.join(", ")}.`)
      } else if (!res.ok) {
        toast.error(res.error)
      }
      return res
    },
    null,
  )

  // --- Username-based league discovery ---
  const [discoverUsername, setDiscoverUsername] = useState("")
  const [discovered, setDiscovered] = useState<DiscoveredSleeperLeague[]>([])
  const [discovering, startDiscover] = useTransition()

  function onDiscover() {
    const username = discoverUsername.trim()
    if (!username) {
      toast.error("Enter a Sleeper username first.")
      return
    }
    startDiscover(async () => {
      const res = await discoverSleeperLeagues({
        leagueId: league.id,
        sleeperUsername: username,
      })
      if (res.ok && res.data) {
        setDiscovered(res.data)
      } else if (!res.ok) {
        toast.error(res.error)
        setDiscovered([])
      }
    })
  }

  // --- Single-week sync ---
  const [syncing, startSync] = useTransition()

  function onSync() {
    startSync(async () => {
      const res = await syncSleeperScores({ leagueId: league.id })
      if (res.ok && res.data) {
        toast.success(
          `Synced week ${res.data.week} — ${res.data.updated} rosters updated${
            res.data.unmatchedRosters.length > 0
              ? `, ${res.data.unmatchedRosters.length} unmatched`
              : ""
          }.`,
        )
      } else if (!res.ok) {
        toast.error(res.error)
      }
    })
  }

  // --- Backfill (multi-week) sync ---
  const [showBackfill, setShowBackfill] = useState(false)
  const [backfillFrom, setBackfillFrom] = useState("1")
  const [backfillThrough, setBackfillThrough] = useState("")
  const [backfilling, startBackfill] = useTransition()

  function onBackfill() {
    startBackfill(async () => {
      const res = await backfillSleeperScores({
        leagueId: league.id,
        fromWeek: backfillFrom ? Number(backfillFrom) : undefined,
        throughWeek: backfillThrough ? Number(backfillThrough) : undefined,
      })
      if (res.ok && res.data) {
        const { weeksSynced, weeksSkipped, totalUpdated, unmatchedRosters } = res.data
        const range =
          weeksSynced.length > 1
            ? `weeks ${weeksSynced[0]}–${weeksSynced[weeksSynced.length - 1]}`
            : `week ${weeksSynced[0]}`
        const parts = [`${totalUpdated} rosters updated`]
        if (weeksSkipped.length > 0) {
          parts.push(`${weeksSkipped.length} week${weeksSkipped.length === 1 ? "" : "s"} skipped (no data yet)`)
        }
        if (unmatchedRosters.length > 0) {
          parts.push(`${unmatchedRosters.length} unmatched`)
        }
        toast.success(`Backfilled ${range} — ${parts.join(", ")}.`)
        setShowBackfill(false)
      } else if (!res.ok) {
        toast.error(res.error)
      }
    })
  }

  // --- Unlink ---
  const [unlinking, startUnlink] = useTransition()

  function onUnlink() {
    startUnlink(async () => {
      const res = await unlinkSleeperLeague({ leagueId: league.id })
      if (res.ok && res.data) {
        setUnmatched([])
        toast.success(
          `Unlinked from Sleeper — ${res.data.teamsCleared} team${res.data.teamsCleared === 1 ? "" : "s"} reset.`,
        )
      } else if (!res.ok) {
        toast.error(res.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Sleeper integration</CardTitle>
          {isLinked ? (
            <Badge variant="secondary" className="gap-1">
              <Link2 className="size-3" />
              Linked
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <Unlink className="size-3" />
              Not linked
            </Badge>
          )}
        </div>
        <CardDescription>
          Link this league to a real Sleeper league to pull real team
          identities and combine Sleeper&apos;s scoring with punter points on
          the standings page. Nothing syncs automatically — you trigger every
          pull below, and it&apos;s written to the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="discoverUsername">
              Find by Sleeper username
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id="discoverUsername"
                placeholder="e.g. justinrice"
                value={discoverUsername}
                onChange={(e) => setDiscoverUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    onDiscover()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={discovering}
                onClick={onDiscover}
              >
                {discovering ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Search data-icon="inline-start" />
                )}
                Find leagues
              </Button>
            </div>
            <FieldDescription>
              Looks up every {league.season} Sleeper league that username
              belongs to, so you don&apos;t have to copy an ID out of a
              Sleeper URL. Optional — you can still enter the ID directly
              below.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {discovered.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border border-border p-1">
            {discovered.map((d) => (
              <button
                key={d.sleeperLeagueId}
                type="button"
                onClick={() => {
                  setSleeperLeagueIdValue(d.sleeperLeagueId)
                  setDiscovered([])
                }}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <Avatar className="size-8">
                  {d.avatar && (
                    <AvatarImage src={sleeperAvatarUrl(d.avatar, true)} alt="" />
                  )}
                  <AvatarFallback className="bg-secondary text-xs font-semibold">
                    {initials(d.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.totalRosters} teams · {d.status}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        <form action={linkAction}>
          <input type="hidden" name="leagueId" value={league.id} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="sleeperLeagueId">
                Sleeper league ID
              </FieldLabel>
              <Input
                id="sleeperLeagueId"
                name="sleeperLeagueId"
                inputMode="numeric"
                placeholder="e.g. 1124827208393781248"
                value={sleeperLeagueIdValue}
                onChange={(e) => setSleeperLeagueIdValue(e.target.value)}
                required
              />
              <FieldDescription>
                Found in your Sleeper league&apos;s URL:
                sleeper.com/leagues/<strong>this part</strong>/team.
                Re-run this any time to pick up new/renamed Sleeper members.
              </FieldDescription>
            </Field>
            <div>
              <Button type="submit" disabled={linking}>
                {linking && <Spinner data-icon="inline-start" />}
                {isLinked ? "Re-sync teams" : "Link league"}
              </Button>
            </div>
          </FieldGroup>
        </form>

        {unmatched.length > 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            These existing teams couldn&apos;t be matched to a Sleeper member
            and were left as-is: {unmatched.join(", ")}. Check each team&apos;s
            Sleeper username (in Team management), then re-sync. New teams
            are created automatically for any Sleeper roster without a
            matching team already.
          </p>
        )}

        {isLinked && league.sleeper_unmatched_rosters.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              {league.sleeper_unmatched_rosters.length} Sleeper roster
              {league.sleeper_unmatched_rosters.length === 1 ? "" : "s"} (
              {league.sleeper_unmatched_rosters
                .map((id) => `#${id}`)
                .join(", ")}
              ) didn&apos;t match a team as of the last sync (week{" "}
              {league.sleeper_last_synced_week}). Check each team&apos;s
              Sleeper username in Team management, then re-sync.
            </p>
          </div>
        )}

        {isLinked && (
          <div className="flex flex-col gap-3 rounded-md border border-border px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {rosteredCount}/{teams.length} teams matched to a Sleeper
                  roster
                </p>
                <p className="text-sm text-muted-foreground">
                  Pull this week&apos;s Sleeper matchup points into the combined
                  standings.
                </p>
                <p className="text-xs text-muted-foreground">
                  {league.sleeper_last_synced_at
                    ? `Last synced week ${league.sleeper_last_synced_week} · ${formatRelativeTime(league.sleeper_last_synced_at)}`
                    : "Never synced yet"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button variant="ghost" size="sm" disabled={unlinking}>
                        {unlinking ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <Unlink data-icon="inline-start" />
                        )}
                        Unlink
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Unlink from Sleeper?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This resets every team&apos;s Sleeper identity (avatar,
                        roster match) and clears cached Sleeper scores from the
                        combined standings. Punter scoring is untouched, and
                        it&apos;s fully reversible — re-link and re-sync any
                        time. Recorded in the audit log.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onUnlink}>
                        Unlink league
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={backfilling}
                  onClick={() => setShowBackfill((v) => !v)}
                >
                  <History data-icon="inline-start" />
                  Backfill weeks
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncing}
                  onClick={onSync}
                >
                  {syncing ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <RefreshCw data-icon="inline-start" />
                  )}
                  Sync this week&apos;s scores
                </Button>
              </div>
            </div>

            {showBackfill && (
              <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
                <Field className="w-24">
                  <FieldLabel htmlFor="backfillFrom">From week</FieldLabel>
                  <Input
                    id="backfillFrom"
                    inputMode="numeric"
                    value={backfillFrom}
                    onChange={(e) => setBackfillFrom(e.target.value)}
                  />
                </Field>
                <Field className="w-32">
                  <FieldLabel htmlFor="backfillThrough">
                    Through week
                  </FieldLabel>
                  <Input
                    id="backfillThrough"
                    inputMode="numeric"
                    placeholder="Current week"
                    value={backfillThrough}
                    onChange={(e) => setBackfillThrough(e.target.value)}
                  />
                </Field>
                <Button
                  type="button"
                  size="sm"
                  disabled={backfilling}
                  onClick={onBackfill}
                >
                  {backfilling && <Spinner data-icon="inline-start" />}
                  Run backfill
                </Button>
                <p className="w-full text-xs text-muted-foreground">
                  Syncs every week in that range in one go. Weeks Sleeper
                  hasn&apos;t played yet are skipped, not treated as errors.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
