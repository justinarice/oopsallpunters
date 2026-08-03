import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, Download, Megaphone, Repeat, Trophy } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getAuditLog,
  getImportHistory,
  getLeagueBySlug,
  getStandings,
  getTrades,
} from "@/lib/queries"
import { formatDate, formatDateTime, formatPoints } from "@/lib/format"

export default async function LeagueHomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const league = await getLeagueBySlug(slug)
  if (!league) notFound()

  const [standings, trades, imports, audit] = await Promise.all([
    getStandings(league.id),
    getTrades(league.id),
    getImportHistory(league.id),
    getAuditLog(league.id),
  ])
  const topThree = standings.slice(0, 3)
  // Recent activity: prefer real trades, otherwise fall back to the audit feed.
  const recentAudit = audit.slice(0, 4)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Standings snapshot */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-primary" />
                <CardTitle>Standings</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={`/league/${slug}/standings`} />}
              >
                Full standings
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
            <CardDescription>Top teams by season punter points.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topThree.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                No teams yet. The commissioner can add teams from the dashboard.
              </p>
            ) : (
              topThree.map((row) => (
                <div
                  key={row.team.id}
                  className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3"
                >
                  <span className="w-6 text-center font-mono text-lg font-semibold text-muted-foreground">
                    {row.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.team.team_name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {row.punter
                        ? `${row.punter.name} · ${row.punter.team ?? "FA"}`
                        : "No punter assigned"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-semibold">
                      {formatPoints(row.seasonPoints)}
                    </p>
                    <p className="text-xs text-muted-foreground">pts</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Announcements */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Megaphone className="size-4 text-accent" />
              <CardTitle>Announcements</CardTitle>
            </div>
            <CardDescription>Notes from the commissioner.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {league.announcement ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm leading-relaxed text-pretty">
                  {league.announcement}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {league.season} season
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No announcements posted yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Latest transactions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Repeat className="size-4 text-primary" />
                <CardTitle>Latest activity</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href={`/league/${slug}/transactions`} />}
              >
                View all
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {trades.length > 0
              ? trades.slice(0, 4).map((trade) => (
                  <div key={trade.id} className="flex items-start gap-3">
                    <Badge variant="secondary" className="mt-0.5">
                      Trade
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{trade.punter}</span> moved
                        {trade.from_team ? ` from ${trade.from_team}` : ""} to{" "}
                        {trade.to_team}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(trade.date)}
                      </p>
                    </div>
                  </div>
                ))
              : recentAudit.length > 0
                ? recentAudit.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3">
                      <Badge variant="secondary" className="mt-0.5">
                        Log
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-pretty">{entry.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(entry.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))
                : (
                    <p className="text-sm text-muted-foreground">
                      No activity recorded yet.
                    </p>
                  )}
          </CardContent>
        </Card>

        {/* Latest imports */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Download className="size-4 text-primary" />
              <CardTitle>Latest imports</CardTitle>
            </div>
            <CardDescription>Weekly stat pulls, newest first.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {imports.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No stats imported yet.
              </p>
            ) : (
              imports.slice(0, 4).map((imp) => (
                <div key={imp.id} className="flex items-center gap-3">
                  <Badge
                    variant={imp.status === "success" ? "default" : "destructive"}
                    className="capitalize"
                  >
                    {imp.status}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Week {imp.week}</p>
                    <p className="text-xs text-muted-foreground">
                      {imp.source === "nflverse" ? "nflverse" : "CSV upload"} ·{" "}
                      {formatDateTime(imp.date)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
