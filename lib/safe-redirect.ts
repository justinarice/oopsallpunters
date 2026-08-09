/**
 * Guards against open-redirect: `redirect`/`next` query params flow from
 * unauthenticated visitors into post-auth navigation, so a crafted link like
 * `/auth/login?redirect=https://evil.example` must not be able to send a
 * freshly-authenticated user off-site.
 */
export function isSafeRedirect(path: string | null | undefined): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("://")
  )
}
