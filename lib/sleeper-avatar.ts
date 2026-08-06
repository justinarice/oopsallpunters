/**
 * Pure string formatting for Sleeper's CDN avatar URLs — no network calls,
 * no secrets. Deliberately kept out of lib/sleeper.ts (which is marked
 * server-only because it makes fetch calls) so client components like the
 * team list can render avatars without pulling in server-only code.
 */
export function sleeperAvatarUrl(avatarId: string, thumb = false): string {
  return `https://sleepercdn.com/avatars${thumb ? "/thumbs" : ""}/${avatarId}`
}
