"use client"

import { useActionState, useState } from "react"
import { toast } from "sonner"
import { updateLeagueSettings } from "@/lib/actions/league"
import type { League } from "@/lib/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function SettingsSection({ league }: { league: League }) {
  const [visibility, setVisibility] = useState<"public" | "private">(
    league.is_public ? "public" : "private",
  )
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof updateLeagueSettings>> | null, fd: FormData) => {
      const res = await updateLeagueSettings(prev, fd)
      if (res.ok) toast.success("League settings saved.")
      else if (res.error) toast.error(res.error)
      return res
    },
    null,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>League settings</CardTitle>
        <CardDescription>
          Name, season, visibility, and the announcement shown on the league
          home page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction}>
          <input type="hidden" name="leagueId" value={league.id} />
          <input type="hidden" name="visibility" value={visibility} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="visibility-trigger">Visibility</FieldLabel>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as "public" | "private")}
              >
                <SelectTrigger id="visibility-trigger" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {visibility === "public"
                  ? "Anyone can view this league's teams, rosters, standings, and scoring without signing in."
                  : "Only you and the owners of this league's teams can view it. Defaults to private for new leagues."}
              </FieldDescription>
            </Field>
            <Field data-invalid={state?.ok === false ? true : undefined}>
              <FieldLabel htmlFor="name">League name</FieldLabel>
              <Input
                id="name"
                name="name"
                defaultValue={league.name}
                aria-invalid={state?.ok === false ? true : undefined}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="season">Season</FieldLabel>
              <Input
                id="season"
                name="season"
                defaultValue={league.season}
                inputMode="numeric"
                placeholder="2026"
                required
              />
              <FieldDescription>Four-digit year.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="announcement">Announcement</FieldLabel>
              <Textarea
                id="announcement"
                name="announcement"
                defaultValue={league.announcement ?? ""}
                rows={3}
              />
              <FieldDescription>
                Optional. Shown publicly on the league home page.
              </FieldDescription>
            </Field>
            <div>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                Save settings
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
