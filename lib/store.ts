import { SqlDatabase } from '@/worker/sql'
import { create } from 'zustand'
// import { devtools, persist } from 'zustand/middleware'

interface SqliteState {
  isInitialized: boolean
  setInitialized: (isInitialized: boolean) => void

  sqlite: SqlDatabase | null
  setSqlite: (sqlite: SqlDatabase) => void

  allTables: string[]
  setAllTables: (tables: string[]) => void
}

export const useSqliteStore = create<SqliteState>()(
  (set) => ({
    isInitialized: false,
    setInitialized: (isInitialized) => set({ isInitialized }),

    sqlite: null,
    setSqlite: (sqlite) => set({ sqlite }),

    allTables: [],
    setAllTables: (tables) => set({ allTables: tables }),
  }),
)