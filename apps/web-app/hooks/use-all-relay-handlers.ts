import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import type { EidosDataEventChannelMsg } from "@/lib/const"
import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { ExtensionTableName } from "@/packages/core/sqlite/const"
import type {
  IExtension,
  RelayHandlerMeta,
} from "@/packages/core/types/IExtension"
import { ScriptExtensionType } from "@/packages/core/types/IExtension"
import { useCallback, useEffect } from "react"
import { create } from "zustand"

const useAllRelayHandlersStore = create<{
  relayHandlers: IExtension<RelayHandlerMeta>[]
  loading: boolean
  setRelayHandlers: (handlers: IExtension<RelayHandlerMeta>[]) => void
  addRelayHandler: (handler: IExtension<RelayHandlerMeta>) => void
  updateRelayHandler: (handler: IExtension<RelayHandlerMeta>) => void
  removeRelayHandler: (id: string) => void
  setLoading: (loading: boolean) => void
  reload?: () => Promise<void>
  setReload: (reload: () => Promise<void>) => void
}>((set) => ({
  relayHandlers: [],
  loading: false,
  setRelayHandlers: (handlers) => set({ relayHandlers: handlers }),
  addRelayHandler: (handler) =>
    set((state) => {
      const existingIndex = state.relayHandlers.findIndex(
        (a) => a.id === handler.id
      )
      if (existingIndex !== -1) {
        return {
          relayHandlers: state.relayHandlers.map((a) =>
            a.id === handler.id ? handler : a
          ),
        }
      }
      return {
        relayHandlers: [...state.relayHandlers, handler],
      }
    }),
  updateRelayHandler: (handler) =>
    set((state) => ({
      relayHandlers: state.relayHandlers.map((a) =>
        a.id === handler.id ? handler : a
      ),
    })),
  removeRelayHandler: (id) =>
    set((state) => ({
      relayHandlers: state.relayHandlers.filter((a) => a.id !== id),
    })),
  setLoading: (loading) => set({ loading }),
  setReload: (reload) => set({ reload }),
}))

export const useSyncRelayHandlers = () => {
  const { sqlite } = useSqlite()
  const {
    setRelayHandlers,
    addRelayHandler,
    updateRelayHandler,
    removeRelayHandler,
    setLoading,
    setReload,
  } = useAllRelayHandlersStore()

  const reload = useCallback(async () => {
    if (!sqlite) return

    setLoading(true)
    try {
      const allExtensions = await sqlite.extension.list()
      const relayHandlers = allExtensions.filter(
        (ext): ext is IExtension<RelayHandlerMeta> => {
          return ext.meta?.type === ScriptExtensionType.RelayHandler
        }
      )
      setRelayHandlers(relayHandlers)
    } catch (error) {
      console.error("Failed to fetch relay handlers:", error)
      setRelayHandlers([])
    } finally {
      setLoading(false)
    }
  }, [sqlite, setRelayHandlers, setLoading])

  useEffect(() => {
    setReload(reload)
  }, [reload, setReload])

  useEffect(() => {
    reload()
  }, [reload])

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
                const meta =
                  typeof _new.meta === "string"
                    ? JSON.parse(_new.meta)
                    : _new.meta

                if (meta?.type === ScriptExtensionType.RelayHandler) {
                  const extension = {
                    ..._new,
                    meta,
                  } as unknown as IExtension<RelayHandlerMeta>

                  if (updateType === DataUpdateSignalType.Insert) {
                    addRelayHandler(extension)
                  } else {
                    updateRelayHandler(extension)
                  }
                } else {
                  if (_old) {
                    const oldMeta =
                      typeof _old.meta === "string"
                        ? JSON.parse(_old.meta)
                        : _old.meta
                    if (oldMeta?.type === ScriptExtensionType.RelayHandler) {
                      removeRelayHandler(_old.id)
                    }
                  }
                }
              }
              break

            case DataUpdateSignalType.Delete:
              if (_old?.id) {
                const meta =
                  typeof _old.meta === "string"
                    ? JSON.parse(_old.meta)
                    : _old.meta

                if (meta?.type === ScriptExtensionType.RelayHandler) {
                  removeRelayHandler(_old.id)
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
  }, [addRelayHandler, updateRelayHandler, removeRelayHandler])
}

export const useAllRelayHandlers = () => {
  const relayHandlers = useAllRelayHandlersStore((state) => state.relayHandlers)
  const loading = useAllRelayHandlersStore((state) => state.loading)
  const reload = useAllRelayHandlersStore((state) => state.reload)

  return {
    relayHandlers,
    loading,
    reload,
  }
}
