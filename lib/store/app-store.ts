// need persist, store user config in localstorage

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface AppState {
  lastOpenedDatabase: string
  setLastOpenedDatabase: (database: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      lastOpenedDatabase: "",
      setLastOpenedDatabase: (database) =>
        set({ lastOpenedDatabase: database }),
    }),
    {
      name: "app-storage",
      getStorage: () => localStorage,
    }
  )
)
