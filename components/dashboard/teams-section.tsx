"use client"

import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  AtSign,
  Link as LinkIcon,
  Pencil,
  Plus,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react"
import { createTeam, updateTeam, deleteTeam } from "@/lib/actions/team"
import {
  createTeamInvite,
  revokeTeamInvite,
  removeTeamOwner,
} from "@/lib/actions/team-invite"
import type { ActionResult } from "@/lib/actions/guard"
import type { Team, TeamInvite } from "@/lib/types"
import { TeamAvatar } from "@/components/team-avatar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

function TeamFormFields({ team }: { team?: Team }) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="teamName">Team name</FieldLabel>
        <Input id="teamName" name="teamName" defaultValue={team?.team_name} required />
      </Field>
      <Field>
        <FieldLabel htmlFor="ownerName">Owner name</FieldLabel>
        <Input id="ownerName" name="ownerName" defaultValue={team?.owner_name} required />
      </Field>
      <Field>
        <FieldLabel htmlFor="sleeperUsername">Sleeper username</FieldLabel>
        <Input
          id="sleeperUsername"
          name="sleeperUsername"
          defaultValue={team?.sleeper_username ?? ""}
        />
        <FieldDescription>
          {team?.sleeper_user_id
            ? `Resolved to ${team.sleeper_display_name ?? team.sleeper_username} on Sleeper.`
            : "Resolved against Sleeper automatically on save."}
        </FieldDescription>
      </Field>
    </FieldGroup>
  )
}

/** Invite/owner status + actions for one team row. A separate component so
 *  each row's pending in-flight state (inviting/revoking/removing) doesn't
 *  re-render the whole list. */
function TeamOwnerControls({
  leagueId,
  team,
  invite,
}: {
  leagueId: string
  team: Team
  invite: TeamInvite | undefined
}) {
  const [working, startWorking] = useTransition()

  function onInvite() {
    startWorking(async () => {
      const res = await createTeamInvite({ leagueId, teamId: team.id })
      if (res.ok && res.data) {
        const url = `${window.location.origin}${res.data.path}`
        try {
          await navigator.clipboard.writeText(url)
          toast.success(`Invite link copied for ${team.team_name}.`)
        } catch {
          toast.success(`Invite link ready: ${url}`)
        }
      } else if (!res.ok) {
        toast.error(res.error)
      }
    })
  }

  function onCopyExisting() {
    if (!invite) return
    startWorking(async () => {
      const url = `${window.location.origin}/invite/${invite.token}`
      try {
        await navigator.clipboard.writeText(url)
        toast.success(`Invite link copied for ${team.team_name}.`)
      } catch {
        toast.success(`Invite link: ${url}`)
      }
    })
  }

  function onRevoke() {
    startWorking(async () => {
      const res = await revokeTeamInvite({ leagueId, teamId: team.id })
      if (res.ok) toast.success(`Invite revoked for ${team.team_name}.`)
      else if (!res.ok) toast.error(res.error)
    })
  }

  function onRemoveOwner() {
    startWorking(async () => {
      const res = await removeTeamOwner({ leagueId, teamId: team.id })
      if (res.ok) toast.success(`Removed the owner from ${team.team_name}.`)
      else if (!res.ok) toast.error(res.error)
    })
  }

  if (team.owner_user_id) {
    return (
      <div className="flex items-center gap-1">
        <Badge variant="secondary" className="gap-1">
          <UserCheck className="size-3" />
          {invite?.claimed_by_name ?? invite?.claimed_by_email ?? "Claimed"}
        </Badge>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove owner from ${team.team_name}`}
                disabled={working}
              >
                {working ? <Spinner /> : <UserX />}
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this team&apos;s owner?</AlertDialogTitle>
              <AlertDialogDescription>
                {team.team_name} goes back to unclaimed. Their account isn&apos;t
                deleted — you can send a fresh invite any time. Recorded in
                the audit log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRemoveOwner}>
                Remove owner
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  if (invite) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={working}
          onClick={onCopyExisting}
        >
          {working ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <LinkIcon data-icon="inline-start" />
          )}
          Copy invite link
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Revoke invite for ${team.team_name}`}
          disabled={working}
          onClick={onRevoke}
        >
          <Trash2 />
        </Button>
      </div>
    )
  }

  return (
    <Button variant="outline" size="sm" disabled={working} onClick={onInvite}>
      {working ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <UserPlus data-icon="inline-start" />
      )}
      Invite owner
    </Button>
  )
}

