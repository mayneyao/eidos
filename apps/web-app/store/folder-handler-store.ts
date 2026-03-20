"use client"

import { create } from "zustand"
import type {
  IExtension,
  FolderHandlerMeta,
} from "@/packages/core/types/IExtension"

interface FolderHandlerState {
  // Cache for folder handlers by folder path (using Record for better reactivity)
  handlersCache: Record<string, IExtension<FolderHandlerMeta>[]>

  // Cache for default handler IDs by folder path (using Record for better reactivity)
  defaultHandlerCache: Record<string, string | null>

  // Actions
  getHandlers: (
    folderPath: string
  ) => IExtension<FolderHandlerMeta>[] | undefined
  setHandlers: (
    folderPath: string,
    handlers: IExtension<FolderHandlerMeta>[]
  ) => void
  clearHandlersCache: (folderPath: string) => void

  getDefaultHandler: (folderPath: string) => string | null | undefined
  setDefaultHandler: (folderPath: string, handlerId: string | null) => void
  clearDefaultHandlerCache: (folderPath: string) => void
}

export const useFolderHandlerStore = create<FolderHandlerState>((set, get) => ({
  handlersCache: {},
  defaultHandlerCache: {},

  getHandlers: (folderPath: string) => {
    return get().handlersCache[folderPath]
  },

  setHandlers: (
    folderPath: string,
    handlers: IExtension<FolderHandlerMeta>[]
  ) => {
    set((state) => ({
      handlersCache: {
        ...state.handlersCache,
        [folderPath]: handlers,
      },
    }))
  },

  clearHandlersCache: (folderPath: string) => {
    set((state) => {
      const { [folderPath]: _, ...rest } = state.handlersCache
      return { handlersCache: rest }
    })
  },

  getDefaultHandler: (folderPath: string) => {
    return get().defaultHandlerCache[folderPath]
  },

  setDefaultHandler: (folderPath: string, handlerId: string | null) => {
    set((state) => ({
      defaultHandlerCache: {
        ...state.defaultHandlerCache,
        [folderPath]: handlerId,
      },
    }))
  },

  clearDefaultHandlerCache: (folderPath: string) => {
    set((state) => {
      const { [folderPath]: _, ...rest } = state.defaultHandlerCache
      return { defaultHandlerCache: rest }
    })
  },
}))
