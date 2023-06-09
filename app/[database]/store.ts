import { create } from 'zustand'
// import { devtools, persist } from 'zustand/middleware'

interface IDatabaseAppState {

  isAiOpen: boolean
  setIsAiOpen: (isAiOpen: boolean) => void

  currentTableSchema: string
  setCurrentTableSchema: (currentTableSchema: string) => void

  currentQuery: string
  setCurrentQuery: (currentQuery: string) => void

}

export const useDatabaseAppStore = create<IDatabaseAppState>()(
  (set) => ({
    isAiOpen: false,
    setIsAiOpen: (isAiOpen) => set({ isAiOpen }),

    currentTableSchema: '',
    setCurrentTableSchema: (currentTableSchema) => set({ currentTableSchema }),

    currentQuery: '',
    setCurrentQuery: (currentQuery) => set({ currentQuery }),
  }),
)