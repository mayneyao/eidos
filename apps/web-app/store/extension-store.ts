import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { ISearchExtensions } from "@/apps/web-app/hooks/use-query-extension"

export type ExtensionSortField = "slug" | "created_at" | "updated_at"
export type ExtensionSortOrder = "ASC" | "DESC"

interface ExtensionState {
  isSidebarOpen: boolean
  setSidebarOpen: (isOpen: boolean) => void
  toggleSidebar: () => void
  focusedExtensionId: string | null
  setFocusedExtensionId: (id: string | null) => void
  sortField: ExtensionSortField
  sortOrder: ExtensionSortOrder
  setSort: (field: ExtensionSortField, order: ExtensionSortOrder) => void
  searchTerm: string
  setSearchTerm: (term: string) => void
  searchResults: ISearchExtensions[]
  setSearchResults: (results: ISearchExtensions[]) => void
  isSearchMode: boolean
  setIsSearchMode: (isSearchMode: boolean) => void
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  isExtensionsExpanded: boolean
  setIsExtensionsExpanded: (expanded: boolean) => void
  isContentExpanded: boolean
  setIsContentExpanded: (expanded: boolean) => void
}

export const useExtensionStore = create<ExtensionState>()(
  persist(
    (set, get) => ({
      isSidebarOpen: true,
      setSidebarOpen: (isOpen: boolean) => set({ isSidebarOpen: isOpen }),
      toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),
      focusedExtensionId: null,
      setFocusedExtensionId: (id: string | null) => set({ focusedExtensionId: id }),
      sortField: "created_at",
      sortOrder: "ASC",
      setSort: (field: ExtensionSortField, order: ExtensionSortOrder) => 
        set({ sortField: field, sortOrder: order }),
      searchTerm: "",
      setSearchTerm: (term: string) => set({ searchTerm: term }),
      searchResults: [],
      setSearchResults: (results: ISearchExtensions[]) => set({ searchResults: results, selectedIndex: 0 }),
      isSearchMode: false,
      setIsSearchMode: (isSearchMode: boolean) => set({ isSearchMode }),
      selectedIndex: 0,
      setSelectedIndex: (index: number) => set({ selectedIndex: index }),
      isExtensionsExpanded: true,
      setIsExtensionsExpanded: (expanded: boolean) => set({ isExtensionsExpanded: expanded }),
      isContentExpanded: true,
      setIsContentExpanded: (expanded: boolean) => set({ isContentExpanded: expanded }),
    }),
    {
      name: "extension-state",
      partialize: (state) => ({
        sortField: state.sortField,
        sortOrder: state.sortOrder,
        focusedExtensionId: state.focusedExtensionId,
      }),
    }
  )
)

// 为了向后兼容，保留原来的名称
export const useExtensionSidebarStore = useExtensionStore
