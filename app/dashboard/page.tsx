import Link from "next/link"
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getMyLeagues,
  getTeams,
  getPuntersWithOwners,
  getScoringRules,
} from "@/lib/queries"
import { CreateLeague } from "@/components/dashboard/create-league"
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs"
import { LeaguePicker } from "@/components/dashboard/league-picker"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>
}) {
  const { league: requestedSlug } = await searchParams
  const leagues = await getMyLeagues()

  if (leagues.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Commissioner dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You don&apos;t manage a league yet. Create one to get started.
          </p>
        </div>
        <CreateLeague />
      </div>
    )
  }

  // Respects ?league=<slug> if it points at one of THIS commissioner's own
  // leagues; otherwise falls back to the most recently created one. Scoping
  // the lookup to `leagues` (already filtered to this commissioner) means a
  // stale or someone-else's slug in the URL can't leak another league in.
  const league =
    leagues.find((l) => l.slug === requestedSlug) ?? leagues[0]

  const [teams, punters, scoringRules] = await Promise.all([
    getTeams(league.id),
    getPuntersWithOwners(league.id),
    getScoringRules(league.id),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Commissioner dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Managing{" "}
            <span className="font-medium text-foreground">{league.name}</span> ·{" "}
            {league.season}. Every action here is written to the public audit
            log.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LeaguePicker leagues={leagues} selectedSlug={league.slug} />
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/league/${league.slug}`} />}
          >
            <Eye data-icon="inline-start" />
            View public page
          </Button>
        </div>
      </div>

      <DashboardTabs
        league={league}
        teams={teams}
        punters={punters}
        scoringRules={scoringRules}
      />
    </div>
  )
}
