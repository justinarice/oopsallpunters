import { Card } from '@/components/ui/card'
import { PuntersTable, type PunterRow } from '@/components/punters-table'
import {
  samplePunters,
  sampleStandings,
  sampleWeeklyStats,
} from '@/lib/sample-data'

export default function PuntersPage() {
  // Join punter reference + latest stats + ownership/season points.
  // Later this is a Supabase query joining punters, weekly_stats, and roster_assignments.
  const rows: PunterRow[] = samplePunters.map((p) => {
    const stat = sampleWeeklyStats.find((s) => s.player_id === p.player_id)
    const standing = sampleStandings.find((s) => s.punter?.id === p.id)
    return {
      id: p.id,
      name: p.name,
      nflTeam: p.team,
      owner: standing?.team.team_name ?? null,
      seasonPoints: standing?.seasonPoints ?? 0,
      attempts: stat?.attempts ?? 0,
      average: stat?.average ?? 0,
      longest: stat?.longest ?? 0,
      inside20: stat?.inside_20 ?? 0,
      touchbacks: stat?.touchbacks ?? 0,
      blocked: stat?.blocked ?? 0,
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Punters</h2>
        <p className="text-sm text-muted-foreground">
          All rostered NFL punters. Click any column header to sort.
        </p>
      </div>
      <Card className="overflow-hidden p-0">
        <PuntersTable rows={rows} />
      </Card>
    </div>
  )
}
