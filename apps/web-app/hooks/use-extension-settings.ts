import { useCallback } from "react"
import { useSqliteKV } from "./use-sqlite-kv"

// Default enabled extensions
const DEFAULT_ENABLED_EXTENSIONS: Record<string, boolean> = {
  graft: true,
  today: true,
  "monaco-editor": true,
  "media-preview": true,
  "folder-browser": true,
}

/**
 * Hook for space-level extension settings stored in SQLite KV.
 * Each space has its own independent extension configuration.
 */
export const useExtensionSettings = (runtimeEnabled = true) => {
  const [enabledExtensions, setEnabledExtensions] = useSqliteKV<
    Record<string, boolean>
  >(
    "eidos:space:extensions:enabled",
    DEFAULT_ENABLED_EXTENSIONS,
    runtimeEnabled
  )

  const isExtensionEnabled = useCallback(
    (id: string) => enabledExtensions?.[id] ?? true,
    [enabledExtensions]
  )

  const toggleExtension = useCallback(
    (id: string, nextEnabled?: boolean) => {
      if (!runtimeEnabled) return
      const newState = { ...(enabledExtensions ?? DEFAULT_ENABLED_EXTENSIONS) }
      if (nextEnabled !== undefined) {
        newState[id] = nextEnabled
      } else {
        newState[id] = !newState[id]
      }
      setEnabledExtensions(newState)
    },
    [runtimeEnabled, enabledExtensions, setEnabledExtensions]
  )

  return {
    isExtensionEnabled,
    toggleExtension,
    enabledExtensions: enabledExtensions ?? DEFAULT_ENABLED_EXTENSIONS,
  }
}
