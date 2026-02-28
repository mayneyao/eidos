import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"

interface ISpaceAppState {
  apps: string[]
  setApps: (apps: string[]) => void

  currentAppIndex: number
  setCurrentAppIndex: (currentAppIndex: number) => void

  currentApp: string
  setCurrentApp: (currentApp: string) => void
  resetCurrentApp: () => void

  isRightPanelOpen: boolean
  setIsRightPanelOpen: (isAiOpen: boolean, index?: number) => void

  isExtAppOpen: boolean
  setIsExtAppOpen: (isExtAppOpen: boolean) => void

  aiMessages: any[]
  setAiMessages: (aiMessages: any[]) => void

  currentTableSchema: string
  setCurrentTableSchema: (currentTableSchema: string) => void

  currentQuery: string
  setCurrentQuery: (currentQuery: string) => void

  count: number
  setCount: (count: number) => void

  isMobileSidebarOpen: boolean
  setMobileSidebarOpen: (isMobileSidebarOpen: boolean) => void

  tempPanelNode: ITreeNode | null
  setTempPanelNode: (node: ITreeNode | null) => void
  clearCurrentApp: () => void

  // Helper to check if currentApp and tempPanelNode are mutually exclusive
  hasActivePanel: () => boolean
}

interface IAppsState {
  apps: string[]
  setApps: (apps: string[]) => void
  addApp: (app: string) => void
  deleteApp: (app: string) => void
}

export const useAppsStore = create<IAppsState>()(
  persist(
    (set) => ({
      apps: ["chat"],
      setApps: (apps) => set({ apps }),
      addApp: (app) => set((state) => ({ apps: [...state.apps, app] })),
      deleteApp: (app) =>
        set((state) => ({ apps: state.apps.filter((a) => a !== app) })),
    }),
    {
      name: "space-apps-storage",
    }
  )
)

export const useSpaceAppStore = create<ISpaceAppState>()((set, get) => ({
  get apps() {
    return useAppsStore.getState().apps
  },
  setApps: (apps: string[]) => useAppsStore.getState().setApps(apps),

  currentAppIndex: -1,
  setCurrentAppIndex: (currentAppIndex) => set({ currentAppIndex }),

  currentApp: "chat",
  setCurrentApp: (currentApp) => set({ currentApp, tempPanelNode: null }),
  resetCurrentApp: () => set({ currentApp: "chat", tempPanelNode: null }),
  isRightPanelOpen: false,
  setIsRightPanelOpen: (isRightPanelOpen, index) => {
    if (index == null) {
      return set({
        isRightPanelOpen: isRightPanelOpen,
        currentAppIndex: isRightPanelOpen ? 0 : -1,
      })
    }
    return set({
      isRightPanelOpen: isRightPanelOpen,
      currentAppIndex: index ?? get().currentAppIndex,
    })
  },

  isExtAppOpen: false,
  setIsExtAppOpen: (isExtAppOpen) => set({ isExtAppOpen }),

  aiMessages: [],
  setAiMessages: (aiMessages) => set({ aiMessages }),

  currentTableSchema: "",
  setCurrentTableSchema: (currentTableSchema) => set({ currentTableSchema }),

  currentQuery: "",
  setCurrentQuery: (currentQuery) => set({ currentQuery }),

  count: 0,
  setCount: (count) => set({ count }),

  isMobileSidebarOpen: false,
  setMobileSidebarOpen: (isMobileSidebarOpen) => set({ isMobileSidebarOpen }),

  tempPanelNode: null,
  setTempPanelNode: (tempPanelNode) =>
    set({ tempPanelNode, currentApp: tempPanelNode ? "" : get().currentApp }),
  clearCurrentApp: () =>
    set({ currentApp: "", currentAppIndex: -1, tempPanelNode: null }),

  // Helper to check if currentApp and tempPanelNode are mutually exclusive
  hasActivePanel: () => {
    const state = get()
    return (
      Boolean(state.currentApp && state.currentApp !== "") ||
      Boolean(state.tempPanelNode)
    )
  },
}))
