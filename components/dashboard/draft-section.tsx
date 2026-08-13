"use client"

import Link from "next/link"
import { useActionState, useTransition } from "react"
import { toast } from "sonner"
import { Eye, Pause, Play, RotateCcw, Shuffle } from "lucide-react"
import {
  configureDraft,
  pauseDraft,
  randomizeDraftOrder,
  resetDraft,
  resumeDraft,
  startDraft,
} from "@/lib/actions/draft"
import type { ActionResult } from "@/lib/actions/guard"
import type { DraftSettings, DraftState, Team } from "@/lib/types"
import { TeamAvatar } from "@/components/team-avatar"
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

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  paused: "Paused",
  complete: "Complete",
}

export function DraftSection({
  leagueId,
  leagueSlug,
  teams,
  draftSettings,
  draftState,
}: {
  leagueId: string
  leagueSlug: string
  teams: Team[]
  draftSettings: DraftSettings | null
  draftState: DraftState | null
}) {
  const settings = draftSettings ?? {
    league_id: leagueId,
    pick_seconds: 90,
    team_order: [],
    status: "not_started" as const,
  }
  const status = settings.status
  const notStarted = status === "not_started"
  const teamById = new Map(teams.map((t) => [t.id, t]))

  const [, configureAction, configuring] = useActionState(
    async (prev: ActionResult | null, fd: FormData) => {
      const res = await configureDraft(prev, fd)
      if (res.ok) toast.success("Pick clock updated.")
      else if (res.error) toast.error(res.error)
      return res
    },
    null,
  )

  const [randomizing, startRandomize] = useTransition()
  function onRandomize() {
    startRandomize(async () => {
      const res = await randomizeDraftOrder({ leagueId })
      if (res.ok) toast.success("Draft order randomized.")
      else if (res.error) toast.error(res.error)
    })
  }

  const [starting, startStart] = useTransition()
  function onStart() {
    startStart(async () => {
      const res = await startDraft({ leagueId })
      if (res.ok) toast.success("Draft started.")
      else if (res.error) toast.error(res.error)
    })
  }

  const [pausing, startPause] = useTransition()
  function onPause() {
    startPause(async () => {
      const res = await pauseDraft({ leagueId })
      if (res.ok) toast.success("Draft paused.")
      else if (res.error) toast.error(res.error)
    })
  }

  const [resuming, startResume] = useTransition()
  function onResume() {
    startResume(async () => {
      const res = await resumeDraft({ leagueId })
      if (res.ok) toast.success("Draft resumed — the clock has been reset for the current pick.")
      else if (res.error) toast.error(res.error)
    })
  }

  const [resetting, startReset] = useTransition()
  function onReset() {
    startReset(async () => {
      const res = await resetDraft({ leagueId })
      if (res.ok) toast.success("Draft reset.")
      else if (res.error) toast.error(res.error)
    })
  }

  const onClockTeam = draftState?.current_team_id
    ? teamById.get(draftState.current_team_id)
    : null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Punter draft</CardTitle>
          <Badge variant={status === "in_progress" ? "default" : "secondary"}>
            {STATUS_LABEL[status]}
          </Badge>
        </div>
        <CardDescription>
          One punter per team, drafted live in a single fixed round. Nothing
          resolves automatically — if a pick&apos;s clock runs out, you
          resolve it yourself from the live board, and every pick is public.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {teams.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            Add teams before configuring the draft.
          </p>
        ) : (
          <>
            <form action={configureAction}>
              <input type="hidden" name="leagueId" value={leagueId} />
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="pickSeconds">Seconds per pick</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="pickSeconds"
                      name="pickSeconds"
                      type="number"
                      min={10}
                      max={3600}
                      defaultValue={settings.pick_seconds}
                      disabled={!notStarted}
                      className="w-32"
                    />
                    <Button type="submit" variant="outline" disabled={configuring || !notStarted}>
                      {configuring && <Spinner data-icon="inline-start" />}
                      Save
                    </Button>
                  </div>
                  <FieldDescription>
                    {notStarted
                      ? "Locked once the draft starts."
                      : "Locked — the draft has already started."}
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>

            <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Draft order</p>
                {notStarted && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={randomizing}
                    onClick={onRandomize}
                  >
                    {randomizing ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Shuffle data-icon="inline-start" />
                    )}
                    Randomize order
                  </Button>
                )}
              </div>
              {settings.team_order.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not set yet — randomize to generate a draft order.
                </p>
              ) : (
                <ol className="flex flex-col divide-y divide-border">
                  {settings.team_order.map((teamId, i) => {
                    const team = teamById.get(teamId)
                    if (!team) return null
                    const isOnClock =
                      status === "in_progress" &&
                      draftState?.current_pick_number === i + 1
                    return (
                      <li
                        key={teamId}
                        className="flex items-center gap-3 py-2 text-sm"
                      >
                        <span className="w-5 shrink-0 text-muted-foreground">
                          {i + 1}.
                        </span>
                        <TeamAvatar
                          teamName={team.team_name}
                          sleeperAvatar={team.sleeper_avatar}
                          className="size-6"
                        />
                        <span className="min-w-0 flex-1 truncate">{team.team_name}</span>
                        {isOnClock && <Badge>On the clock</Badge>}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>

            {status === "in_progress" && onClockTeam && (
              <p className="text-sm text-muted-foreground">
                Pick {draftState?.current_pick_number} of {settings.team_order.length} —{" "}
                <span className="font-medium text-foreground">{onClockTeam.team_name}</span> is
                on the clock.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {notStarted && (
                <Button
                  disabled={starting || settings.team_order.length === 0}
                  onClick={onStart}
                >
                  {starting ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Play data-icon="inline-start" />
                  )}
                  Start draft
                </Button>
              )}
              {status === "in_progress" && (
                <Button variant="outline" disabled={pausing} onClick={onPause}>
                  {pausing ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Pause data-icon="inline-start" />
                  )}
                  Pause
                </Button>
              )}
              {status === "paused" && (
                <Button disabled={resuming} onClick={onResume}>
                  {resuming ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Play data-icon="inline-start" />
                  )}
                  Resume
                </Button>
              )}
              {(status === "in_progress" || status === "paused" || status === "complete") && (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/league/${leagueSlug}/draft`} />}
                >
                  <Eye data-icon="inline-start" />
                  View live board
                </Button>
              )}
              {!notStarted && (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button variant="ghost" disabled={resetting}>
                        {resetting ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <RotateCcw data-icon="inline-start" />
                        )}
                        Reset draft
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset the draft?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This undoes every pick made so far and releases the
                        punters it assigned back to free agency. The draft
                        order and pick clock stay configured, so you can
                        start again right away. This cannot be undone, and
                        it&apos;s recorded in the audit log.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onReset}>Reset draft</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
