"use client"

import { useActionState, useRef, useState } from "react"
import { toast } from "sonner"
import { Download, Upload } from "lucide-react"
import {
  importWeeklyStats,
  type ImportWeeklyStatsResult,
} from "@/lib/actions/import"
import { importWeeklyStatsFromNflverse } from "@/lib/actions/nflverse-import"
import type { ActionResult } from "@/lib/actions/guard"
import type { ImportHistory } from "@/lib/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { formatDateTime } from "@/lib/format"

function NflverseImportCard({ leagueId, season }: { leagueId: string; season: string }) {
  const [force, setForce] = useState(false)
  const [unmatched, setUnmatched] = useState<string[]>([])

  const [, formAction, pending] = useActionState(
    async (
      prev: ActionResult<ImportWeeklyStatsResult> | null,
      fd: FormData,
    ) => {
      const res = await importWeeklyStatsFromNflverse(prev, fd)
      if (res.ok && res.data) {
        setUnmatched(res.data.unmatchedRows)
        toast.success(
          `Imported ${res.data.matched} punters from nflverse — ${res.data.scoresWritten} scores written${
            res.data.unmatchedRows.length > 0
              ? `, ${res.data.unmatchedRows.length} unmatched`
              : ""
          }.`,
        )
        setForce(false)
      } else if (!res.ok) {
        toast.error(res.error)
      }
      return res
    },
    null,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from nflverse</CardTitle>
        <CardDescription>
          Pulls that week&apos;s punts straight from nflverse&apos;s
          play-by-play data — no file needed. Two things to know: nflverse
          has no dedicated punting table, so <code>net_yards</code> here is
          approximated as gross minus return yardage (not an official
          touchback-adjusted figure), and <code>surrender_index</code> isn&apos;t
          available from raw play-by-play at all, so it&apos;s left blank.
          Use the CSV importer if you have a source with those exact.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="force" value={force ? "true" : "false"} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nflverseWeek">Week</FieldLabel>
              <Input
                id="nflverseWeek"
                name="week"
                type="number"
                min={1}
                max={23}
                required
                className="w-24"
              />
              <FieldDescription>Season {season}</FieldDescription>
            </Field>

            <Field>
              <div className="flex items-start gap-3 rounded-md border border-border p-3">
                <input
                  type="checkbox"
                  id="nflverseForce"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <label htmlFor="nflverseForce" className="text-sm">
                  <span className="font-medium">Force re-import</span>
                  <FieldDescription>
                    Re-run even if this exact result was already imported for
                    this week (use if nflverse corrected their data).
                  </FieldDescription>
                </label>
              </div>
            </Field>
          </FieldGroup>

          <div className="mt-4">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Download data-icon="inline-start" />
              )}
              {pending ? "Fetching from nflverse…" : "Import from nflverse"}
            </Button>
          </div>
        </form>

        {unmatched.length > 0 && (
          <p className="mt-4 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            Couldn&apos;t match {unmatched.length} player ID
            {unmatched.length === 1 ? "" : "s"} from nflverse to your punter
            catalog: {unmatched.join(", ")}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function ImportSection({
  leagueId,
  season,
  importHistory,
}: {
  leagueId: string
  season: string
  importHistory: ImportHistory[]
}) {
  const [csvText, setCsvText] = useState("")
  const [force, setForce] = useState(false)
  const [unmatched, setUnmatched] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [, formAction, pending] = useActionState(
    async (
      prev: ActionResult<ImportWeeklyStatsResult> | null,
      fd: FormData,
    ) => {
      const res = await importWeeklyStats(prev, fd)
      if (res.ok && res.data) {
        setUnmatched(res.data.unmatchedRows)
        toast.success(
          `Imported ${res.data.matched} punters — ${res.data.scoresWritten} scores written${
            res.data.unmatchedRows.length > 0
              ? `, ${res.data.unmatchedRows.length} rows unmatched`
              : ""
          }.`,
        )
        setCsvText("")
        if (fileInputRef.current) fileInputRef.current.value = ""
        setForce(false)
      } else if (!res.ok) {
        toast.error(res.error)
      }
      return res
    },
    null,
  )

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsvText(text)
  }

  return (
    <div className="flex flex-col gap-6">
      <NflverseImportCard leagueId={leagueId} season={season} />

      <Card>
        <CardHeader>
          <CardTitle>Import weekly stats from a CSV</CardTitle>
          <CardDescription>
            Upload or paste a CSV of punter stats for one week. Columns can
            be named loosely (e.g. &quot;Gross Yards&quot; or
            &quot;gross_yards&quot; both work) — punters are matched by
            player ID first, then by name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="csvText" value={csvText} />
            <input type="hidden" name="force" value={force ? "true" : "false"} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="week">Week</FieldLabel>
                <Input
                  id="week"
                  name="week"
                  type="number"
                  min={1}
                  max={23}
                  required
                  className="w-24"
                />
                <FieldDescription>Season {season}</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="csvFile">CSV file</FieldLabel>
                <input
                  ref={fileInputRef}
                  id="csvFile"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onFileChange}
                  className="text-sm"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="csvPaste">
                  ...or paste CSV directly
                </FieldLabel>
                <Textarea
                  id="csvPaste"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="player_id,attempts,gross_yards,net_yards,inside_20,touchbacks..."
                  rows={6}
                  className="font-mono text-xs"
                />
              </Field>

              <Field>
                <div className="flex items-start gap-3 rounded-md border border-border p-3">
                  <input
                    type="checkbox"
                    id="force"
                    checked={force}
                    onChange={(e) => setForce(e.target.checked)}
                    className="mt-0.5 size-4"
                  />
                  <label htmlFor="force" className="text-sm">
                    <span className="font-medium">Force re-import</span>
                    <FieldDescription>
                      Re-run even if this exact file was already imported for
                      this week (use for an intentional correction).
                    </FieldDescription>
                  </label>
                </div>
              </Field>
            </FieldGroup>

            <div className="mt-4">
              <Button type="submit" disabled={pending || !csvText.trim()}>
                {pending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Upload data-icon="inline-start" />
                )}
                Import week
              </Button>
            </div>
          </form>

          {unmatched.length > 0 && (
            <p className="mt-4 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              Couldn&apos;t match {unmatched.length} row
              {unmatched.length === 1 ? "" : "s"}: {unmatched.join(", ")}.
              Check the player_id/name column against the punter catalog.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
          <CardDescription>
            Every import attempt, successful or not — part of the public
            audit trail.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {importHistory.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No imports yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importHistory.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.week}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {h.source === "csv_upload" ? "CSV upload" : "nflverse"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          h.status === "success"
                            ? "secondary"
                            : h.status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {h.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(h.date)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
