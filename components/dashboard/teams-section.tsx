"use client"

import { useActionState, useState } from "react"
import { toast } from "sonner"
import { AtSign, Pencil, Plus, Trash2 } from "lucide-react"
import { createTeam, updateTeam, deleteTeam } from "@/lib/actions/team"
import type { ActionResult } from "@/lib/actions/guard"
import type { Team } from "@/lib/types"
import { sleeperAvatarUrl } from "@/lib/sleeper-avatar"
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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
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

export function TeamsSection({
  leagueId,
  teams,
}: {
  leagueId: string
  teams: Team[]
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
            <CardDescription>Add teams, edit owners, record Sleeper usernames.</CardDescription>
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
            {teams.map((team) => (
              <li key={team.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {team.sleeper_user_id && (
                    <Avatar size="sm">
                      {team.sleeper_avatar && (
                        <AvatarImage
                          src={sleeperAvatarUrl(team.sleeper_avatar, true)}
                          alt=""
                        />
                      )}
                      <AvatarFallback>
                        {(team.sleeper_display_name ?? team.owner_name)[0]}
                      </AvatarFallback>
                    </Avatar>
                  )}
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
            ))}
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
