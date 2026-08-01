import { Info } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  MODIFIER_LABELS,
  STAT_LABELS,
  sampleScoringRules,
} from '@/lib/sample-data'

export default function ScoringPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Scoring rules</h2>
        <p className="text-sm text-muted-foreground">
          Exactly how punter fantasy points are calculated. Fully public.
        </p>
      </div>

      <Alert>
        <Info />
        <AlertTitle>Configuration over hardcoding</AlertTitle>
        <AlertDescription>
          These values drive the scoring engine entirely — no point values are
          baked into code. When the commissioner changes a rule, the change and
          its effective window are recorded in the public audit log.
        </AlertDescription>
      </Alert>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Statistic</TableHead>
              <TableHead>Modifier</TableHead>
              <TableHead className="text-right">Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleScoringRules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">
                  {STAT_LABELS[rule.stat] ?? rule.stat}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {MODIFIER_LABELS[rule.modifier] ?? rule.modifier}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={rule.points < 0 ? 'destructive' : 'secondary'}
                    className="font-mono"
                  >
                    {rule.points > 0 ? `+${rule.points}` : rule.points}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
