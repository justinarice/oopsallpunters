import Link from 'next/link'
import { ArrowRight, Download, Megaphone, Repeat, Trophy } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  sampleImports,
  sampleStandings,
  sampleTrades,
} from '@/lib/sample-data'
import { formatDate, formatDateTime, formatPoints } from '@/lib/format'

export default async function LeagueHomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const topThree = sampleStandings.slice(0, 3)

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
                render={<Link href={`/league/${slug}/standings`} />}
              >
                Full standings
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
            <CardDescription>Top teams by season punter points.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topThree.map((row) => (
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
                    {row.punter ? `${row.punter.name} · ${row.punter.team}` : 'No punter assigned'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-semibold">
                    {formatPoints(row.seasonPoints)}
                  </p>
                  <p className="text-xs text-muted-foreground">pts</p>
                </div>
              </div>
            ))}
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
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm leading-relaxed">
                Welcome to the {new Date().getFullYear()} season! Punters are
                assigned. Weekly imports run every Tuesday after Monday Night
                Football.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Posted {formatDate('2026-07-16T10:00:00Z')}
              </p>
            </div>
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
                <CardTitle>Latest transactions</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href={`/league/${slug}/transactions`} />}
              >
                View all
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {sampleTrades.map((trade) => (
              <div key={trade.id} className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5">
                  Trade
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{trade.punter}</span> moved
                    from {trade.from_team} to {trade.to_team}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(trade.date)}
                  </p>
                </div>
              </div>
            ))}
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
            {sampleImports.map((imp) => (
              <div key={imp.id} className="flex items-center gap-3">
                <Badge
                  variant={imp.status === 'success' ? 'default' : 'destructive'}
                  className="capitalize"
                >
                  {imp.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Week {imp.week}</p>
                  <p className="text-xs text-muted-foreground">
                    {imp.source === 'nflverse' ? 'nflverse' : 'CSV upload'} ·{' '}
                    {formatDateTime(imp.date)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
