import type { Metadata } from 'next'

// The sign-up page is a client component (it needs onSubmit handlers), and
// route metadata can only be exported from a server component — so it lives
// here in the segment's layout instead.
export const metadata: Metadata = {
  title: 'Create commissioner account',
  description:
    'Create a commissioner account to run a Sleeper punter league. League members never need an account.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: '/auth/sign-up',
  },
}

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
