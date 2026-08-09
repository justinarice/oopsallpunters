import Link from "next/link"
import type { Metadata } from "next"
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getMyLeagues,
  getTeams,
  getTeamInvites,
  getPuntersWithOwners,
  getScoringRules,
  getImportHistory,
  getDraftSettings,
  getDraftState,
} from "@/lib/queries"
import { CreateLeague } from "@/components/dashboard/create-league"
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs"
import { LeaguePicker } from "@/components/dashboard/league-picker"

// A "use server" file can only export async functions, so this can't live
// in lib/actions/nflverse-import.ts itself — Next.js applies maxDuration to
// every Server Action invoked from this route segment, which is where the
// nflverse import (fetches/parses a ~98MB file) actually gets called from.
export const maxDuration = 300

export const metadata: Metadata = {
  title: 'Commissioner dashboard',
  description:
    'Manage teams, punter assignments, scoring rules, and weekly stat imports for your Sleeper punter league.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: '/dashboard',
  },
}

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

  const [teams, teamInvites, punters, scoringRules, importHistory, draftSettings, draftState] =
    await Promise.all([
      getTeams(league.id),
      getTeamInvites(league.id),
      getPuntersWithOwners(league.id),
      getScoringRules(league.id),
      getImportHistory(league.id),
      getDraftSettings(league.id),
      getDraftState(league.id),
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
        teamInvites={teamInvites}
        punters={punters}
        scoringRules={scoringRules}
        importHistory={importHistory}
        draftSettings={draftSettings}
        draftState={draftState}
      />
    </div>
  )
}
