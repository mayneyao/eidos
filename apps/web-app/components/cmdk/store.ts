import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { create } from "zustand"

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
