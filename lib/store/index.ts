import type { SqlDatabase } from "@/worker/sql"
import { create } from "zustand"

import { sqlToJSONSchema2 } from "../sqlite/helper"

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
