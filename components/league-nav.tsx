'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Home', segment: '' },
  { label: 'Standings', segment: 'standings' },
  { label: 'Teams', segment: 'teams' },
  { label: 'Punters', segment: 'punters' },
  { label: 'Weekly', segment: 'weekly' },
  { label: 'Scoring', segment: 'scoring' },
  { label: 'Transactions', segment: 'transactions' },
]

export function LeagueNav({ slug }: { slug: string }) {
  const pathname = usePathname()
  const base = `/league/${slug}`

  return (
    <nav
      aria-label="League sections"
      className="scrollbar-none -mb-px flex gap-1 overflow-x-auto"
    >
      {TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base
        const active =
          tab.segment === ''
            ? pathname === base
            : pathname === href || pathname.startsWith(`${href}/`)

        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
