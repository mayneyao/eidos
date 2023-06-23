import { ChatCompletionResponseMessage } from "openai"
import { create } from "zustand"

import { sqlToJSONSchema2 } from "@/lib/sqlite/helper"

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

  // const [schema, setSchema] = useState<ReturnType<typeof sqlToJSONSchema2>>([])
  // it's for render table
  currentSchema: ReturnType<typeof sqlToJSONSchema2>
  setCurrentSchema: (schema: ReturnType<typeof sqlToJSONSchema2>) => void

  // const [data, setData] = useState<any[]>([])
  // it's for render table
  data: any[]
  setData: (data: any[]) => void

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

  currentSchema: [],
  setCurrentSchema: (schema) => set({ currentSchema: schema }),

  data: [],
  setData: (data) => set({ data }),

  isMobileSidebarOpen: false,
  setMobileSidebarOpen: (isMobileSidebarOpen) => set({ isMobileSidebarOpen }),

  isSidebarOpen: true,
  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
}))
