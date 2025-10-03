import { create } from "zustand"
import { persist } from "zustand/middleware"

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
    }),
    {
      name: "extension-state",
    }
  )
)

// 为了向后兼容，保留原来的名称
export const useExtensionSidebarStore = useExtensionStore
