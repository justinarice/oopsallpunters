"use client"

import { Repeat, Settings2, Sliders, Users } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { League, PunterWithOwner, ScoringRule, Team } from "@/lib/types"
import { SettingsSection } from "./settings-section"
import { SleeperSection } from "./sleeper-section"
import { TeamsSection } from "./teams-section"
import { RosterSection } from "./roster-section"
import { ScoringSection } from "./scoring-section"

export function DashboardTabs({
  league,
  teams,
  punters,
  scoringRules,
}: {
  league: League
  teams: Team[]
  punters: PunterWithOwner[]
  scoringRules: ScoringRule[]
}) {
  return (
    <Tabs defaultValue="settings">
      <TabsList>
        <TabsTrigger value="settings">
          <Settings2 data-icon="inline-start" />
          League
        </TabsTrigger>
        <TabsTrigger value="teams">
          <Users data-icon="inline-start" />
          Teams
        </TabsTrigger>
        <TabsTrigger value="trades">
          <Repeat data-icon="inline-start" />
          Roster
        </TabsTrigger>
        <TabsTrigger value="scoring">
          <Sliders data-icon="inline-start" />
          Scoring
        </TabsTrigger>
      </TabsList>

      <TabsContent value="settings" className="mt-6 flex flex-col gap-6">
        <SettingsSection league={league} />
        <SleeperSection league={league} teams={teams} />
      </TabsContent>

      <TabsContent value="teams" className="mt-6">
        <TeamsSection leagueId={league.id} teams={teams} />
      </TabsContent>

      <TabsContent value="trades" className="mt-6">
        <RosterSection leagueId={league.id} teams={teams} punters={punters} />
      </TabsContent>

      <TabsContent value="scoring" className="mt-6">
        <ScoringSection leagueId={league.id} scoringRules={scoringRules} />
      </TabsContent>
    </Tabs>
  )
}
