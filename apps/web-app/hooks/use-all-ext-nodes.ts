import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import type { EidosDataEventChannelMsg } from "@/lib/const"
import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { ExtensionTableName } from "@/packages/core/sqlite/const"
import type { IExtension, ExtNodeMeta } from "@/packages/core/types/IExtension"
import { useCallback, useEffect } from "react"
import { create } from "zustand"

const useExtNodeStore = create<{
  extNodes: IExtension<ExtNodeMeta>[]
  loading: boolean
  setExtNodes: (nodes: IExtension<ExtNodeMeta>[]) => void
  setLoading: (loading: boolean) => void
}>((set) => ({
  extNodes: [],
  loading: false,
  setExtNodes: (nodes) => set({ extNodes: nodes }),
  setLoading: (loading) => set({ loading }),
}))

export const useSyncExtNodes = () => {
  const { sqlite } = useSqlite()
  const { setExtNodes, setLoading } = useExtNodeStore()

  const reload = useCallback(async () => {
    setLoading(true)
    if (!sqlite) return
    const nodes = await sqlite.extension.getExtNodeExtensions("enabled")
    setExtNodes(nodes as IExtension<ExtNodeMeta>[])
    setLoading(false)
  }, [sqlite, setExtNodes, setLoading])

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

        // Check if it's a block extension with extNode meta
        const _oldMeta = _old?.meta ? JSON.parse(_old.meta) : null
        const _newMeta = _new?.meta ? JSON.parse(_new.meta) : null
        const isExtNodeExtension =
          (_old?.type === "block" && _oldMeta?.type === "extNode") ||
          (_new?.type === "block" && _newMeta?.type === "extNode")
        if (!isExtNodeExtension) return

        switch (updateType) {
          case DataUpdateSignalType.Insert:
            reload()
            break

          case DataUpdateSignalType.Update:
            reload()
            break

          case DataUpdateSignalType.Delete:
            reload()
            break
          default:
            break
        }
      }
    }

    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
      bc.close()
    }
  }, [reload])
}

export const useAllExtNodes = () => {
  const { sqlite } = useSqlite()
  const { extNodes, loading, setExtNodes, setLoading } = useExtNodeStore()

  const reload = useCallback(async () => {
    setLoading(true)
    if (!sqlite) return
    const nodes = await sqlite.extension.getExtNodeExtensions("enabled")
    setExtNodes(nodes as IExtension<ExtNodeMeta>[])
    setLoading(false)
  }, [sqlite, setExtNodes, setLoading])

  return {
    extNodes,
    reload,
    loading,
  }
}
