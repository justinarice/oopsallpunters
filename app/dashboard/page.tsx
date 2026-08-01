'use client'

import {
  Download,
  Repeat,
  Settings2,
  Sliders,
  Users,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  MODIFIER_LABELS,
  STAT_LABELS,
  sampleLeague,
  sampleScoringRules,
  sampleStandings,
} from '@/lib/sample-data'

function PhaseBadge({ phase }: { phase: number }) {
  return (
    <Badge variant="secondary" className="font-normal">
      Wires up in Phase {phase}
    </Badge>
  )
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Commissioner dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Managing{' '}
          <span className="font-medium text-foreground">
            {sampleLeague.name}
          </span>{' '}
          · {sampleLeague.season}. Every action here is written to the public
          audit log.
        </p>
      </div>

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
            Trades
          </TabsTrigger>
          <TabsTrigger value="scoring">
            <Sliders data-icon="inline-start" />
            Scoring
          </TabsTrigger>
          <TabsTrigger value="imports">
            <Download data-icon="inline-start" />
            Imports
          </TabsTrigger>
        </TabsList>

        {/* League settings */}
        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>League settings</CardTitle>
                  <CardDescription>Name, season, and logo.</CardDescription>
                </div>
                <PhaseBadge phase={2} />
              </div>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="league-name">League name</FieldLabel>
                  <Input
                    id="league-name"
                    defaultValue={sampleLeague.name}
                    disabled
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="league-season">Season</FieldLabel>
                  <Input
                    id="league-season"
                    defaultValue={sampleLeague.season}
                    disabled
                  />
                  <FieldDescription>
                    Saving is enabled once league CRUD is wired to Supabase.
                  </FieldDescription>
                </Field>
                <div>
                  <Button disabled>Save changes</Button>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team management */}
        <TabsContent value="teams" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Team management</CardTitle>
                  <CardDescription>
                    Assign punters, edit owners, record Sleeper usernames.
                  </CardDescription>
                </div>
                <PhaseBadge phase={2} />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {sampleStandings.map((row) => (
                <div
                  key={row.team.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.team.team_name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {row.team.owner_name} ·{' '}
                      {row.punter?.name ?? 'No punter'}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" disabled>
                    Manage
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trade tool */}
        <TabsContent value="trades" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Trade tool</CardTitle>
                  <CardDescription>
                    From / To / Punter → submit. Closes the old assignment,
                    opens a new one, and logs it. No confirmation step.
                  </CardDescription>
                </div>
                <PhaseBadge phase={2} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel>From team</FieldLabel>
                  <Input placeholder="Select team" disabled />
                </Field>
                <Field>
                  <FieldLabel>To team</FieldLabel>
                  <Input placeholder="Select team" disabled />
                </Field>
                <Field>
                  <FieldLabel>Punter</FieldLabel>
                  <Input placeholder="Select punter" disabled />
                </Field>
              </div>
              <div className="mt-4">
                <Button disabled>Submit trade</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scoring editor */}
        <TabsContent value="scoring" className="mt-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Scoring editor</CardTitle>
                  <CardDescription>
                    On save you&apos;ll choose: recalculate past weeks, or apply
                    going forward only.
                  </CardDescription>
                </div>
                <PhaseBadge phase={3} />
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Statistic</TableHead>
                    <TableHead>Modifier</TableHead>
                    <TableHead className="pr-6 text-right">Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleScoringRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="pl-6 font-medium">
                        {STAT_LABELS[rule.stat]}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {MODIFIER_LABELS[rule.modifier]}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Input
                          className="ml-auto w-20 text-right font-mono"
                          defaultValue={rule.points}
                          disabled
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import stats */}
        <TabsContent value="imports" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Import stats</CardTitle>
                  <CardDescription>
                    Choose a week, fetch from nflverse (or upload CSV), preview,
                    confirm, calculate, save.
                  </CardDescription>
                </div>
                <PhaseBadge phase={4} />
              </div>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3">
                {[
                  'Choose week',
                  'Fetch from nflverse-data (or upload CSV fallback)',
                  'Preview parsed punt-play stats',
                  'Confirm — nothing writes before this',
                  'Calculate scores via the scoring engine',
                  'Save & write the audit log entry',
                ].map((step, i) => (
                  <li key={step} className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-semibold">
                      {i + 1}
                    </span>
                    <span className="text-sm">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex gap-2">
                <Button disabled>
                  <Download data-icon="inline-start" />
                  Start import
                </Button>
                <Button variant="outline" disabled>
                  Upload CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
