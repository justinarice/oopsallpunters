import Link from 'next/link'
import type { Metadata } from 'next'
import { CompassIcon } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'The page you were looking for could not be found.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-24 sm:px-6">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CompassIcon className="size-6" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              Page not found
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              The page you&apos;re looking for doesn&apos;t exist, may have
              been moved, or the league slug is misspelled.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button nativeButton={false} render={<Link href="/" />}>
              Back to leagues
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              Commissioner sign in
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
