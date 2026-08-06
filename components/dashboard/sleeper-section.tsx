"use client"

import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"
import { Link2, RefreshCw, Unlink } from "lucide-react"
import { linkSleeperLeague, type LinkSleeperResult } from "@/lib/actions/league"
import { syncSleeperScores } from "@/lib/actions/sleeper"
import type { ActionResult } from "@/lib/actions/guard"
import type { League, Team } from "@/lib/types"
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

  const [, linkAction, linking] = useActionState(
    async (
      prev: ActionResult<LinkSleeperResult> | null,
      fd: FormData,
    ) => {
      const res = await linkSleeperLeague(prev, fd)
      if (res.ok && res.data) {
        setUnmatched(res.data.unmatched)
        toast.success(
          `Linked to Sleeper — matched ${res.data.matched} of ${teams.length} teams.`,
        )
      } else if (!res.ok) {
        toast.error(res.error)
      }
      return res
    },
    null,
  )

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
                defaultValue={league.sleeper_league_id ?? ""}
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
            Couldn&apos;t match: {unmatched.join(", ")}. Check that each
            team&apos;s Sleeper username (in Team management) matches a member
            of that Sleeper league, then re-sync.
          </p>
        )}

        {isLinked && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
            <div>
              <p className="text-sm font-medium">
                {rosteredCount}/{teams.length} teams matched to a Sleeper
                roster
              </p>
              <p className="text-sm text-muted-foreground">
                Pull this week&apos;s Sleeper matchup points into the combined
                standings.
              </p>
            </div>
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
        )}
      </CardContent>
    </Card>
  )
}
