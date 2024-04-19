import { create } from "zustand"

// import { devtools, persist } from 'zustand/middleware'

interface ISpaceAppState {
  isAiOpen: boolean
  setIsAiOpen: (isAiOpen: boolean) => void

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

export const useSpaceAppStore = create<ISpaceAppState>()((set) => ({
  isAiOpen: false,
  setIsAiOpen: (isAiOpen) => set({ isAiOpen }),

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
