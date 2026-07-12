// need persist, store user config in localstorage, make app response faster

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

interface AppState {
  isSidebarOpen: boolean
  setSidebarOpen: (isOpen: boolean) => void

  lastOpenedTable: string
  setLastOpenedTable: (table: string) => void

  sidebarWidth: number
  setSidebarWidth: (width: number) => void

  aiModel: string
  setAIModel: (model: string) => void

  isFileManagerOpen: boolean
  setFileManagerOpen: (isOpen: boolean) => void
}

export const useAppStoreBase = create<AppState>()(
  persist(
    (set) => ({
      isSidebarOpen: true,
      setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

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
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// Re-export for backward compatibility
export { useAppStore } from "@/apps/web-app/hooks/use-app-store"
