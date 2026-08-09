import Link from "next/link"
import { notFound } from "next/navigation"
import { getInvitePreview } from "@/lib/actions/team-invite"
import { createClient } from "@/lib/supabase/server"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Wordmark } from "@/components/brand"
import { ClaimButton } from "./claim-button"

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const preview = await getInvitePreview(token)
  if (!preview) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-6 p-6">
      <Link href="/">
        <Wordmark subtitle={false} />
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {preview.alreadyClaimed
              ? "Invite already used"
              : preview.isExpired
                ? "Invite expired"
                : `Claim ${preview.teamName}`}
          </CardTitle>
          <CardDescription>
            {preview.alreadyClaimed
              ? `This invite for ${preview.teamName} in ${preview.leagueName} has already been claimed. Ask your commissioner for a new link if that seems wrong.`
              : preview.isExpired
                ? `This invite for ${preview.teamName} in ${preview.leagueName} has expired. Ask your commissioner for a new link.`
                : `You're about to link your account to ${preview.teamName} in ${preview.leagueName}.`}
          </CardDescription>
        </CardHeader>
        {!preview.alreadyClaimed && !preview.isExpired && (
          <CardContent className="flex flex-col gap-3">
            {user ? (
              <ClaimButton token={token} fallbackLeagueSlug={preview.leagueSlug} />
            ) : (
              <>
                <p className="text-center text-sm text-muted-foreground">
                  Sign in or create an account to claim this team.
                </p>
                <Button
                  className="w-full"
                  nativeButton={false}
                  render={<Link href={`/auth/login?redirect=/invite/${token}`} />}
                >
                  Sign in
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  nativeButton={false}
                  render={<Link href={`/auth/sign-up?redirect=/invite/${token}`} />}
                >
                  Create an account
                </Button>
              </>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
