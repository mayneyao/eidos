import { useCallback, useEffect, useRef, useState } from "react"

import type { EidosPublishAccountStatus } from "../shared/contracts"

const PUBLISH_ACCOUNT_CACHE_KEY = "eidos-lite:publish-account:v1"
export const PUBLISH_ACCOUNT_STALE_MS = 5 * 60_000

export interface CachedPublishAccountStatus {
  version: 1
  status: EidosPublishAccountStatus
  checkedAtMs: number
}

export function isPublishAccountStatus(
  value: unknown
): value is EidosPublishAccountStatus {
  if (!value || typeof value !== "object") return false
  const account = value as Partial<EidosPublishAccountStatus>
  return (
    (account.state === "active" || account.state === "blocked") &&
    (account.plan === "free" || account.plan === "pro") &&
    typeof account.privatePublications === "boolean" &&
    typeof account.removeBranding === "boolean" &&
    typeof account.maxStorageBytes === "string" &&
    /^\d+$/.test(account.maxStorageBytes) &&
    (account.usedStorageBytes === null ||
      (typeof account.usedStorageBytes === "string" &&
        /^\d+$/.test(account.usedStorageBytes))) &&
    (account.activeSlugs === null ||
      (Array.isArray(account.activeSlugs) &&
        account.activeSlugs.every((slug) => typeof slug === "string"))) &&
    typeof account.accountUrl === "string" &&
    typeof account.pricingUrl === "string"
  )
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function readPublishAccountSnapshot(): CachedPublishAccountStatus | null {
  const target = storage()
  if (!target) return null
  try {
    const value = JSON.parse(target.getItem(PUBLISH_ACCOUNT_CACHE_KEY) ?? "") as
      | CachedPublishAccountStatus
      | undefined
    if (
      value?.version !== 1 ||
      !Number.isSafeInteger(value.checkedAtMs) ||
      !isPublishAccountStatus(value.status)
    ) {
      return null
    }
    return value
  } catch {
    return null
  }
}

export function writePublishAccountSnapshot(
  status: EidosPublishAccountStatus,
  checkedAtMs = Date.now()
): void {
  try {
    storage()?.setItem(
      PUBLISH_ACCOUNT_CACHE_KEY,
      JSON.stringify({
        version: 1,
        status,
        checkedAtMs,
      } satisfies CachedPublishAccountStatus)
    )
  } catch {
    // The Publish UI remains functional when local storage is unavailable/full.
  }
}

export function clearPublishAccountSnapshot(): void {
  try {
    storage()?.removeItem(PUBLISH_ACCOUNT_CACHE_KEY)
  } catch {
    // Ignore cache clearing failures; the next refresh replaces the value.
  }
}

export function publishAccountIsStale(
  snapshot: Pick<CachedPublishAccountStatus, "checkedAtMs">,
  now = Date.now()
): boolean {
  return now - snapshot.checkedAtMs >= PUBLISH_ACCOUNT_STALE_MS
}

let inFlightRequest: Promise<EidosPublishAccountStatus> | null = null

function requestPublishAccountStatus(): Promise<EidosPublishAccountStatus> {
  if (!inFlightRequest) {
    inFlightRequest = window.eidosLite.getPublishAccountStatus().finally(() => {
      inFlightRequest = null
    })
  }
  return inFlightRequest
}

export interface PublishAccountHook {
  account: EidosPublishAccountStatus | null
  failed: boolean
  refreshing: boolean
  refresh(options?: { force?: boolean }): Promise<void>
}

export function usePublishAccount(
  options: { enabled?: boolean } = {}
): PublishAccountHook {
  const enabled = options.enabled ?? true
  const [account, setAccount] = useState<EidosPublishAccountStatus | null>(() =>
    enabled ? (readPublishAccountSnapshot()?.status ?? null) : null
  )
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)

  const refresh = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled) return
      const cached = readPublishAccountSnapshot()
      if (!force && cached && !publishAccountIsStale(cached)) {
        setAccount(cached.status)
        setFailed(false)
        return
      }
      setRefreshing(true)
      try {
        const status = await requestPublishAccountStatus()
        writePublishAccountSnapshot(status)
        if (mounted.current) {
          setAccount(status)
          setFailed(false)
        }
      } catch {
        if (mounted.current) setFailed(true)
      } finally {
        if (mounted.current) setRefreshing(false)
      }
    },
    [enabled]
  )

  useEffect(() => {
    mounted.current = true
    if (!enabled) {
      setAccount(null)
      return
    }
    void refresh()
    const unsubscribe = window.eidosLite.onAccountChanged((status) => {
      if (status.state !== "signed-in") clearPublishAccountSnapshot()
      void refresh({ force: true })
    })
    return () => {
      mounted.current = false
      unsubscribe()
    }
  }, [enabled, refresh])

  return { account, failed, refreshing, refresh }
}
