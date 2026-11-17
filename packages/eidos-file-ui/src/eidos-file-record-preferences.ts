import { useCallback, useId, useSyncExternalStore } from "react"

export interface RecordPropertyPreferences {
  hideSystemFields: boolean
  hiddenFields: string[]
  fieldOrder: string[]
}
const defaults: RecordPropertyPreferences = {
  hideSystemFields: false,
  hiddenFields: [],
  fieldOrder: [],
}
const prefix = "eidos-record-properties-v1:"
const cache = new Map<string, RecordPropertyPreferences>()
const listeners = new Set<() => void>()
const sessionScopes = new WeakMap<object, number>()
let nextSession = 0

function read(key: string, persistent: boolean): RecordPropertyPreferences {
  const existing = cache.get(key)
  if (existing) return existing
  let result = defaults
  if (persistent) {
    try {
      const parsed: unknown = JSON.parse(
        window.localStorage.getItem(prefix + key) ?? "null"
      )
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const value = parsed as Record<string, unknown>
        const ids = (input: unknown) =>
          Array.isArray(input)
            ? [
                ...new Set(
                  input.filter((id): id is string => typeof id === "string")
                ),
              ]
            : []
        result = {
          hideSystemFields: value.hideSystemFields === true,
          hiddenFields: ids(value.hiddenFields),
          fieldOrder: ids(value.fieldOrder),
        }
      }
    } catch {
      /* A missing/unavailable preference store preserves the default UI. */
    }
  }
  cache.set(key, result)
  return result
}

export function useRecordPropertyPreferences(
  scope: string | undefined,
  tableId: string,
  owner?: object
) {
  const instanceId = useId()
  if (owner && !sessionScopes.has(owner))
    sessionScopes.set(owner, ++nextSession)
  const persistent = Boolean(scope && tableId)
  const key = JSON.stringify([
    scope || `session:${owner ? sessionScopes.get(owner) : instanceId}`,
    tableId,
  ])
  const subscribe = useCallback(
    (listener: () => void) => {
      listeners.add(listener)
      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== prefix + key) return
        cache.delete(key)
        listener()
      }
      window.addEventListener("storage", onStorage)
      return () => {
        listeners.delete(listener)
        window.removeEventListener("storage", onStorage)
      }
    },
    [key]
  )
  const getSnapshot = useCallback(
    () => read(key, persistent),
    [key, persistent]
  )
  const value = useSyncExternalStore(subscribe, getSnapshot, () => defaults)
  const update = (
    edit: (current: RecordPropertyPreferences) => RecordPropertyPreferences
  ) => {
    const next = edit(read(key, persistent))
    // Store first: failed persistence must not pretend that the choice was remembered.
    if (persistent)
      window.localStorage.setItem(prefix + key, JSON.stringify(next))
    cache.set(key, next)
    listeners.forEach((listener) => listener())
  }
  return [value, update] as const
}
