import { ITreeNode } from "@/worker/meta_table/tree"
import { useNavigate } from "react-router-dom"
import { create } from "zustand"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"

export const useCMDKStore = create<{
  input: string
  setInput: (input: string) => void

  searchNodes: ITreeNode[]
  setSearchNodes: (searchNodes: ITreeNode[]) => void
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
  const mode = isActionMode ? "action" : "search"
  return {
    input,
    setInput,
    mode,
  }
}
