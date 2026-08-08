import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { sleeperAvatarUrl } from "@/lib/sleeper-avatar"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Shared team avatar: renders the linked Sleeper avatar image when present,
 * falling back to the team's initials. Used anywhere a team is listed
 * (public Home/Standings/Teams tabs, commissioner dashboard).
 */
export function TeamAvatar({
  teamName,
  sleeperAvatar,
  className,
}: {
  teamName: string
  sleeperAvatar?: string | null
  className?: string
}) {
  return (
    <Avatar className={cn("shrink-0", className)}>
      {sleeperAvatar && (
        <AvatarImage src={sleeperAvatarUrl(sleeperAvatar, true)} alt="" />
      )}
      <AvatarFallback className="bg-secondary font-semibold">
        {initials(teamName)}
      </AvatarFallback>
    </Avatar>
  )
}
