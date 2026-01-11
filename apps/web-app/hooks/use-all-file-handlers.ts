import { useCallback, useEffect, useMemo } from "react"
import { ExtensionTableName } from "@/packages/core/sqlite/const"
import {
  BlockExtensionType,
  type FileHandlerMeta,
  type IExtension,
} from "@/packages/core/types/IExtension"
import { create } from "zustand"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
  type EidosDataEventChannelMsg,
} from "@/lib/const"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { getBuiltInFileHandlers } from "@/extensions/builtin"

const useAllFileHandlersStore = create<{
  fileHandlers: IExtension<FileHandlerMeta>[]
  loading: boolean
  setFileHandlers: (handlers: IExtension<FileHandlerMeta>[]) => void
  addFileHandler: (handler: IExtension<FileHandlerMeta>) => void
  updateFileHandler: (handler: IExtension<FileHandlerMeta>) => void
  removeFileHandler: (id: string) => void
  setLoading: (loading: boolean) => void
  reload?: () => Promise<void>
  setReload: (reload: () => Promise<void>) => void
}>((set) => ({
  fileHandlers: [],
  loading: false,
  setFileHandlers: (handlers) => set({ fileHandlers: handlers }),
  addFileHandler: (handler) =>
    set((state) => {
      const existingIndex = state.fileHandlers.findIndex(
        (h) => h.id === handler.id
      )
      if (existingIndex !== -1) {
        return {
          fileHandlers: state.fileHandlers.map((h) =>
            h.id === handler.id ? handler : h
          ),
        }
      }
      return {
        fileHandlers: [...state.fileHandlers, handler],
      }
    }),
  updateFileHandler: (handler) =>
    set((state) => ({
      fileHandlers: state.fileHandlers.map((h) =>
        h.id === handler.id ? handler : h
      ),
    })),
  removeFileHandler: (id) =>
    set((state) => ({
      fileHandlers: state.fileHandlers.filter((h) => h.id !== id),
    })),
  setLoading: (loading) => set({ loading }),
  setReload: (reload) => set({ reload }),
}))

/**
 * Hook to sync file handler extensions from database changes
 * Listens to extension table changes and updates the store
 */
export const useSyncFileHandlers = () => {
  const { sqlite } = useSqlite()
  const {
    setFileHandlers,
    addFileHandler,
    updateFileHandler,
    removeFileHandler,
    setLoading,
    setReload,
  } = useAllFileHandlersStore()

  const reload = useCallback(async () => {
    if (!sqlite) return

    setLoading(true)
    try {
      const allExtensions = await sqlite.extension.list()
      const fileHandlers = allExtensions.filter(
        (ext): ext is IExtension<FileHandlerMeta> => {
          return ext.meta?.type === BlockExtensionType.FileHandler
        }
      )
      setFileHandlers(fileHandlers)
    } catch (error) {
      console.error("Failed to fetch file handlers:", error)
      setFileHandlers([])
    } finally {
      setLoading(false)
    }
  }, [sqlite, setFileHandlers, setLoading])

  // Register reload function in store
  useEffect(() => {
    setReload(reload)
  }, [reload, setReload])

  // Initial load
  useEffect(() => {
    reload()
  }, [reload])

  // Listen to extension table changes
  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)

    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
        const { table, _new, _old, type: updateType } = payload
        if (table !== ExtensionTableName) return

        try {
          switch (updateType) {
            case DataUpdateSignalType.Insert:
            case DataUpdateSignalType.Update:
              if (_new) {
                // Parse meta if it's a string
                const meta =
                  typeof _new.meta === "string"
                    ? JSON.parse(_new.meta)
                    : _new.meta

                if (meta?.type === BlockExtensionType.FileHandler) {
                  const extension = {
                    ..._new,
                    meta,
                  } as unknown as IExtension<FileHandlerMeta>

                  if (updateType === DataUpdateSignalType.Insert) {
                    addFileHandler(extension)
                  } else {
                    updateFileHandler(extension)
                  }
                } else {
                  // If it was a file handler before but now isn't, remove it
                  if (_old) {
                    const oldMeta =
                      typeof _old.meta === "string"
                        ? JSON.parse(_old.meta)
                        : _old.meta
                    if (oldMeta?.type === BlockExtensionType.FileHandler) {
                      removeFileHandler(_old.id)
                    }
                  }
                }
              }
              break

            case DataUpdateSignalType.Delete:
              if (_old?.id) {
                // Parse meta if it's a string
                const meta =
                  typeof _old.meta === "string"
                    ? JSON.parse(_old.meta)
                    : _old.meta

                if (meta?.type === BlockExtensionType.FileHandler) {
                  removeFileHandler(_old.id)
                }
              }
              break
            default:
              break
          }
        } catch (error) {
          console.warn("Failed to parse extension meta:", error)
        }
      }
    }

    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
      bc.close()
    }
  }, [addFileHandler, updateFileHandler, removeFileHandler])
}

/**
 * Hook to get all file handler extensions
 * Automatically syncs with database changes and includes built-in file handlers
 */
export const useAllFileHandlers = () => {
  const dbFileHandlers = useAllFileHandlersStore((state) => state.fileHandlers)
  const loading = useAllFileHandlersStore((state) => state.loading)
  const reload = useAllFileHandlersStore((state) => state.reload)

  // Merge database file handlers with built-in file handlers
  const fileHandlers = useMemo(() => {
    const builtInHandlers = getBuiltInFileHandlers()

    // Convert built-in extensions to IExtension<FileHandlerMeta> format
    const builtInAsExtensions: IExtension<FileHandlerMeta>[] =
      builtInHandlers.map(
        (builtIn) =>
          ({
            id: builtIn.id,
            slug: builtIn.slug,
            name: builtIn.name,
            type: "block" as const,
            description: (builtIn.meta as any)?.fileHandler?.description || "",
            version: "1.0.0",
            code: "", // Built-in don't need code
            meta: builtIn.meta as FileHandlerMeta,
            enabled: true,
            // Mark as built-in for special handling
            _builtIn: true,
            _builtInComponent: builtIn.component,
          }) as IExtension<FileHandlerMeta> & {
            _builtIn?: boolean
            _builtInComponent?: any
          }
      )

    // Built-in handlers first, then database handlers
    return [...builtInAsExtensions, ...dbFileHandlers]
  }, [dbFileHandlers])

  return {
    fileHandlers,
    loading,
    reload,
  }
}
