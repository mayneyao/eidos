/**
 * state store for runtime, for cross component communication
 */

import { IFile } from "@/worker/web-worker/meta_table/file"
import { create } from "zustand"

interface AppRuntimeState {
  isCmdkOpen: boolean
  setCmdkOpen: (isCmdkOpen: boolean) => void

  isShareMode: boolean
  setShareMode: (isShareMode: boolean) => void

  currentPreviewFile: IFile | null
  setCurrentPreviewFile: (currentPreviewFile: IFile) => void

  isWebsocketConnected: boolean
  setWebsocketConnected: (isWebsocketConnected: boolean) => void

  disableDocAIComplete: boolean
  setDisableDocAIComplete: (disableDocAIComplete: boolean) => void

  isCompleteLoading: boolean
  setCompleteLoading: (isCompleteLoading: boolean) => void

  scriptContainerRef: React.RefObject<any> | null
  setScriptContainerRef: (scriptContainerRef: React.RefObject<any>) => void

  blockUIMsg: string | null
  setBlockUIMsg: (blockUIMsg: string) => void
}

export const useAppRuntimeStore = create<AppRuntimeState>()((set) => ({
  blockUIMsg: null,
  setBlockUIMsg: (blockUIMsg) => set({ blockUIMsg }),

  isCmdkOpen: false,
  setCmdkOpen: (isCmdkOpen) => set({ isCmdkOpen }),

  isShareMode: false,
  setShareMode: (isShareMode) => set({ isShareMode }),

  currentPreviewFile: null,
  setCurrentPreviewFile: (currentPreviewFile) =>
    set({ currentPreviewFile: currentPreviewFile }),

  isWebsocketConnected: false,
  setWebsocketConnected: (isWebsocketConnected) =>
    set({ isWebsocketConnected }),

  disableDocAIComplete: false,
  setDisableDocAIComplete: (disableDocAIComplete) =>
    set({ disableDocAIComplete }),

  isCompleteLoading: false,
  setCompleteLoading: (isCompleteLoading) => set({ isCompleteLoading }),

  scriptContainerRef: null,
  setScriptContainerRef: (scriptContainerRef) =>
    set({ scriptContainerRef: scriptContainerRef }),
}))
