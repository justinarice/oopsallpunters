import { WeeklyResults } from '@/components/weekly-results'
import { availableWeeks, sampleWeeklyStats } from '@/lib/sample-data'

export default function WeeklyPage() {
  // Group stats by week. Only Week 3 has sample data; other weeks render the
  // empty state, demonstrating the "not imported yet" path.
  const rowsByWeek: Record<number, typeof sampleWeeklyStats> = {}
  for (const w of availableWeeks) rowsByWeek[w] = []
  for (const row of sampleWeeklyStats) {
    rowsByWeek[row.week] = rowsByWeek[row.week] ?? []
    rowsByWeek[row.week].push(row)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Weekly results</h2>
        <p className="text-sm text-muted-foreground">
          Every punter&apos;s stats and calculated fantasy points, by week.
        </p>
      </div>
      <WeeklyResults weeks={availableWeeks} rowsByWeek={rowsByWeek} />
    </div>
  )
}
