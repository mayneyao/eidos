import { create } from "zustand"
import { persist } from "zustand/middleware"
import { nanoid } from "nanoid"

export interface Tab {
    id: string
    url: string
    title: string
    icon?: string
    lastAccessTime: number
}

interface TabState {
    tabs: Tab[]
    activeTabId: string | null

    // Actions
    openTab: (url: string, title?: string) => void
    closeTab: (id: string) => void
    closeAllTabs: () => void
    setActiveTab: (id: string) => void
    updateTab: (id: string, updates: Partial<Tab>) => void
    reorderTabs: (newTabs: Tab[]) => void
}

export const useTabStore = create<TabState>()(
    persist(
        (set, get) => ({
            tabs: [],
            activeTabId: null,

            openTab: (url, title = "New Tab") => {
                const { tabs, activeTabId } = get()

                // Check if tab with same URL already exists
                // For now, let's allow duplicates like browsers do, 
                // but maybe we want to focus existing one if it's exactly the same?
                // Let's stick to browser behavior: always open new tab unless explicitly told otherwise.

                const newTab: Tab = {
                    id: nanoid(),
                    url,
                    title,
                    lastAccessTime: Date.now(),
                }

                set({
                    tabs: [...tabs, newTab],
                    activeTabId: newTab.id,
                })
            },

            closeTab: (id) => {
                const { tabs, activeTabId } = get()
                const newTabs = tabs.filter((t) => t.id !== id)

                // If we closed the active tab, switch to the next available one
                let newActiveId = activeTabId
                if (activeTabId === id) {
                    if (newTabs.length > 0) {
                        // Try to find the tab to the right, or the one to the left
                        const index = tabs.findIndex((t) => t.id === id)
                        const nextTab = newTabs[index] || newTabs[index - 1]
                        newActiveId = nextTab ? nextTab.id : null
                    } else {
                        newActiveId = null
                    }
                }

                set({
                    tabs: newTabs,
                    activeTabId: newActiveId,
                })
            },

            closeAllTabs: () => {
                set({
                    tabs: [],
                    activeTabId: null,
                })
            },

            setActiveTab: (id) => {
                set({ activeTabId: id })
                // Update last access time
                get().updateTab(id, { lastAccessTime: Date.now() })
            },

            updateTab: (id, updates) => {
                set((state) => ({
                    tabs: state.tabs.map((t) =>
                        t.id === id ? { ...t, ...updates } : t
                    ),
                }))
            },

            reorderTabs: (newTabs) => {
                set({ tabs: newTabs })
            },
        }),
        {
            name: "eidos-tabs-storage1",
        }
    )
)
