import { useCallback } from "react"
import { useSqliteKV } from "./use-sqlite-kv"

// Default enabled extensions
const DEFAULT_ENABLED_EXTENSIONS: Record<string, boolean> = {
  graft: true,
  today: true,
  "monaco-editor": true,
  "media-preview": true,
}

/**
 * Hook for space-level extension settings stored in SQLite KV.
 * Each space has its own independent extension configuration.
 */
export const useExtensionSettings = () => {
  const [enabledExtensions, setEnabledExtensions] = useSqliteKV<Record<string, boolean>>(
    "eidos:space:extensions:enabled",
    DEFAULT_ENABLED_EXTENSIONS
  )

  const isExtensionEnabled = useCallback(
    (id: string) => enabledExtensions?.[id] ?? true,
    [enabledExtensions]
  )

  const toggleExtension = useCallback(
    (id: string, enabled?: boolean) => {
      const newState = { ...(enabledExtensions ?? DEFAULT_ENABLED_EXTENSIONS) }
      if (enabled !== undefined) {
        newState[id] = enabled
      } else {
        newState[id] = !newState[id]
      }
      setEnabledExtensions(newState)
    },
    [enabledExtensions, setEnabledExtensions]
  )

  return {
    isExtensionEnabled,
    toggleExtension,
    enabledExtensions: enabledExtensions ?? DEFAULT_ENABLED_EXTENSIONS,
  }
}
