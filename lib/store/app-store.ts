// need persist, store user config in localstorage, make app response faster

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface AppState {
  lastOpenedTable: string
  setLastOpenedTable: (table: string) => void

  sidebarWidth: number
  setSidebarWidth: (width: number) => void

  aiModel: string
  setAIModel: (model: string) => void

  isSidebarOpen: boolean
  setSidebarOpen: (isSidebarOpen: boolean) => void

  isFileManagerOpen: boolean
  setFileManagerOpen: (isOpen: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isSidebarOpen: true,
      setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),

      isFileManagerOpen: false,
      setFileManagerOpen: (isFileManagerOpen) => set({ isFileManagerOpen }),

      lastOpenedTable: "",
      setLastOpenedTable: (table) => set({ lastOpenedTable: table }),

      sidebarWidth: 400,
      setSidebarWidth: (width) => set({ sidebarWidth: width }),

      aiModel: "gpt-3.5-turbo-1106",
      setAIModel: (model) => set({ aiModel: model }),
    }),
    {
      name: "app-storage",
      getStorage: () => localStorage,
    }
  )
)
