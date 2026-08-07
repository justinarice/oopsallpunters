"use client"

import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"
import { Pencil } from "lucide-react"
import {
  updateScoringRule,
  type UpdateScoringRuleResult,
} from "@/lib/actions/scoring"
import type { ActionResult } from "@/lib/actions/guard"
import type { ScoringRule } from "@/lib/types"
import { MODIFIER_LABELS, STAT_LABELS } from "@/lib/sample-data"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"

function EditRuleDialog({
  leagueId,
  rule,
  open,
  onOpenChange,
}: {
  leagueId: string
  rule: ScoringRule
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [recalculate, setRecalculate] = useState(false)
  const [, formAction, pending] = useActionState(
    async (
      prev: ActionResult<UpdateScoringRuleResult> | null,
      fd: FormData,
    ) => {
      const res = await updateScoringRule(prev, fd)
      if (res.ok && res.data) {
        if (res.data.oldPoints === res.data.newPoints) {
          toast.info("No change — value was already that.")
        } else if (res.data.recalculatedScores > 0 || fd.get("recalculatePastWeeks") === "true") {
          toast.success(
            `Updated ${STAT_LABELS[rule.stat] ?? rule.stat} — recalculated ${res.data.recalculatedScores} scores across ${res.data.recalculatedWeeks} weeks.`,
          )
        } else {
          toast.success(
            `Updated ${STAT_LABELS[rule.stat] ?? rule.stat} — takes effect week ${res.data.effectiveWeek}. Past weeks unchanged.`,
          )
        }
        onOpenChange(false)
      } else if (!res.ok) {
        toast.error(res.error)
      }
      return res
    },
    null,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={formAction}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="stat" value={rule.stat} />
          <input
            type="hidden"
            name="recalculatePastWeeks"
            value={recalculate ? "true" : "false"}
          />
          <DialogHeader>
            <DialogTitle>
              Edit {STAT_LABELS[rule.stat] ?? rule.stat}
            </DialogTitle>
            <DialogDescription>
              {MODIFIER_LABELS[rule.modifier] ?? rule.modifier} · currently{" "}
              {rule.points > 0 ? `+${rule.points}` : rule.points} points
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-2">
            <Field>
              <FieldLabel htmlFor="points">Points</FieldLabel>
              <Input
                id="points"
                name="points"
                type="number"
                step="0.1"
                defaultValue={rule.points}
                required
              />
            </Field>

            <Field>
              <div className="flex items-start gap-3 rounded-md border border-border p-3">
                <input
                  type="checkbox"
                  id="recalculatePastWeeks"
                  checked={recalculate}
                  onChange={(e) => setRecalculate(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <label htmlFor="recalculatePastWeeks" className="text-sm">
                  <span className="font-medium">
                    Recalculate past weeks retroactively
                  </span>
                  <FieldDescription>
                    {recalculate
                      ? "Every already-scored week in this league will be recomputed with the new value, right now."
                      : "Past weeks keep their existing points. The new value only applies going forward."}
                  </FieldDescription>
                </label>
              </div>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ScoringSection({
  leagueId,
  scoringRules,
}: {
  leagueId: string
  scoringRules: ScoringRule[]
}) {
  const [editingStat, setEditingStat] = useState<string | null>(null)
  const editingRule = scoringRules.find((r) => r.stat === editingStat) ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring editor</CardTitle>
        <CardDescription>
          Edit point values here. Every change is recorded to the public
          audit log along with whether it was applied retroactively.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {scoringRules.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No scoring rules configured yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Statistic</TableHead>
                <TableHead>Modifier</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {scoringRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">
                    {STAT_LABELS[rule.stat] ?? rule.stat}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {MODIFIER_LABELS[rule.modifier] ?? rule.modifier}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={rule.points < 0 ? "destructive" : "secondary"}
                      className="font-mono"
                    >
                      {rule.points > 0 ? `+${rule.points}` : rule.points}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setEditingStat(rule.stat)}
                      aria-label={`Edit ${STAT_LABELS[rule.stat] ?? rule.stat}`}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {editingRule && (
        <EditRuleDialog
          leagueId={leagueId}
          rule={editingRule}
          open={!!editingRule}
          onOpenChange={(open) => !open && setEditingStat(null)}
        />
      )}
    </Card>
  )
}
