// need persist, store user config in localstorage, make app response faster

import { useSidebar } from "@/components/ui/sidebar"
import { create } from "zustand"
import { persist } from "zustand/middleware"

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
      isSidebarOpen: false,
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
      getStorage: () => localStorage,
    }
  )
)

export const useAppStore = () => {
  const store = useAppStoreBase()
  const { open, setOpen } = useSidebar()


  return {
    ...store,
    isSidebarOpen: open,
    setSidebarOpen: (isOpen: boolean) => {
      store.setSidebarOpen(isOpen)
      setOpen(isOpen)
    }
  }
}
