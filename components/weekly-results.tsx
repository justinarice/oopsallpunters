'use client'

import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatPoints } from '@/lib/format'
import type { WeeklyStats } from '@/lib/types'

type Row = WeeklyStats & { punterName: string; owner: string; points: number }

export function WeeklyResults({
  weeks,
  rowsByWeek,
}: {
  weeks: number[]
  rowsByWeek: Record<number, Row[]>
}) {
  const [week, setWeek] = useState(weeks[weeks.length - 1])
  const rows = rowsByWeek[week] ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          Week
        </span>
        {weeks.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWeek(w)}
            aria-pressed={w === week}
            className={cn(
              'inline-flex h-8 min-w-9 items-center justify-center rounded-md border px-2 font-mono text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              w === week
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {w}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty className="rounded-xl border border-dashed border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDays />
            </EmptyMedia>
            <EmptyTitle>No stats imported for Week {week}</EmptyTitle>
            <EmptyDescription>
              The commissioner hasn&apos;t imported this week yet. Imports
              typically land the Tuesday after Monday Night Football.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Punter</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Att</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">In 20</TableHead>
                <TableHead className="text-right">TB</TableHead>
                <TableHead className="text-right">Blk</TableHead>
                <TableHead className="text-right">Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.punterName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.owner}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.attempts}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.gross_yards}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.net_yards}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.average.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.inside_20}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.touchbacks}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.blocked}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge className="font-mono">{formatPoints(r.points)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
