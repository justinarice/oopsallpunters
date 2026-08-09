"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { claimTeamInvite } from "@/lib/actions/team-invite"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function ClaimButton({
  token,
  fallbackLeagueSlug,
}: {
  token: string
  fallbackLeagueSlug: string
}) {
  const router = useRouter()
  const [claiming, startClaim] = useTransition()

  function onClaim() {
    startClaim(async () => {
      const res = await claimTeamInvite(token)
      if (res.ok) {
        toast.success("Team claimed!")
        const slug = res.data?.leagueSlug || fallbackLeagueSlug
        router.push(slug ? `/league/${slug}` : "/")
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Button className="w-full" disabled={claiming} onClick={onClaim}>
      {claiming && <Spinner data-icon="inline-start" />}
      Claim this team
    </Button>
  )
}
