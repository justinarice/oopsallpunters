import type { Metadata } from 'next'

// The login page is a client component (it needs onSubmit handlers), and
// route metadata can only be exported from a server component — so it lives
// here in the segment's layout instead.
export const metadata: Metadata = {
  title: 'Commissioner sign in',
  description:
    'Sign in to manage your Sleeper punter league. League members never need an account.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: '/auth/login',
  },
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
