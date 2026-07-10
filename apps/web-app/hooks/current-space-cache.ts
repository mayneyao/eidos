export const CURRENT_SPACE_CACHE_MS = 30_000

export function canReuseCurrentSpaceInfo(
  lastFetched: Date | null,
  force: boolean,
  now = Date.now()
): boolean {
  return (
    !force &&
    lastFetched !== null &&
    now - lastFetched.getTime() < CURRENT_SPACE_CACHE_MS
  )
}
