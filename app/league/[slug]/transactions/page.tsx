import {
  Download,
  Repeat,
  Settings2,
  UserPlus,
  Flag,
  Lock,
} from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getAuditLog, getLeagueBySlug } from '@/lib/queries'
import { formatDateTime } from '@/lib/format'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const league = await getLeagueBySlug(slug)
  if (!league) return {}

  return {
    title: `Transactions — ${league.name}`,
    description: `The complete public audit log for ${league.name} — every commissioner action, newest first.`,
    alternates: {
      canonical: `/league/${slug}/transactions`,
    },
  }
}

function iconFor(action: string) {
  const a = action.toLowerCase()
  if (a.includes('import')) return Download
  if (a.includes('trade')) return Repeat
  if (a.includes('scoring')) return Settings2
  if (a.includes('assign')) return UserPlus
  if (a.includes('created')) return Flag
  return Settings2
}

export default async function TransactionsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const league = await getLeagueBySlug(slug)
  if (!league) notFound()
  const auditLog = await getAuditLog(league.id)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Transactions</h2>
        <p className="text-sm text-muted-foreground">
          The complete public audit log — every commissioner action, newest
          first.
        </p>
      </div>

      <Alert>
        <Lock />
        <AlertTitle>Immutable by design</AlertTitle>
        <AlertDescription>
          Entries are never edited or deleted. This is the single source of
          truth for what changed, when, and by whom.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="flex flex-col">
          {auditLog.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No commissioner actions recorded yet.
            </p>
          )}
          {auditLog.map((entry, i) => {
            const Icon = iconFor(entry.action)
            const last = i === auditLog.length - 1
            return (
              <div key={entry.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  {!last && <span className="w-px flex-1 bg-border" />}
                </div>
                <div className={last ? 'pb-0' : 'pb-6'}>
                  <p className="text-sm leading-relaxed">{entry.action}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.user} · {formatDateTime(entry.timestamp)}
                  </p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
