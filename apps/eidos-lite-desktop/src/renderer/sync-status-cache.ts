import type {
  EidosSyncRepositoryList,
  EidosSyncStatus,
} from "../shared/contracts"

const SYNC_STATUS_CACHE_PREFIX = "eidos-lite:sync-status:v1:"
const SYNC_ACCOUNT_CACHE_KEY = "eidos-lite:sync-account:v1"

export interface CachedSyncStatus {
  version: 1
  status: EidosSyncStatus
  checkedAtMs: number
  lastSyncedAtMs?: number
  spaceBytes?: number
  spaceSizeCheckedAtMs?: number
  repositories?: EidosSyncRepositoryList
  repositoriesCheckedAtMs?: number
}

export interface CachedSyncAccountContext {
  version: 1
  environment: EidosSyncStatus["environment"]
  account: EidosSyncStatus["account"]
  availability?: EidosSyncStatus["availability"]
  device: EidosSyncStatus["device"]
  entitlement: EidosSyncStatus["entitlement"]
  checkedAtMs: number
}

function isOptionalNonNegativeSafeInteger(value: unknown): boolean {
  return (
    value === undefined ||
    (Number.isSafeInteger(value) && typeof value === "number" && value >= 0)
  )
}

function isRepositoryList(value: unknown): value is EidosSyncRepositoryList {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<EidosSyncRepositoryList>
  return (
    typeof candidate.namespace === "string" &&
    Array.isArray(candidate.repositories) &&
    candidate.repositories.every(
      (repository) =>
        repository !== null &&
        typeof repository === "object" &&
        typeof repository.name === "string" &&
        typeof repository.displayName === "string" &&
        typeof repository.remoteUrl === "string" &&
        Number.isSafeInteger(repository.createdAtMs)
    )
  )
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
      !isOptionalNonNegativeSafeInteger(value.lastSyncedAtMs) ||
      !isOptionalNonNegativeSafeInteger(value.spaceBytes) ||
      !isOptionalNonNegativeSafeInteger(value.spaceSizeCheckedAtMs) ||
      !isOptionalNonNegativeSafeInteger(value.repositoriesCheckedAtMs) ||
      (value.repositories !== undefined &&
        !isRepositoryList(value.repositories)) ||
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

export function readSyncAccountContext(): CachedSyncAccountContext | null {
  const target = storage()
  if (!target) return null
  try {
    const value = JSON.parse(target.getItem(SYNC_ACCOUNT_CACHE_KEY) ?? "") as
      | CachedSyncAccountContext
      | undefined
    if (
      value?.version !== 1 ||
      !Number.isSafeInteger(value.checkedAtMs) ||
      !["staging", "production"].includes(value.environment) ||
      !["signed-in", "signed-out"].includes(value.account?.state) ||
      !["not-registered", "active"].includes(value.device?.state) ||
      !["not-checked", "none", "read-only", "read-write", "blocked"].includes(
        value.entitlement?.state
      )
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
    const target = storage()
    target?.setItem(syncStatusCacheKey(scope), JSON.stringify(snapshot))
    target?.setItem(
      SYNC_ACCOUNT_CACHE_KEY,
      JSON.stringify({
        version: 1,
        environment: snapshot.status.environment,
        account: snapshot.status.account,
        availability: snapshot.status.availability,
        device: snapshot.status.device,
        entitlement: snapshot.status.entitlement,
        checkedAtMs: snapshot.checkedAtMs,
      } satisfies CachedSyncAccountContext)
    )
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
  target.removeItem(SYNC_ACCOUNT_CACHE_KEY)
}
