import type { EidosSyncStatus } from "../shared/contracts"

const SYNC_STATUS_CACHE_PREFIX = "eidos-lite:sync-status:v1:"

export interface CachedSyncStatus {
  version: 1
  status: EidosSyncStatus
  checkedAtMs: number
  lastSyncedAtMs?: number
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function syncStatusCacheKey(scope: string): string {
  return `${SYNC_STATUS_CACHE_PREFIX}${encodeURIComponent(scope)}`
}

export function readSyncStatusSnapshot(scope: string): CachedSyncStatus | null {
  const target = storage()
  if (!target) return null
  try {
    const value = JSON.parse(target.getItem(syncStatusCacheKey(scope)) ?? "") as
      | CachedSyncStatus
      | undefined
    if (
      value?.version !== 1 ||
      !Number.isSafeInteger(value.checkedAtMs) ||
      !value.status ||
      !["signed-in", "signed-out"].includes(value.status.account?.state) ||
      !["connected", "not-connected"].includes(value.status.remote?.state)
    ) {
      return null
    }
    return value
  } catch {
    return null
  }
}

export function writeSyncStatusSnapshot(
  scope: string,
  snapshot: CachedSyncStatus
): void {
  try {
    storage()?.setItem(syncStatusCacheKey(scope), JSON.stringify(snapshot))
  } catch {
    // The Sync UI remains functional when local storage is unavailable/full.
  }
}

export function clearSyncStatusSnapshots(): void {
  const target = storage()
  if (!target) return
  const keys: string[] = []
  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index)
    if (key?.startsWith(SYNC_STATUS_CACHE_PREFIX)) keys.push(key)
  }
  for (const key of keys) target.removeItem(key)
}
