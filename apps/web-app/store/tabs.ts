import { create } from "zustand"
import { persist } from "zustand/middleware"
import { nanoid } from "nanoid"

export interface TabHistoryEntry {
    key: string
    url: string
}

export interface Tab {
    id: string
    url: string
    title: string
    icon?: string
    lastAccessTime: number
}

export interface ClosedTab {
    url: string
    title: string
    icon?: string
    historyState?: { entries: TabHistoryEntry[]; index: number }
}

interface TabState {
    tabs: Tab[]
    activeTabId: string | null
    history: Record<string, { entries: TabHistoryEntry[]; index: number }>
    tabNavigators: Record<string, (delta: number) => void>
    nextNavigationOptions: Record<string, { replace?: boolean }>
    closedTabsStack: ClosedTab[]

    // Actions
    openTab: (url: string, title?: string) => void
    closeTab: (id: string) => void
    closeOtherTabs: (id: string) => void
    closeTabsToRight: (id: string) => void
    closeAllTabs: () => void
    setActiveTab: (id: string) => void
    updateTab: (id: string, updates: Partial<Tab>) => void
    reorderTabs: (newTabs: Tab[]) => void
    recordHistoryNavigation: (
        id: string,
        entry: TabHistoryEntry,
        type: "POP" | "PUSH" | "REPLACE"
    ) => void
    canGoBack: (id: string) => boolean
    canGoForward: (id: string) => boolean
    registerTabNavigator: (id: string, navigator: (delta: number) => void) => void
    unregisterTabNavigator: (id: string) => void
    goInTabHistory: (id: string, delta: number) => void
    setNextNavigationOptions: (id: string, options: { replace?: boolean }) => void
    consumeNextNavigationOptions: (id: string) => { replace?: boolean } | undefined
    reopenLastClosedTab: () => void
}

export const useTabStore = create<TabState>()(
    (set, get) => ({
        tabs: [],
        activeTabId: null,
        history: {},
        tabNavigators: {},
        nextNavigationOptions: {},
        closedTabsStack: [],

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
            const { tabs, activeTabId, history, tabNavigators, nextNavigationOptions, closedTabsStack } = get()
            const closedTab = tabs.find((t) => t.id === id)
            const newTabs = tabs.filter((t) => t.id !== id)

            // Save the closed tab to the stack for potential restoration
            if (closedTab) {
                const closedTabInfo: ClosedTab = {
                    url: closedTab.url,
                    title: closedTab.title,
                    icon: closedTab.icon,
                    historyState: history[id],
                }
                // Add to stack, limit to 10 most recent closed tabs
                const newStack = [...closedTabsStack, closedTabInfo].slice(-10)
                set({ closedTabsStack: newStack })
            }

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
                history: Object.fromEntries(
                    Object.entries(history).filter(([tabId]) => tabId !== id)
                ),
                tabNavigators: Object.fromEntries(
                    Object.entries(tabNavigators).filter(([tabId]) => tabId !== id)
                ),
                nextNavigationOptions: Object.fromEntries(
                    Object.entries(nextNavigationOptions).filter(([tabId]) => tabId !== id)
                ),
            })
        },

        closeOtherTabs: (id) => {
            const { tabs } = get()
            const tabToKeep = tabs.find((t) => t.id === id)
            if (tabToKeep) {
                set({
                    tabs: [tabToKeep],
                    activeTabId: id,
                })
            }
        },

        closeTabsToRight: (id) => {
            const { tabs, activeTabId } = get()
            const index = tabs.findIndex((t) => t.id === id)
            if (index === -1) return

            const newTabs = tabs.slice(0, index + 1)

            // If active tab was to the right, switch to the rightmost remaining tab
            let newActiveId = activeTabId
            if (activeTabId && !newTabs.find((t) => t.id === activeTabId)) {
                newActiveId = newTabs[newTabs.length - 1]?.id || null
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

        recordHistoryNavigation: (id, entry, type) => {
            set((state) => {
                const current = state.history[id] || { entries: [], index: -1 }
                let entries = current.entries
                let index = current.index

                if (type === "POP") {
                    const foundIndex = entries.findIndex((e) => e.key === entry.key)
                    if (foundIndex !== -1) {
                        index = foundIndex
                    } else {
                        // If we cannot find the key, fall back to push to avoid desync
                        entries = entries.slice(0, index + 1).concat(entry)
                        index = entries.length - 1
                    }
                } else if (type === "REPLACE") {
                    if (index >= 0 && index < entries.length) {
                        entries = entries.map((e, i) => (i === index ? entry : e))
                    } else if (entries.length === 0) {
                        entries = [entry]
                        index = 0
                    } else {
                        entries = entries.slice(0, index + 1).concat(entry)
                        index = entries.length - 1
                    }
                } else {
                    // PUSH
                    entries = entries.slice(0, index + 1).concat(entry)
                    index = entries.length - 1
                }

                return {
                    history: {
                        ...state.history,
                        [id]: { entries, index },
                    },
                }
            })
        },

        canGoBack: (id) => {
            const history = get().history[id]
            return history ? history.index > 0 : false
        },

        canGoForward: (id) => {
            const history = get().history[id]
            return history ? history.index < history.entries.length - 1 : false
        },

        registerTabNavigator: (id, navigator) => {
            set((state) => ({
                tabNavigators: { ...state.tabNavigators, [id]: navigator },
            }))
        },

        unregisterTabNavigator: (id) => {
            set((state) => {
                const { [id]: _omit, ...rest } = state.tabNavigators
                return { tabNavigators: rest }
            })
        },

        goInTabHistory: (id, delta) => {
            const { tabNavigators, canGoBack, canGoForward } = get()
            if (delta < 0 && !canGoBack(id)) return
            if (delta > 0 && !canGoForward(id)) return

            const navigator = tabNavigators[id]
            navigator?.(delta)
        },

        setNextNavigationOptions: (id, options) => {
            set((state) => ({
                nextNavigationOptions: {
                    ...state.nextNavigationOptions,
                    [id]: options,
                },
            }))
        },

        consumeNextNavigationOptions: (id) => {
            const { nextNavigationOptions } = get()
            const opts = nextNavigationOptions[id]
            if (opts) {
                set((state) => {
                    const { [id]: _omit, ...rest } = state.nextNavigationOptions
                    return { nextNavigationOptions: rest }
                })
            }
            return opts
        },

        reopenLastClosedTab: () => {
            const { closedTabsStack, tabs } = get()
            if (closedTabsStack.length === 0) return

            // Pop the last closed tab from the stack
            const lastClosed = closedTabsStack[closedTabsStack.length - 1]
            const newStack = closedTabsStack.slice(0, -1)

            // Create a new tab with the closed tab's information
            const newTab: Tab = {
                id: nanoid(),
                url: lastClosed.url,
                title: lastClosed.title,
                icon: lastClosed.icon,
                lastAccessTime: Date.now(),
            }

            set({
                closedTabsStack: newStack,
                tabs: [...tabs, newTab],
                activeTabId: newTab.id,
            })
        },
    }),

)
