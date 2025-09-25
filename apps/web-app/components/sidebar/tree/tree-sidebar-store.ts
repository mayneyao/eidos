import { create } from "zustand"
import { persist } from "zustand/middleware"

export type TreeSortField = "name" | "created_at" | "updated_at" | "type"
export type TreeSortOrder = "ASC" | "DESC"

interface TreeSidebarState {
  searchTerm: string
  setSearchTerm: (term: string) => void
  showSearch: boolean
  setShowSearch: (show: boolean) => void
  toggleSearch: () => void
  sortField: TreeSortField
  sortOrder: TreeSortOrder
  setSort: (field: TreeSortField, order: TreeSortOrder) => void
  focusedNodeId: string | null
  setFocusedNodeId: (id: string | null) => void
}

export const useTreeSidebarStore = create<TreeSidebarState>()(
  persist(
    (set, get) => ({
      searchTerm: "",
      setSearchTerm: (term: string) => set({ searchTerm: term }),
      showSearch: false,
      setShowSearch: (show: boolean) => set({ showSearch: show }),
      toggleSearch: () => set((state) => ({ showSearch: !state.showSearch })),
      sortField: "name",
      sortOrder: "ASC",
      setSort: (field: TreeSortField, order: TreeSortOrder) => 
        set({ sortField: field, sortOrder: order }),
      focusedNodeId: null,
      setFocusedNodeId: (id: string | null) => set({ focusedNodeId: id }),
    }),
    {
      name: "tree-sidebar-state",
    }
  )
)
