import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SignOutButton } from '@/components/sign-out-button'
import { initials } from '@/lib/format'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Defense in depth — the proxy already gates /dashboard, but never trust it alone.
  if (!user) redirect('/auth/login')

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    'Commissioner'
  const avatar = user.user_metadata?.avatar_url as string | undefined

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Wordmark subtitle={false} />
            </Link>
            <Badge variant="secondary">Commissioner</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/" />}
              className="hidden sm:inline-flex"
            >
              <Eye data-icon="inline-start" />
              Public view
            </Button>
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                {avatar && <AvatarImage src={avatar} alt="" />}
                <AvatarFallback className="bg-secondary text-xs font-semibold">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium md:inline">
                {name}
              </span>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
