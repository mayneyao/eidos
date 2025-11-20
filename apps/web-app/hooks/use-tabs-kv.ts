import { useCallback, useEffect } from "react"
import { useSqliteKV } from "./use-sqlite-kv"

export type TabId = "nodes" | "extensions" | "today" | "files" | string

export interface FavBlock {
    id: string
    name: string
    icon?: string
    space: string
}

const DEFAULT_TABS: TabId[] = ["nodes", "extensions", "today", "files"]

export const useTabsKV = () => {
    const [tabs, setTabs] = useSqliteKV<TabId[]>("eidos:space:sidebar:tabs", DEFAULT_TABS)

    // Initialize with default tabs if not set
    useEffect(() => {
        if (tabs && tabs.length === 0) {
            setTabs(DEFAULT_TABS)
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

    return {
        // Tabs
        tabs: tabs || DEFAULT_TABS,
        addTab,
        removeTab,
        reorderTabs,
        resetTabs,
    }
}
