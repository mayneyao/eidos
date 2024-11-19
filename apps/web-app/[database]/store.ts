import { create } from "zustand"
import { persist } from 'zustand/middleware'

interface ISpaceAppState {
  apps: string[]
  setApps: (apps: string[]) => void

  currentAppIndex: number
  setCurrentAppIndex: (currentAppIndex: number) => void

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
}

// 新增 apps store
interface IAppsState {
  apps: string[]
  setApps: (apps: string[]) => void
  addApp: (app: string) => void
  deleteApp: (app: string) => void
  deleteByIndex: (index: number) => void
}

export const useAppsStore = create<IAppsState>()(
  persist(
    (set) => ({
      apps: ["chat"],
      setApps: (apps) => set({ apps }),
      addApp: (app) => set((state) => ({ apps: [...state.apps, app] })),
      deleteApp: (app) =>
        set((state) => ({ apps: state.apps.filter((a) => a !== app) })),
      deleteByIndex: (index) =>
        set((state) => ({ apps: state.apps.filter((_, i) => i !== index) })),
    }),
    {
      name: 'space-apps-storage',
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

  isRightPanelOpen: false,
  setIsRightPanelOpen: (isRightPanelOpen, index) => {
    if (index == null) {
      return set({ isRightPanelOpen: isRightPanelOpen, currentAppIndex: isRightPanelOpen ? 0 : -1 })
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
}))
