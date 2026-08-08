import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { SiteHeader } from '@/components/site-header'
import { LeagueNav } from '@/components/league-nav'
import { getLeagueBySlug } from '@/lib/queries'

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const league = await getLeagueBySlug(slug)
  if (!league) notFound()

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <div className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3 py-6">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {league.name}
            </h1>
            <Badge variant="secondary">{league.season} Season</Badge>
          </div>
          <LeagueNav slug={slug} />
        </div>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <p className="text-xs text-muted-foreground text-balance">
            Sleeper owns rosters, standard scoring, and waivers — this app
            tracks punters only. Every commissioner action is public and
            permanently logged.
          </p>
          <p className="mt-2 text-xs text-muted-foreground text-balance">
            Oops All Punters is an independent, fan-made companion and is not
            affiliated with, endorsed by, or created by Sleeper.
          </p>
        </div>
      </footer>
    </div>
  )
}
