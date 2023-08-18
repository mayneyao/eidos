import { ChatCompletionResponseMessage } from "openai"
import { create } from "zustand"

// import { devtools, persist } from 'zustand/middleware'

interface ISpaceAppState {
  isAiOpen: boolean
  setIsAiOpen: (isAiOpen: boolean) => void

  aiMessages: ChatCompletionResponseMessage[]
  setAiMessages: (aiMessages: ChatCompletionResponseMessage[]) => void

  currentTableSchema: string
  setCurrentTableSchema: (currentTableSchema: string) => void

  currentQuery: string
  setCurrentQuery: (currentQuery: string) => void

  count: number
  setCount: (count: number) => void

  isMobileSidebarOpen: boolean
  setMobileSidebarOpen: (isMobileSidebarOpen: boolean) => void

  isSidebarOpen: boolean
  setSidebarOpen: (isSidebarOpen: boolean) => void
}

export const useSpaceAppStore = create<ISpaceAppState>()((set) => ({
  isAiOpen: false,
  setIsAiOpen: (isAiOpen) => set({ isAiOpen }),

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

  isSidebarOpen: true,
  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
}))
