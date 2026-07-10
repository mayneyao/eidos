export type PendingWriteFlusher = () => Promise<boolean>

export interface PendingWriteTarget {
  spaceId: string
  filePath: string
}

export interface PendingWriteFilter {
  spaceId?: string
  path?: string
}

interface PendingWriteRegistration {
  flusher: PendingWriteFlusher
  target?: PendingWriteTarget
}

const pendingWriteFlushers = new Map<string, PendingWriteRegistration>()

function matchesFilter(
  target: PendingWriteTarget | undefined,
  filter: PendingWriteFilter | undefined
): boolean {
  if (!filter) return true
  if (!target) return false
  if (filter.spaceId && target.spaceId !== filter.spaceId) return false
  if (!filter.path) return true
  return (
    target.filePath === filter.path ||
    target.filePath.startsWith(`${filter.path}/`)
  )
}

export function registerPendingWriteFlusher(
  key: string,
  flusher: PendingWriteFlusher,
  target?: PendingWriteTarget
): () => void {
  const registration = { flusher, target }
  pendingWriteFlushers.set(key, registration)
  return () => {
    if (pendingWriteFlushers.get(key) === registration) {
      pendingWriteFlushers.delete(key)
    }
  }
}

export async function flushPendingFileWrites(
  filter?: PendingWriteFilter
): Promise<boolean> {
  const results = await Promise.allSettled(
    [...pendingWriteFlushers.values()]
      .filter((registration) => matchesFilter(registration.target, filter))
      .map(({ flusher }) => flusher())
  )
  return results.every(
    (result) => result.status === "fulfilled" && result.value
  )
}
