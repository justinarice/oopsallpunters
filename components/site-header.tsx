import Link from 'next/link'
import { Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/brand'

/**
 * Public site header. Present on every page. The only authenticated action is
 * the commissioner sign-in link; everything else is fully public/read-only.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wordmark />
        </Link>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/dashboard" />}
        >
          <Shield data-icon="inline-start" />
          Commissioner
        </Button>
      </div>
    </header>
  )
}
