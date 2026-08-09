// Report-only for now: this repo has no CSP-violation collection endpoint
// and no error monitoring, so shipping straight to enforced could silently
// break something in prod with nobody finding out. Built from the actual
// external-resource inventory (see supabase browser client, Sleeper avatar
// images, Vercel Analytics' same-origin beacon) — flip the header key to
// 'Content-Security-Policy' once you've confirmed no violations show up in
// real usage (check the browser console across login/dashboard/roster/
// invite-claim pages).
const csp = [
  "default-src 'self'",
  "img-src 'self' https://sleepercdn.com data:",
  "connect-src 'self' https://*.supabase.co",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          // Commissioner dashboard is state-changing; prevent clickjacking.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
    ]
  },
}

export default nextConfig
