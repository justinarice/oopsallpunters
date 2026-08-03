import Link from 'next/link'
import { ArrowRight, Eye, ListChecks, SportShoe, Wind } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getLeagues } from '@/lib/queries'

const FEATURES = [
  {
    icon: Wind,
    title: 'Punters as a category',
    body: 'Sleeper owns your rosters and standard scoring. This tracks the one thing it can\u2019t: NFL punters as a real fantasy position.',
  },
  {
    icon: ListChecks,
    title: 'Data-driven scoring',
    body: 'Point values live in configuration, not code. Change a rule and choose to recalculate past weeks or apply it going forward.',
  },
  {
    icon: Eye,
    title: 'Fully public & auditable',
    body: 'Everyone can view everything without logging in. Every commissioner action is permanently recorded in the audit log.',
  },
]

export default async function HomePage() {
  const leagues = await getLeagues()
  const primarySlug = leagues[0]?.slug

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="flex max-w-2xl flex-col gap-6">
              <Badge variant="secondary" className="w-fit gap-1.5">
                <SportShoe className="size-3.5" />
                Sleeper Companion
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Oops, all punters.
              </h1>
              <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
                A companion for your Sleeper league that tracks NFL punters as a
                standalone scoring category — assignments, trades, weekly
                imports, and live standings, all publicly auditable.
              </p>
              <div className="flex flex-wrap gap-3">
                {primarySlug && (
                  <Button
                    size="lg"
                    nativeButton={false}
                    render={<Link href={`/league/${primarySlug}`} />}
                  >
                    View a league
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/dashboard" />}
                >
                  Commissioner sign in
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-5" />
                  </span>
                  <CardTitle className="mt-3">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                    {f.body}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* League directory */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-xl font-semibold tracking-tight">Leagues</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Public read access — no account required.
            </p>
            {leagues.length === 0 ? (
              <Empty className="mt-6 rounded-lg border border-dashed border-border">
                <EmptyTitle>No leagues yet</EmptyTitle>
                <EmptyDescription>
                  A commissioner needs to sign in and create the first league.
                </EmptyDescription>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  nativeButton={false}
                  render={<Link href="/dashboard" />}
                >
                  Commissioner sign in
                </Button>
              </Empty>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {leagues.map((league) => (
                  <Card key={league.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle>{league.name}</CardTitle>
                        <Badge variant="secondary">{league.season}</Badge>
                      </div>
                      <CardDescription>
                        /league/{league.slug}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/league/${league.slug}`} />}
                      >
                        Open league
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-xs text-muted-foreground">
            Not affiliated with Sleeper. A companion tool for punter-only side
            competitions.
          </p>
        </div>
      </footer>
    </div>
  )
}
