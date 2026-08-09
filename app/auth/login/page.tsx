"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { isSafeRedirect } from "@/lib/safe-redirect"
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

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read on mount (not during render) so server-rendered HTML and the first
  // client render match — this only affects post-submit behavior and copy,
  // both of which are fine to settle in a moment after hydration.
  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  useEffect(() => {
    setRedirectTo(new URLSearchParams(window.location.search).get("redirect"))
  }, [])
  const isInviteFlow = redirectTo?.startsWith("/invite/") ?? false

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      // Use a hard navigation instead of router.push. The auth cookies set by
      // signInWithPassword need to be present on the *next* request for the
      // middleware (updateSession) to recognize the session. A client-side
      // router.push can fire before those cookies are reliably readable,
      // causing the middleware to bounce back to /auth/login (looks like a
      // hang, then requires a second sign-in attempt). A full navigation
      // guarantees the browser sends the fresh cookies with the request.
      window.location.href = isSafeRedirect(redirectTo) ? redirectTo : "/dashboard"
    } catch (err: unknown) {
      console.error("[v0] Login error:", err)
      const { code } = (err ?? {}) as { code?: string }
      if (code === "email_not_confirmed") {
        setError("Please confirm your email address before signing in.")
      } else {
        setError("Invalid email or password.")
      }
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
            {isInviteFlow ? "Sign in to claim your team" : <h1>Commissioner sign in</h1>}
          </CardTitle>
          <CardDescription>
            {isInviteFlow
              ? "Sign in to link your account to your team."
              : "Only commissioners sign in. Everyone else views the league without an account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleLogin}>
            <FieldGroup>
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
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in…" : "Sign in"}
              </Button>
            </FieldGroup>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            {isInviteFlow ? "Need an account?" : "Need a commissioner account?"}{" "}
            <Link
              href={
                isSafeRedirect(redirectTo)
                  ? `/auth/sign-up?redirect=${encodeURIComponent(redirectTo)}`
                  : "/auth/sign-up"
              }
              className="text-foreground underline underline-offset-4"
            >
              Sign up
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
