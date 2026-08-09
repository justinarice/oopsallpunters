import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import {
  getAvailablePunters,
  getDraftPicks,
  getDraftQueue,
  getDraftSettings,
  getDraftState,
  getLeagueBySlug,
  getPunters,
  getTeams,
} from "@/lib/queries"
import { DraftBoard } from "./draft-board"
import { DraftQueuePanel } from "./draft-queue-panel"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const league = await getLeagueBySlug(slug)
  if (!league) return {}

  return {
    title: `Draft — ${league.name}`,
    description: `Live punter draft board for ${league.name}.`,
    alternates: {
      canonical: `/league/${slug}/draft`,
    },
  }
}

export default async function DraftPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const league = await getLeagueBySlug(slug)
  if (!league) notFound()

  const supabase = await createClient()
  const [
    {
      data: { user },
    },
    teams,
    punters,
    draftSettings,
    draftState,
    draftPicks,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getTeams(league.id),
    getPunters(),
    getDraftSettings(league.id),
    getDraftState(league.id),
    getDraftPicks(league.id),
  ])

  const myTeam = user ? teams.find((t) => t.owner_user_id === user.id) : undefined
  const isCommissioner = user?.id === league.commissioner_id

  const [myQueue, availablePunters] = myTeam
    ? await Promise.all([
        getDraftQueue(league.id, myTeam.id),
        getAvailablePunters(league.id),
      ])
    : [null, null]

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <DraftBoard
          leagueId={league.id}
          teams={teams}
          punters={punters}
          initialSettings={draftSettings}
          initialState={draftState}
          initialPicks={draftPicks}
          myTeamId={myTeam?.id ?? null}
          isCommissioner={isCommissioner}
        />
      </div>
      {myTeam && myQueue && availablePunters && (
        <div className="w-full lg:w-96 lg:shrink-0">
          <DraftQueuePanel
            leagueId={league.id}
            teamId={myTeam.id}
            initialQueue={myQueue}
            availablePunters={availablePunters}
          />
        </div>
      )}
    </div>
  )
}
