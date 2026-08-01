import { AtSign } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { sampleStandings } from '@/lib/sample-data'
import { formatPoints, initials } from '@/lib/format'

export default function TeamsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Teams</h2>
        <p className="text-sm text-muted-foreground">
          Every team, its owner, current punter, and season points.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sampleStandings.map((row) => (
          <Card key={row.team.id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Avatar className="size-11">
                  <AvatarFallback className="bg-secondary font-semibold">
                    {initials(row.team.team_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{row.team.team_name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {row.team.owner_name}
                  </p>
                </div>
                <Badge variant="secondary" className="font-mono">
                  #{row.rank}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Current punter
                </p>
                {row.punter ? (
                  <p className="mt-1 flex items-center gap-2 font-medium">
                    {row.punter.name}
                    <Badge variant="secondary">{row.punter.team}</Badge>
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">Unassigned</p>
                )}
              </div>
              <Separator />
              <div className="flex items-end justify-between">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <AtSign className="size-3.5" />
                  {row.team.sleeper_username ?? '—'}
                </div>
                <div className="text-right">
                  <p className="font-mono text-xl font-semibold">
                    {formatPoints(row.seasonPoints)}
                  </p>
                  <p className="text-xs text-muted-foreground">season pts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