export function TeamsSection({
  leagueId,
  teams,
  teamInvites,
}: {
  leagueId: string
  teams: Team[]
  teamInvites: TeamInvite[]
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)

  const [, addAction, adding] = useActionState(
    async (prev: ActionResult | null, fd: FormData) => {
      const res = await createTeam(prev, fd)
      if (res.ok) {
        toast.success("Team added.")
        setAddOpen(false)
      } else if (res.error) toast.error(res.error)
      return res
    },
    null,
  )

  const [, editAction, savingEdit] = useActionState(
    async (prev: ActionResult | null, fd: FormData) => {
      const res = await updateTeam(prev, fd)
      if (res.ok) {
        toast.success("Team updated.")
        setEditing(null)
      } else if (res.error) toast.error(res.error)
      return res
    },
    null,
  )

  async function onDelete(team: Team) {
    const fd = new FormData()
    fd.set("leagueId", leagueId)
    fd.set("teamId", team.id)
    const res = await deleteTeam(null, fd)
    if (res.ok) toast.success(`Removed ${team.team_name}.`)
    else if (res.error) toast.error(res.error)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Team management</CardTitle>
            <CardDescription>
              Add teams, edit owners, record Sleeper usernames, and invite
              owners to sign in and claim their own team.
            </CardDescription>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger
              render={
                <Button size="sm">
                  <Plus data-icon="inline-start" />
                  Add team
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add team</DialogTitle>
                <DialogDescription>Create a new team in this league.</DialogDescription>
              </DialogHeader>
              <form action={addAction}>
                <input type="hidden" name="leagueId" value={leagueId} />
                <TeamFormFields />
                <DialogFooter className="mt-4">
                  <Button type="submit" disabled={adding}>
                    {adding && <Spinner data-icon="inline-start" />}
                    Add team
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {teams.length === 0 ? (
          <Empty className="rounded-lg border border-dashed border-border">
            <EmptyTitle>No teams yet</EmptyTitle>
            <EmptyDescription>Add your first team to start assigning punters.</EmptyDescription>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {teams.map((team) => {
              // Most recent invite for this team — claimed one if the team
              // has an owner (for the "claimed by" label), else the most
              // recent unclaimed one (for copy/revoke). teamInvites is
              // already ordered newest-first from getTeamInvites().
              const invite = team.owner_user_id
                ? teamInvites.find(
                    (i) => i.team_id === team.id && i.claimed_at,
                  )
                : teamInvites.find(
                    (i) => i.team_id === team.id && !i.claimed_at,
                  )

              return (
                <li
                  key={team.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <TeamAvatar
                      teamName={team.team_name}
                      sleeperAvatar={team.sleeper_avatar}
                      className="size-6"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{team.team_name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {team.owner_name}
                        {team.sleeper_user_id ? (
                          <Badge variant="secondary" className="ml-2 gap-1">
                            <AtSign className="size-3" />
                            {team.sleeper_display_name ?? team.sleeper_username}
                          </Badge>
                        ) : (
                          team.sleeper_username && (
                            <Badge variant="outline" className="ml-2 gap-1">
                              <AtSign className="size-3" />
                              {team.sleeper_username} (unresolved)
                            </Badge>
                          )
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <TeamOwnerControls
                      leagueId={leagueId}
                      team={team}
                      invite={invite}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${team.team_name}`}
                      onClick={() => setEditing(team)}
                    >
                      <Pencil />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${team.team_name}`}
                          >
                            <Trash2 />
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {team.team_name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This releases any assigned punter back to free agency and
                            records a public audit entry. It cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(team)}>
                            Remove team
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {/* Edit dialog (controlled, shared across rows) */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit team</DialogTitle>
            <DialogDescription>Update the team name, owner, or Sleeper username.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form action={editAction}>
              <input type="hidden" name="leagueId" value={leagueId} />
              <input type="hidden" name="teamId" value={editing.id} />
              <TeamFormFields team={editing} />
              <DialogFooter className="mt-4">
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit && <Spinner data-icon="inline-start" />}
                  Save changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
