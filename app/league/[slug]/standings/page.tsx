import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getLeagueBySlug, getStandings } from "@/lib/queries"
import { formatPoints } from "@/lib/format"

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const league = await getLeagueBySlug(slug)
  if (!league) notFound()
  const standings = await getStandings(league.id)
  const isLinked = standings.some((r) => r.sleeperPoints !== null)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Standings</h2>
        <p className="text-sm text-muted-foreground">
          {isLinked
            ? "Ranked by punter points combined with your Sleeper league score."
            : "Ranked by total punter fantasy points across the season."}
        </p>
      </div>
      {standings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No teams yet. The commissioner can add teams from the dashboard.
        </p>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Punter</TableHead>
                <TableHead className="text-right">Last Week</TableHead>
                <TableHead className="text-right">
                  {isLinked ? "Punter Pts" : "Season"}
                </TableHead>
                {isLinked && (
                  <>
                    <TableHead className="text-right">Sleeper Pts</TableHead>
                    <TableHead className="text-right">Combined</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((row) => (
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
                        <Badge variant="secondary">
                          {row.punter.team ?? "FA"}
                        </Badge>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {row.lastWeekPoints != null
                      ? formatPoints(row.lastWeekPoints)
                      : "—"}
                  </TableCell>
                  <TableCell
                    className={
                      isLinked
                        ? "text-right font-mono text-muted-foreground"
                        : "text-right font-mono font-semibold"
                    }
                  >
                    {formatPoints(row.seasonPoints)}
                  </TableCell>
                  {isLinked && (
                    <>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {row.sleeperPoints != null
                          ? formatPoints(row.sleeperPoints)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {row.combinedPoints != null
                          ? formatPoints(row.combinedPoints)
                          : "—"}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
