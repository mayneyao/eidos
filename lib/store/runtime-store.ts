/**
 * state store for runtime, for cross component communication
 */

import { create } from "zustand"

interface AppRuntimeState {
  isCmdkOpen: boolean
  setCmdkOpen: (isCmdkOpen: boolean) => void

  isShareMode: boolean
  setShareMode: (isShareMode: boolean) => void

  currentPreviewFileUrl: string
  setCurrentPreviewFileUrl: (currentPreviewFileUrl: string) => void

  isWebsocketConnected: boolean
  setWebsocketConnected: (isWebsocketConnected: boolean) => void
}

export const useAppRuntimeStore = create<AppRuntimeState>()((set) => ({
  isCmdkOpen: false,
  setCmdkOpen: (isCmdkOpen) => set({ isCmdkOpen }),

  isShareMode: false,
  setShareMode: (isShareMode) => set({ isShareMode }),

  currentPreviewFileUrl: "",
  setCurrentPreviewFileUrl: (currentPreviewFileUrl) =>
    set({ currentPreviewFileUrl }),

  isWebsocketConnected: false,
  setWebsocketConnected: (isWebsocketConnected) =>
    set({ isWebsocketConnected }),
}))
