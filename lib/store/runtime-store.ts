/**
 * state store for runtime, for cross component communication
 */

import { create } from "zustand"

interface AppRuntimeState {
  isCmdkOpen: boolean
  setCmdkOpen: (isCmdkOpen: boolean) => void

  isShareMode: boolean
  setShareMode: (isShareMode: boolean) => void

  isSidebarOpen: boolean
  setSidebarOpen: (isSidebarOpen: boolean) => void
}

// need persist, store user config in localstorage
export const useAppRuntimeStore = create<AppRuntimeState>()((set) => ({
  isCmdkOpen: false,
  setCmdkOpen: (isCmdkOpen) => set({ isCmdkOpen }),

  isShareMode: false,
  setShareMode: (isShareMode) => set({ isShareMode }),

  isSidebarOpen: false,
  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
}))
