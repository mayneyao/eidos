import type { SqlDatabase } from "@/worker/sql"
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SqliteState {
  isInitialized: boolean
  setInitialized: (isInitialized: boolean) => void

  currentDatabase: string
  setCurrentDatabase: (database: string) => void

  sqlite: SqlDatabase | null
  setSqlite: (sqlite: SqlDatabase) => void

  allTables: string[]
  setAllTables: (tables: string[]) => void

  selectedTable: string
  setSelectedTable: (table: string) => void

  databaseList: string[]
  setDatabaseList: (databaseList: string[]) => void
}

// not using persist 
export const useSqliteStore = create<SqliteState>()((set) => ({
  isInitialized: false,
  setInitialized: (isInitialized) => set({ isInitialized }),

  currentDatabase: "",
  setCurrentDatabase: (database) => set({ currentDatabase: database }),

  sqlite: null,
  setSqlite: (sqlite) => set({ sqlite }),

  allTables: [],
  setAllTables: (tables) => set({ allTables: tables }),

  selectedTable: "",
  setSelectedTable: (table) => set({ selectedTable: table }),

  databaseList: [],
  setDatabaseList: (databaseList) => set({ databaseList }),
}))


interface AppState {
  lastOpenedDatabase: string
  setLastOpenedDatabase: (database: string) => void
}

// need persist, store user config in localstorage
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
