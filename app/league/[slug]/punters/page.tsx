import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { PuntersTable, type PunterRow } from "@/components/punters-table"
import { createClient } from "@/lib/supabase/server"
import {
  getLeagueBySlug,
  getPuntersWithOwners,
  getStandings,
} from "@/lib/queries"

export default async function PuntersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const league = await getLeagueBySlug(slug)
  if (!league) notFound()

  const [puntersWithOwners, standings] = await Promise.all([
    getPuntersWithOwners(league.id),
    getStandings(league.id),
  ])

  // Latest weekly stats per punter (season totals shown once imports exist).
  const supabase = await createClient()
  const { data: stats } = await supabase
    .from("weekly_stats")
    .select(
      "player_id, attempts, average, longest, inside_20, touchbacks, blocked, week",
    )
    .eq("season", league.season)

  // Aggregate season stats by player_id.
  const byPlayer = new Map<
    string,
    { attempts: number; longest: number; inside20: number; touchbacks: number; blocked: number; avgSum: number; avgN: number }
  >()
  for (const s of stats ?? []) {
    const key = s.player_id as string
    const agg = byPlayer.get(key) ?? {
      attempts: 0,
      longest: 0,
      inside20: 0,
      touchbacks: 0,
      blocked: 0,
      avgSum: 0,
      avgN: 0,
    }
    agg.attempts += (s.attempts as number) ?? 0
    agg.longest = Math.max(agg.longest, (s.longest as number) ?? 0)
    agg.inside20 += (s.inside_20 as number) ?? 0
    agg.touchbacks += (s.touchbacks as number) ?? 0
    agg.blocked += (s.blocked as number) ?? 0
    if (s.average != null) {
      agg.avgSum += Number(s.average)
      agg.avgN += 1
    }
    byPlayer.set(key, agg)
  }

  // Season points per punter, from standings (points follow the roster).
  const pointsByPunter = new Map<string, number>()
  for (const row of standings) {
    if (row.punter) pointsByPunter.set(row.punter.id, row.seasonPoints)
  }

  const rows: PunterRow[] = puntersWithOwners.map(({ punter, ownerTeam }) => {
    const agg = byPlayer.get(punter.player_id)
    return {
      id: punter.id,
      name: punter.name,
      nflTeam: punter.team ?? "FA",
      owner: ownerTeam?.team_name ?? null,
      seasonPoints: pointsByPunter.get(punter.id) ?? 0,
      attempts: agg?.attempts ?? 0,
      average: agg && agg.avgN > 0 ? agg.avgSum / agg.avgN : 0,
      longest: agg?.longest ?? 0,
      inside20: agg?.inside20 ?? 0,
      touchbacks: agg?.touchbacks ?? 0,
      blocked: agg?.blocked ?? 0,
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Punters</h2>
        <p className="text-sm text-muted-foreground">
          All NFL punters in the catalog. Click any column header to sort.
        </p>
      </div>
      <Card className="overflow-hidden p-0">
        <PuntersTable rows={rows} />
      </Card>
    </div>
  )
}
