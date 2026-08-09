import Link from "next/link"
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
          <CardTitle className="text-xl">Confirm your email</CardTitle>
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
