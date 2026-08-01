import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { sampleStandings } from '@/lib/sample-data'
import { formatPoints } from '@/lib/format'

export default function StandingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Standings</h2>
        <p className="text-sm text-muted-foreground">
          Ranked by total punter fantasy points across the season.
        </p>
      </div>
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Punter</TableHead>
              <TableHead className="text-right">Last Week</TableHead>
              <TableHead className="text-right">Season</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleStandings.map((row) => (
              <TableRow key={row.team.id}>
                <TableCell className="text-center font-mono font-semibold text-muted-foreground">
                  {row.rank}
                </TableCell>
                <TableCell>
                  <p className="font-medium">{row.team.team_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.team.owner_name}
                  </p>
                </TableCell>
                <TableCell>
                  {row.punter ? (
                    <span className="flex items-center gap-2">
                      {row.punter.name}
                      <Badge variant="secondary">{row.punter.team}</Badge>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {row.lastWeekPoints != null
                    ? formatPoints(row.lastWeekPoints)
                    : '—'}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {formatPoints(row.seasonPoints)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
