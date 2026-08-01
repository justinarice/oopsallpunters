import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <CardTitle className="mt-2">Sign-in failed</CardTitle>
          <CardDescription>
            Something went wrong completing authentication. Please try signing
            in again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" render={<Link href="/auth/login" />}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
