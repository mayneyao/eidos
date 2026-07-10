import { useCallback, useEffect, useMemo } from "react"
import { useSqliteKV } from "./use-sqlite-kv"
import { useExtensionSettings } from "@/apps/web-app/hooks/use-extension-settings"

export type TabId = "nodes" | "extensions" | "today" | "files" | string

export interface FavBlock {
  id: string
  name: string
  icon?: string
  space: string
}

export const DEFAULT_TABS: TabId[] = [
  "nodes",
  "extensions",
  "files",
  "today",
  "graft",
  "agent",
]

export const useTabsKV = (enabled = true) => {
  const [tabs, setTabs] = useSqliteKV<TabId[]>(
    "eidos:space:sidebar:tabs",
    DEFAULT_TABS,
    enabled
  )

  // Initialize with default tabs if not set, or ensure all default tabs are present
  useEffect(() => {
    if (!enabled || !tabs) return

    if (tabs.length === 0) {
      setTabs(DEFAULT_TABS)
      return
    }

    // Check if any default tab is missing from current tabs
    const missingDefaults = DEFAULT_TABS.filter(
      (defId) => !tabs.includes(defId)
    )

    if (missingDefaults.length > 0) {
      // Add missing default tabs to the end
      // Use Set to ensure uniqueness and preserve order of existing tabs
      const newTabs = [...tabs, ...missingDefaults]
      setTabs(newTabs)
    }
  }, [enabled, tabs, setTabs])

  const addTab = useCallback(
    (tabId: TabId) => {
      if (!enabled || !tabs) return

      // Don't add if already exists
      if (tabs.includes(tabId)) return

      const newTabs = [...tabs, tabId]
      setTabs(newTabs)
    },
    [enabled, tabs, setTabs]
  )

  const removeTab = useCallback(
    (tabId: TabId) => {
      if (!enabled || !tabs) return

      // Don't remove default tabs
      if (DEFAULT_TABS.includes(tabId as any)) return

      const newTabs = tabs.filter((id) => id !== tabId)
      setTabs(newTabs)
    },
    [enabled, tabs, setTabs]
  )

  const reorderTabs = useCallback(
    (newTabs: TabId[]) => {
      if (!enabled) return
      setTabs(newTabs)
    },
    [enabled, setTabs]
  )

  const resetTabs = useCallback(() => {
    if (!enabled) return
    setTabs(DEFAULT_TABS)
  }, [enabled, setTabs])

  const { isExtensionEnabled, enabledExtensions } =
    useExtensionSettings(enabled)

  // Filter out disabled built-in extensions
  const filteredTabs = useMemo(() => {
    return (tabs || DEFAULT_TABS).filter((id) => {
      // Only filter built-in extensions that are toggleable
      if (["graft", "today"].includes(id)) {
        const enabled = isExtensionEnabled(id)
        return enabled
      }
      return true
    })
  }, [tabs, isExtensionEnabled, enabledExtensions])

  return {
    // Tabs
    tabs: filteredTabs,
    addTab,
    removeTab,
    reorderTabs,
    resetTabs,
  }
}
