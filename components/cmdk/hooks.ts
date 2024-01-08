import { ITreeNode } from "@/lib/store/ITreeNode"
import { useNavigate } from "react-router-dom"
import { create } from "zustand"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"

export type ISearchNodes = ITreeNode & {
  result?: string
  mode: "node" | "fts"
}
export const useCMDKStore = create<{
  input: string
  setInput: (input: string) => void

  searchNodes: ISearchNodes[]
  setSearchNodes: (searchNodes: ISearchNodes[]) => void
}>()((set) => ({
  input: "",
  setInput: (input) => set({ input }),

  searchNodes: [],
  setSearchNodes: (searchNodes) => set({ searchNodes }),
}))

export const useCMDKGoto = () => {
  const router = useNavigate()
  const { setCmdkOpen } = useAppRuntimeStore()
  const goto = (path: string) => () => {
    setCmdkOpen(false)
    router(path)
  }
  return goto
}

export const useInput = () => {
  const { input, setInput } = useCMDKStore()
  const isActionMode = input.startsWith("/")
  const isSystemMode = input.startsWith("!")
  const mode = isActionMode ? "action" : isSystemMode ? "syscall" : "search"
  return {
    input,
    setInput,
    mode,
  }
}
