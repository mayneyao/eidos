import { create } from "zustand"
import { persist } from "zustand/middleware"

interface ExtensionSidebarState {
  isSidebarOpen: boolean
  setSidebarOpen: (isOpen: boolean) => void
  toggleSidebar: () => void
  focusedExtensionId: string | null
  setFocusedExtensionId: (id: string | null) => void
}

export const useExtensionSidebarStore = create<ExtensionSidebarState>()(
  persist(
    (set, get) => ({
      isSidebarOpen: true,
      setSidebarOpen: (isOpen: boolean) => set({ isSidebarOpen: isOpen }),
      toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),
      focusedExtensionId: null,
      setFocusedExtensionId: (id: string | null) => set({ focusedExtensionId: id }),
    }),
    {
      name: "extension-sidebar-state",
    }
  )
)