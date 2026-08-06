"use client"

import { Repeat, Settings2, Sliders, Users } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { League, PunterWithOwner, Team } from "@/lib/types"
import { SettingsSection } from "./settings-section"
import { SleeperSection } from "./sleeper-section"
import { TeamsSection } from "./teams-section"
import { RosterSection } from "./roster-section"

export function DashboardTabs({
  league,
  teams,
  punters,
}: {
  league: League
  teams: Team[]
  punters: PunterWithOwner[]
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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Scoring editor</CardTitle>
                <CardDescription>
                  Edit point values and choose retroactive vs. forward-only
                  recalculation on save.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="font-normal">
                Wires up in Phase 3
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The public scoring rules are visible on the league&apos;s Scoring
              page. Editing with recalculation lands in the next phase.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
