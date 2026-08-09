import Link from "next/link"
import type { Metadata } from "next"
import { MailCheck } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Wordmark } from "@/components/brand"

export const metadata: Metadata = {
  title: 'Confirm your email',
  description:
    'Check your inbox for a confirmation link to activate your commissioner account.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: '/auth/sign-up-success',
  },
}

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-6 p-6">
      <Link href="/">
        <Wordmark subtitle={false} />
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-6" aria-hidden="true" />
          </div>
          <CardTitle asChild className="text-xl">
            <h1>Confirm your email</h1>
          </CardTitle>
          <CardDescription>
            We sent a confirmation link to your inbox. Click it to confirm
            your email — it'll take you right back to what you were doing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            nativeButton={false}
            render={<Link href="/auth/login" />}
          >
            Go to sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
