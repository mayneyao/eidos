import { create } from "zustand"

import { sqlToJSONSchema2 } from "@/lib/sqlite/helper"

// import { devtools, persist } from 'zustand/middleware'

interface IDatabaseAppState {
  isAiOpen: boolean
  setIsAiOpen: (isAiOpen: boolean) => void

  currentTableSchema: string
  setCurrentTableSchema: (currentTableSchema: string) => void

  currentQuery: string
  setCurrentQuery: (currentQuery: string) => void

  // const [schema, setSchema] = useState<ReturnType<typeof sqlToJSONSchema2>>([])
  // it's for render table
  currentSchema: ReturnType<typeof sqlToJSONSchema2>
  setCurrentSchema: (schema: ReturnType<typeof sqlToJSONSchema2>) => void

  // const [data, setData] = useState<any[]>([])
  // it's for render table
  data: any[]
  setData: (data: any[]) => void
}

export const useDatabaseAppStore = create<IDatabaseAppState>()((set) => ({
  isAiOpen: false,
  setIsAiOpen: (isAiOpen) => set({ isAiOpen }),

  currentTableSchema: "",
  setCurrentTableSchema: (currentTableSchema) => set({ currentTableSchema }),

  currentQuery: "",
  setCurrentQuery: (currentQuery) => set({ currentQuery }),

  currentSchema: [],
  setCurrentSchema: (schema) => set({ currentSchema: schema }),

  data: [],
  setData: (data) => set({ data }),
}))
