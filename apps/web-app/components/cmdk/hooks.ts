import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { create } from "zustand"

import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

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
  const { navigate } = useRouterAdapter()
  const { setCmdkOpen } = useAppRuntimeStore()
  const goto = (path: string) => () => {
    setCmdkOpen(false)
    navigate(path)
  }
  return goto
}

export const useInput = () => {
  const { input, setInput } = useCMDKStore()
  const isActionMode = input.startsWith("/")
  const isSystemMode = input.startsWith("!")
  const isEmbeddingMode = input.startsWith("@")
  const mode = isActionMode
    ? "action"
    : isSystemMode
      ? "syscall"
      : isEmbeddingMode
        ? "embedding"
        : "search"
  return {
    input,
    setInput,
    mode,
  }
}
