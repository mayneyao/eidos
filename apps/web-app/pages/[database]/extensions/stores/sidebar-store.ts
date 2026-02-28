import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ExtensionSortField = "slug" | "created_at" | "updated_at"
export type ExtensionSortOrder = "ASC" | "DESC"

interface ExtensionSidebarState {
  isSidebarOpen: boolean
  setSidebarOpen: (isOpen: boolean) => void
  toggleSidebar: () => void
  focusedExtensionId: string | null
  setFocusedExtensionId: (id: string | null) => void
  sortField: ExtensionSortField
  sortOrder: ExtensionSortOrder
  setSort: (field: ExtensionSortField, order: ExtensionSortOrder) => void
}

export const useExtensionSidebarStore = create<ExtensionSidebarState>()(
  persist(
    (set, get) => ({
      isSidebarOpen: true,
      setSidebarOpen: (isOpen: boolean) => set({ isSidebarOpen: isOpen }),
      toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),
      focusedExtensionId: null,
      setFocusedExtensionId: (id: string | null) =>
        set({ focusedExtensionId: id }),
      sortField: "created_at",
      sortOrder: "ASC",
      setSort: (field: ExtensionSortField, order: ExtensionSortOrder) =>
        set({ sortField: field, sortOrder: order }),
    }),
    {
      name: "extension-sidebar-state",
    }
  )
)
