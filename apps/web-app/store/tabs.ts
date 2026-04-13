import { nanoid } from "nanoid"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

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

// New: Panel represents a split view pane containing tabs
export interface Panel {
  id: string
  tabIds: string[]
  activeTabId: string | null
}

// Split direction for creating new panels
export type SplitDirection = "right" | "down"

// Maximum number of panels allowed
const MAX_PANELS = 4

interface TabState {
  tabs: Tab[]
  panels: Panel[]
  activePanelId: string | null
  history: Record<string, { entries: TabHistoryEntry[]; index: number }>
  tabNavigators: Record<string, (delta: number) => void>
  nextNavigationOptions: Record<string, { replace?: boolean }>
  closedTabsStack: ClosedTab[]
  // Layout direction: 'horizontal' for left-right, 'vertical' for top-bottom
  splitDirection: "horizontal" | "vertical"

  // Tab Actions
  openTab: (
    url: string,
    title?: string,
    options?: { panelId?: string; openInRightPanel?: boolean }
  ) => void
  closeTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  closeTabsToRight: (id: string) => void
  closeAllTabs: () => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<Tab>) => void
  reorderTabs: (newTabs: Tab[], panelId?: string) => void
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
  consumeNextNavigationOptions: (
    id: string
  ) => { replace?: boolean } | undefined
  reopenLastClosedTab: () => void

  // Panel Actions
  splitTab: (tabId: string, direction: SplitDirection) => void
  moveTabToPanel: (tabId: string, targetPanelId: string) => void
  setActivePanel: (panelId: string) => void
  closePanel: (panelId: string) => void
  setSplitDirection: (direction: "horizontal" | "vertical") => void

  // Computed helpers
  getActiveTabId: () => string | null
  getPanelTabs: (panelId: string) => Tab[]
  getPanelForTab: (tabId: string) => Panel | undefined
}

const storageName = "eidos-tabs-storage"

