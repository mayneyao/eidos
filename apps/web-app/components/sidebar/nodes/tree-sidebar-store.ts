import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { create } from "zustand"
import { persist } from "zustand/middleware"

export type TreeSortField = "name" | "created_at" | "type"
export type TreeSortOrder = "ASC" | "DESC"

export type ISearchNodes = ITreeNode & {
  result?: string
  mode: "node" | "fts"
}

interface TreeSidebarState {
  searchTerm: string
  setSearchTerm: (term: string) => void
  sortField: TreeSortField
  sortOrder: TreeSortOrder
  setSort: (field: TreeSortField, order: TreeSortOrder) => void
  focusedNodeId: string | null
  setFocusedNodeId: (id: string | null) => void
  searchResults: ISearchNodes[]
  setSearchResults: (results: ISearchNodes[]) => void
  isSearchMode: boolean
  setIsSearchMode: (isSearchMode: boolean) => void
}

export const useTreeSidebarStore = create<TreeSidebarState>()(
  persist(
    (set, get) => ({
      searchTerm: "",
      setSearchTerm: (term: string) => set({ searchTerm: term }),
      sortField: "name",
      sortOrder: "ASC",
      setSort: (field: TreeSortField, order: TreeSortOrder) => 
        set({ sortField: field, sortOrder: order }),
      focusedNodeId: null,
      setFocusedNodeId: (id: string | null) => set({ focusedNodeId: id }),
      searchResults: [],
      setSearchResults: (results: ISearchNodes[]) => set({ searchResults: results }),
      isSearchMode: false,
      setIsSearchMode: (isSearchMode: boolean) => set({ isSearchMode }),
    }),
    {
      name: "tree-sidebar-state",
      partialize: (state) => ({
        sortField: state.sortField,
        sortOrder: state.sortOrder,
        focusedNodeId: state.focusedNodeId,
      }),
    }
  )
)
