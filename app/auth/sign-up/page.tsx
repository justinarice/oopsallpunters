"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Wordmark } from "@/components/brand"

// Supabase does not reveal whether an email is already registered, so the
// fallback stays generic. Validation failures describe the user's own input and
// are not an enumeration oracle, so surface them.
function signUpErrorMessage(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: string; status?: number }
  if (code === "weak_password") return "Please choose a stronger password."
  if (code === "email_address_invalid")
    return "Please use a real email address — example and test domains are not supported."
  if (code === "email_address_not_authorized")
    return "We cannot send confirmation email to that address. Please use a different one."
  if (code === "validation_failed")
    return "Please check the details you entered."
  if (code === "over_email_send_rate_limit" || status === 429)
    return "Too many attempts. Please wait a moment and try again."
  return "Unable to complete sign-up. Please try again."
}

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [repeatPassword, setRepeatPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  useEffect(() => {
    setRedirectTo(new URLSearchParams(window.location.search).get("redirect"))
  }, [])
  const isInviteFlow = redirectTo?.startsWith("/invite/") ?? false

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (password !== repeatPassword) {
      setError("Passwords do not match.")
      setIsLoading(false)
      return
    }

    try {
      const base =
        process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
        `${window.location.origin}/auth/callback`
      const emailRedirectTo = redirectTo
        ? `${base}?next=${encodeURIComponent(redirectTo)}`
        : base

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: { name },
        },
      })
      if (error) throw error
      router.push("/auth/sign-up-success")
    } catch (err: unknown) {
      console.error("[v0] Sign-up error:", err)
      setError(signUpErrorMessage(err))
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-6 p-6">
      <Link href="/">
        <Wordmark subtitle={false} />
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {isInviteFlow ? "Create an account" : "Create commissioner account"}
          </CardTitle>
          <CardDescription>
            {isInviteFlow
              ? "Sign up to claim your team. You'll confirm your email, then claim it."
              : "Sign up to run a league. Members never need an account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleSignUp}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Display name</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  placeholder="Commish"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="commissioner@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="repeat-password">
                  Repeat password
                </FieldLabel>
                <Input
                  id="repeat-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating account…" : "Sign up"}
              </Button>
            </FieldGroup>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={
                redirectTo
                  ? `/auth/login?redirect=${encodeURIComponent(redirectTo)}`
                  : "/auth/login"
              }
              className="text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            nativeButton={false}
            render={<Link href="/" />}
          >
            <ArrowLeft data-icon="inline-start" />
            Back to leagues
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
