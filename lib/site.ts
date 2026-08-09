// Central source of truth for the site's canonical origin, used to build
// `metadataBase` and canonical URLs. Falls back to the Vercel-provided
// production URL, then localhost, so canonical tags are always well-formed.
const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

export const SITE_URL = new URL(rawSiteUrl)

export const SITE_NAME = 'Oops All Punters'