// Helper to ensure at least one panel exists
function ensureDefaultPanel(state: Partial<TabState>): Panel[] {
  if (!state.panels || state.panels.length === 0) {
    const defaultPanel: Panel = {
      id: nanoid(),
      tabIds: state.tabs?.map((t) => t.id) || [],
      activeTabId: state.tabs?.[0]?.id || null,
    }
    return [defaultPanel]
  }
  return state.panels
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [],
      panels: [],
      activePanelId: null,
      history: {},
      tabNavigators: {},
      nextNavigationOptions: {},
      closedTabsStack: [],
      splitDirection: "horizontal",

      openTab: (url, title = "New Tab", options) => {
        const { tabs, panels, activePanelId } = get()
        const { panelId, openInRightPanel } = options || {}

        const newTab: Tab = {
          id: nanoid(),
          url,
          title,
          lastAccessTime: Date.now(),
        }

        // Handle openInRightPanel option
        if (openInRightPanel) {
          const currentPanelIndex = panels.findIndex(
            (p) => p.id === activePanelId
          )
          const rightPanelIndex = currentPanelIndex + 1

          if (rightPanelIndex < panels.length) {
            // There's a panel to the right, use it
            const rightPanel = panels[rightPanelIndex]
            set({
              tabs: [...tabs, newTab],
              panels: panels.map((p) =>
                p.id === rightPanel.id
                  ? {
                      ...p,
                      tabIds: [...p.tabIds, newTab.id],
                      activeTabId: newTab.id,
                    }
                  : p
              ),
              activePanelId: rightPanel.id,
            })
          } else {
            // No panel to the right, create new one
            const newPanel: Panel = {
              id: nanoid(),
              tabIds: [newTab.id],
              activeTabId: newTab.id,
            }
            set({
              tabs: [...tabs, newTab],
              panels: [...panels, newPanel],
              activePanelId: newPanel.id,
              splitDirection: "horizontal",
            })
          }
          return
        }

        // Determine which panel to add the tab to
        const targetPanelId = panelId || activePanelId || panels[0]?.id

        if (!targetPanelId) {
          // No panels exist, create one
          const newPanel: Panel = {
            id: nanoid(),
            tabIds: [newTab.id],
            activeTabId: newTab.id,
          }
          set({
            tabs: [...tabs, newTab],
            panels: [newPanel],
            activePanelId: newPanel.id,
          })
          return
        }

        // Add tab to existing panel
        set({
          tabs: [...tabs, newTab],
          panels: panels.map((p) =>
            p.id === targetPanelId
              ? {
                  ...p,
                  tabIds: [...p.tabIds, newTab.id],
                  activeTabId: newTab.id,
                }
              : p
          ),
          activePanelId: targetPanelId,
        })
      },

      closeTab: (id) => {
        const {
          tabs,
          panels,
          activePanelId,
          history,
          tabNavigators,
          nextNavigationOptions,
          closedTabsStack,
        } = get()
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
          const newStack = [...closedTabsStack, closedTabInfo].slice(-10)
          set({ closedTabsStack: newStack })
        }

        // Find which panel contains this tab and update it
        let newPanels = panels.map((panel) => {
          if (!panel.tabIds.includes(id)) return panel

          const newTabIds = panel.tabIds.filter((tid) => tid !== id)
          let newActiveTabId = panel.activeTabId

          if (panel.activeTabId === id) {
            // Find next tab to activate
            const index = panel.tabIds.indexOf(id)
            const nextTab = newTabIds[index] || newTabIds[index - 1]
            newActiveTabId = nextTab || null
          }

          return {
            ...panel,
            tabIds: newTabIds,
            activeTabId: newActiveTabId,
          }
        })

        // Remove empty panels (but keep at least one)
        const nonEmptyPanels = newPanels.filter((p) => p.tabIds.length > 0)
        if (nonEmptyPanels.length > 0) {
          newPanels = nonEmptyPanels
        }

        // Update active panel if the current one was removed
        let newActivePanelId = activePanelId
        if (!newPanels.find((p) => p.id === activePanelId)) {
          newActivePanelId = newPanels[0]?.id || null
        }

        set({
          tabs: newTabs,
          panels: newPanels,
          activePanelId: newActivePanelId,
          history: Object.fromEntries(
            Object.entries(history).filter(([tabId]) => tabId !== id)
          ),
          tabNavigators: Object.fromEntries(
            Object.entries(tabNavigators).filter(([tabId]) => tabId !== id)
          ),
          nextNavigationOptions: Object.fromEntries(
            Object.entries(nextNavigationOptions).filter(
              ([tabId]) => tabId !== id
            )
          ),
        })
      },

      closeOtherTabs: (id) => {
        const { tabs, panels, activePanelId } = get()
        const tabToKeep = tabs.find((t) => t.id === id)
        if (!tabToKeep) return

        // Find which panel the tab is in
        const panel = panels.find((p) => p.tabIds.includes(id))
        if (!panel) return

        // Keep only this tab in the panel, remove other panels
        set({
          tabs: [tabToKeep],
          panels: [
            {
              ...panel,
              tabIds: [id],
              activeTabId: id,
            },
          ],
          activePanelId: panel.id,
        })
      },

      closeTabsToRight: (id) => {
        const { tabs, panels, activePanelId } = get()

        // Find which panel contains this tab
        const panel = panels.find((p) => p.tabIds.includes(id))
        if (!panel) return

        const index = panel.tabIds.indexOf(id)
        const newTabIds = panel.tabIds.slice(0, index + 1)
        const removedTabIds = panel.tabIds.slice(index + 1)

        // Update panel
        const newPanels = panels.map((p) =>
          p.id === panel.id
            ? {
                ...p,
                tabIds: newTabIds,
                activeTabId: newTabIds.includes(p.activeTabId || "")
                  ? p.activeTabId
                  : newTabIds[newTabIds.length - 1] || null,
              }
            : p
        )

        // Remove tabs that were closed
        const newTabs = tabs.filter((t) => !removedTabIds.includes(t.id))

        set({
          tabs: newTabs,
          panels: newPanels,
        })
      },

      closeAllTabs: () => {
        set({
          tabs: [],
          panels: [],
          activePanelId: null,
        })
      },

      setActiveTab: (id) => {
        const { panels } = get()

        // Find which panel contains this tab and activate it
        const panel = panels.find((p) => p.tabIds.includes(id))
        if (!panel) return

        set({
          panels: panels.map((p) =>
            p.id === panel.id ? { ...p, activeTabId: id } : p
          ),
          activePanelId: panel.id,
        })

        // Update last access time
        get().updateTab(id, { lastAccessTime: Date.now() })
      },

      updateTab: (id, updates) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }))
      },

      reorderTabs: (newTabs, panelId) => {
        const { panels, activePanelId } = get()
        const targetPanelId = panelId || activePanelId

        if (targetPanelId) {
          // Reorder tabs within a specific panel
          const newTabIds = newTabs.map((t) => t.id)
          set({
            tabs: newTabs,
            panels: panels.map((p) =>
              p.id === targetPanelId ? { ...p, tabIds: newTabIds } : p
            ),
          })
        } else {
          set({ tabs: newTabs })
        }
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
        const { closedTabsStack, tabs, panels, activePanelId } = get()
        if (closedTabsStack.length === 0) return

        const lastClosed = closedTabsStack[closedTabsStack.length - 1]
        const newStack = closedTabsStack.slice(0, -1)

        const newTab: Tab = {
          id: nanoid(),
          url: lastClosed.url,
          title: lastClosed.title,
          icon: lastClosed.icon,
          lastAccessTime: Date.now(),
        }

        // Add to active panel or first panel
        const targetPanelId = activePanelId || panels[0]?.id

        if (!targetPanelId) {
          // No panels exist, create one
          const newPanel: Panel = {
            id: nanoid(),
            tabIds: [newTab.id],
            activeTabId: newTab.id,
          }
          set({
            closedTabsStack: newStack,
            tabs: [...tabs, newTab],
            panels: [newPanel],
            activePanelId: newPanel.id,
          })
          return
        }

        set({
          closedTabsStack: newStack,
          tabs: [...tabs, newTab],
          panels: panels.map((p) =>
            p.id === targetPanelId
              ? {
                  ...p,
                  tabIds: [...p.tabIds, newTab.id],
                  activeTabId: newTab.id,
                }
              : p
          ),
          activePanelId: targetPanelId,
        })
      },

      // Panel Actions
      splitTab: (tabId, direction) => {
        const { tabs, panels, splitDirection } = get()

        // Check max panels limit
        if (panels.length >= MAX_PANELS) {
          console.warn(`Cannot create more than ${MAX_PANELS} panels`)
          return
        }

        const tab = tabs.find((t) => t.id === tabId)
        if (!tab) return

        // Find current panel
        const currentPanel = panels.find((p) => p.tabIds.includes(tabId))
        if (!currentPanel) return

        // Determine new split direction based on the action
        const newSplitDirection =
          direction === "right" ? "horizontal" : "vertical"

        // If this panel has only one tab, we need to duplicate the tab instead of moving it
        if (currentPanel.tabIds.length === 1) {
          // Create a new tab with the same URL
          const newTab: Tab = {
            id: nanoid(),
            url: tab.url,
            title: tab.title,
            icon: tab.icon,
            lastAccessTime: Date.now(),
          }

          // Create new panel with the duplicated tab
          const newPanel: Panel = {
            id: nanoid(),
            tabIds: [newTab.id],
            activeTabId: newTab.id,
          }

          // Insert new panel after current panel
          const currentIndex = panels.findIndex((p) => p.id === currentPanel.id)
          const newPanels = [...panels]
          newPanels.splice(currentIndex + 1, 0, newPanel)

          set({
            tabs: [...tabs, newTab],
            panels: newPanels,
            activePanelId: newPanel.id,
            splitDirection: newSplitDirection,
          })
          return
        }

        // Panel has multiple tabs - move the tab to a new panel
        const newCurrentPanel = {
          ...currentPanel,
          tabIds: currentPanel.tabIds.filter((id) => id !== tabId),
          activeTabId:
            currentPanel.activeTabId === tabId
              ? currentPanel.tabIds.find((id) => id !== tabId) || null
              : currentPanel.activeTabId,
        }

        // Create new panel with the tab
        const newPanel: Panel = {
          id: nanoid(),
          tabIds: [tabId],
          activeTabId: tabId,
        }

        // Insert new panel after current panel
        const currentIndex = panels.findIndex((p) => p.id === currentPanel.id)
        const newPanels = [...panels]

        // Update current panel
        newPanels[currentIndex] = newCurrentPanel

        // Insert new panel after current
        newPanels.splice(currentIndex + 1, 0, newPanel)

        // Remove empty panels
        const finalPanels = newPanels.filter((p) => p.tabIds.length > 0)

        set({
          panels: finalPanels,
          activePanelId: newPanel.id,
          splitDirection: newSplitDirection,
        })
      },

      moveTabToPanel: (tabId, targetPanelId) => {
        const { panels, tabs } = get()

        const tab = tabs.find((t) => t.id === tabId)
        if (!tab) return

        const sourcePanel = panels.find((p) => p.tabIds.includes(tabId))
        const targetPanel = panels.find((p) => p.id === targetPanelId)

        if (!sourcePanel || !targetPanel || sourcePanel.id === targetPanelId)
          return

        // Remove from source panel
        const newSourcePanel = {
          ...sourcePanel,
          tabIds: sourcePanel.tabIds.filter((id) => id !== tabId),
          activeTabId:
            sourcePanel.activeTabId === tabId
              ? sourcePanel.tabIds.find((id) => id !== tabId) || null
              : sourcePanel.activeTabId,
        }

        // Add to target panel
        const newTargetPanel = {
          ...targetPanel,
          tabIds: [...targetPanel.tabIds, tabId],
          activeTabId: tabId,
        }

        let newPanels = panels.map((p) => {
          if (p.id === sourcePanel.id) return newSourcePanel
          if (p.id === targetPanel.id) return newTargetPanel
          return p
        })

        // Remove empty panels
        newPanels = newPanels.filter((p) => p.tabIds.length > 0)

        set({
          panels: newPanels,
          activePanelId: targetPanelId,
        })
      },

      setActivePanel: (panelId) => {
        set({ activePanelId: panelId })
      },

      closePanel: (panelId) => {
        const { panels, tabs, activePanelId, closedTabsStack, history } = get()

        const panel = panels.find((p) => p.id === panelId)
        if (!panel) return

        // Save tabs to closed stack
        const closedTabs = panel.tabIds
          .map((id) => {
            const tab = tabs.find((t) => t.id === id)
            if (!tab) return null
            return {
              url: tab.url,
              title: tab.title,
              icon: tab.icon,
              historyState: history[id],
            } as ClosedTab
          })
          .filter((t): t is ClosedTab => t !== null)

        const newStack = [...closedTabsStack, ...closedTabs].slice(-10)

        // Remove panel and its tabs
        const newPanels = panels.filter((p) => p.id !== panelId)
        const newTabs = tabs.filter((t) => !panel.tabIds.includes(t.id))

        // Update active panel
        let newActivePanelId = activePanelId
        if (activePanelId === panelId) {
          newActivePanelId = newPanels[0]?.id || null
        }

        set({
          panels: newPanels,
          tabs: newTabs,
          activePanelId: newActivePanelId,
          closedTabsStack: newStack,
        })
      },

      setSplitDirection: (direction) => {
        set({ splitDirection: direction })
      },

      // Computed helpers
      getActiveTabId: () => {
        const { panels, activePanelId } = get()
        const activePanel = panels.find((p) => p.id === activePanelId)
        return activePanel?.activeTabId || null
      },

      getPanelTabs: (panelId) => {
        const { panels, tabs } = get()
        const panel = panels.find((p) => p.id === panelId)
        if (!panel) return []
        return panel.tabIds
          .map((id) => tabs.find((t) => t.id === id))
          .filter((t): t is Tab => t !== undefined)
      },

      getPanelForTab: (tabId) => {
        const { panels } = get()
        return panels.find((p) => p.tabIds.includes(tabId))
      },
    }),
    {
      name: storageName,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        panels: state.panels,
        activePanelId: state.activePanelId,
        history: state.history,
        closedTabsStack: state.closedTabsStack,
        splitDirection: state.splitDirection,
      }),
      // Migration: ensure panels exist when loading old state
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.panels = ensureDefaultPanel(state)
          if (!state.activePanelId && state.panels.length > 0) {
            state.activePanelId = state.panels[0].id
          }
        }
      },
    }
  )
)

// Legacy compatibility: activeTabId getter for components that still use it
// This returns the active tab of the active panel
Object.defineProperty(useTabStore.getState(), "activeTabId", {
  get() {
    return useTabStore.getState().getActiveTabId()
  },
})
