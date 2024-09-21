import { create } from "zustand"

// import { devtools, persist } from 'zustand/middleware'

interface ISpaceAppState {
  isRightPanelOpen: boolean
  setIsRightPanelOpen: (isAiOpen: boolean, index?: number) => void

  isExtAppOpen: boolean
  setIsExtAppOpen: (isExtAppOpen: boolean) => void

  apps: string[]
  setApps: (apps: string[]) => void

  currentAppIndex: number
  setCurrentAppIndex: (currentAppIndex: number) => void

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

export const useSpaceAppStore = create<ISpaceAppState>()((set, get) => ({
  apps: ["chat"],
  // disable file manager
  // apps: ["chat", "file-manager"],
  setApps: (apps) => set({ apps }),

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
