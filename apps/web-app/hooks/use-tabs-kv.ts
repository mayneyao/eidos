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

export const DEFAULT_TABS: TabId[] = ["nodes", "extensions", "files", "today", "graft"]

export const useTabsKV = () => {
    const [tabs, setTabs] = useSqliteKV<TabId[]>("eidos:space:sidebar:tabs", DEFAULT_TABS)

    // Initialize with default tabs if not set, or ensure all default tabs are present
    useEffect(() => {
        if (!tabs) return

        if (tabs.length === 0) {
            setTabs(DEFAULT_TABS)
            return
        }

        // Check if any default tab is missing from current tabs
        const missingDefaults = DEFAULT_TABS.filter(defId => !tabs.includes(defId))
        
        if (missingDefaults.length > 0) {
            // Add missing default tabs to the end
            // Use Set to ensure uniqueness and preserve order of existing tabs
            const newTabs = [...tabs, ...missingDefaults]
            setTabs(newTabs)
        }
    }, [tabs, setTabs])


    const addTab = useCallback((tabId: TabId) => {
        if (!tabs) return

        // Don't add if already exists
        if (tabs.includes(tabId)) return

        const newTabs = [...tabs, tabId]
        setTabs(newTabs)
    }, [tabs, setTabs])

    const removeTab = useCallback((tabId: TabId) => {
        if (!tabs) return

        // Don't remove default tabs
        if (DEFAULT_TABS.includes(tabId as any)) return

        const newTabs = tabs.filter(id => id !== tabId)
        setTabs(newTabs)
    }, [tabs, setTabs])

    const reorderTabs = useCallback((newTabs: TabId[]) => {
        setTabs(newTabs)
    }, [setTabs])

    const resetTabs = useCallback(() => {
        setTabs(DEFAULT_TABS)
    }, [setTabs])

    const { isExtensionEnabled, enabledExtensions } = useExtensionSettings()
    
    // Filter out disabled built-in extensions
    const filteredTabs = useMemo(() => {
        return (tabs || DEFAULT_TABS).filter(id => {
        // Only filter built-in extensions that are toggleable
        if (["graft", "today"].includes(id)) {
            const enabled = isExtensionEnabled(id)
            return enabled
        }
        return true
    })}, [tabs, isExtensionEnabled, enabledExtensions])

    return {
        // Tabs
        tabs: filteredTabs,
        addTab,
        removeTab,
        reorderTabs,
        resetTabs,
    }
}
