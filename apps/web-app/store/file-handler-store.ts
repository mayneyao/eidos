"use client"

import { create } from "zustand"
import type { IExtension, FileHandlerMeta } from "@/packages/core/types/IExtension"

interface FileHandlerState {
  // Cache for file handlers by extension (using Record for better reactivity)
  handlersCache: Record<string, IExtension<FileHandlerMeta>[]>
  
  // Cache for default handler IDs by extension (using Record for better reactivity)
  defaultHandlerCache: Record<string, string | null>
  
  // Actions
  getHandlers: (fileExtension: string) => IExtension<FileHandlerMeta>[] | undefined
  setHandlers: (fileExtension: string, handlers: IExtension<FileHandlerMeta>[]) => void
  clearHandlersCache: (fileExtension: string) => void
  
  getDefaultHandler: (fileExtension: string) => string | null | undefined
  setDefaultHandler: (fileExtension: string, handlerId: string | null) => void
  clearDefaultHandlerCache: (fileExtension: string) => void
}

export const useFileHandlerStore = create<FileHandlerState>((set, get) => ({
  handlersCache: {},
  defaultHandlerCache: {},
  
  getHandlers: (fileExtension: string) => {
    return get().handlersCache[fileExtension]
  },
  
  setHandlers: (fileExtension: string, handlers: IExtension<FileHandlerMeta>[]) => {
    set((state) => ({
      handlersCache: {
        ...state.handlersCache,
        [fileExtension]: handlers,
      },
    }))
  },
  
  clearHandlersCache: (fileExtension: string) => {
    set((state) => {
      const { [fileExtension]: _, ...rest } = state.handlersCache
      return { handlersCache: rest }
    })
  },
  
  getDefaultHandler: (fileExtension: string) => {
    return get().defaultHandlerCache[fileExtension]
  },
  
  setDefaultHandler: (fileExtension: string, handlerId: string | null) => {
    set((state) => ({
      defaultHandlerCache: {
        ...state.defaultHandlerCache,
        [fileExtension]: handlerId,
      },
    }))
  },
  
  clearDefaultHandlerCache: (fileExtension: string) => {
    set((state) => {
      const { [fileExtension]: _, ...rest } = state.defaultHandlerCache
      return { defaultHandlerCache: rest }
    })
  },
}))

