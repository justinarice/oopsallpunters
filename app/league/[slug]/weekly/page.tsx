import { notFound } from 'next/navigation'
import { WeeklyResults } from '@/components/weekly-results'
import { getLeagueBySlug, getWeeklyResults } from '@/lib/queries'

export default async function WeeklyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const league = await getLeagueBySlug(slug)
  if (!league) notFound()

  const { weeks, rowsByWeek } = await getWeeklyResults(
    league.id,
    league.season,
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Weekly results</h2>
        <p className="text-sm text-muted-foreground">
          Every punter&apos;s stats and calculated fantasy points, by week.
        </p>
      </div>
      <WeeklyResults weeks={weeks} rowsByWeek={rowsByWeek} />
    </div>
  )
}
