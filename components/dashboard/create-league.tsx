"use client"

import { useActionState } from "react"
import { toast } from "sonner"
import { createLeague } from "@/lib/actions/league"
import type { ActionResult } from "@/lib/actions/guard"
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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"

export function CreateLeague() {
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, fd: FormData) => {
      const res = await createLeague(prev, fd)
      if (res.ok) toast.success("League created.")
      else if (res.error) toast.error(res.error)
      return res
    },
    null,
  )

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Create your league</CardTitle>
        <CardDescription>
          You&apos;ll be the commissioner. You can add teams and assign punters next.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction}>
          <FieldGroup>
            <Field data-invalid={state?.ok === false ? true : undefined}>
              <FieldLabel htmlFor="name">League name</FieldLabel>
              <Input
                id="name"
                name="name"
                placeholder="Oops All Punters"
                aria-invalid={state?.ok === false ? true : undefined}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="season">Season</FieldLabel>
              <Input id="season" name="season" placeholder="2026" inputMode="numeric" required />
              <FieldDescription>Four-digit year.</FieldDescription>
            </Field>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Create league
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
