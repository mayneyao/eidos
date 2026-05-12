import { useEffect } from "react"

import type { EidosDataEventChannelMsg } from "@/lib/const"
import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import {
  ExtensionTableName,
  TreeTableName,
  ViewTableName,
} from "@/packages/core/sqlite/const"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"

import { useNodeStore } from "@/apps/web-app/store/node-store"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { useEngine } from "./use-engine"
import { useSqlite } from "./use-sqlite"

export const useSqliteMetaTableSubscribe = () => {
  const { addNode, setNode, delNode } = useNodeStore()
  const { setViews } = useSqliteStore()
  const sqlite = useSqlite().sqlite
  const { reload } = useEngine()

  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)
    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
        const { table, _new, _old } = payload

        // Handle view table events — reload views for the affected table
        if (table === ViewTableName) {
          if (!sqlite) return
          const data = _new || _old
          const tableId = data?.table_id
          if (!tableId) return
          const views = await sqlite.view.list(
            { table_id: tableId },
            { orderBy: "position", order: "ASC" }
          )
          setViews(tableId, views)
          return
        }

        switch (payload.type) {
          case DataUpdateSignalType.Insert:
            if (table === TreeTableName) {
              addNode(_new as any as ITreeNode)
            }
            break
          case DataUpdateSignalType.Update:
            if (table === TreeTableName) {
              setNode(_new as any as ITreeNode)
            }
            break
          case DataUpdateSignalType.Delete:
            if (table === TreeTableName) {
              delNode(_old.id)
            }
            break
          default:
            break
        }
        if (table === ExtensionTableName) {
          if (_new.type !== "script") {
            return
          }
          if (JSON.parse(_new.meta).type !== "udf") {
            return
          }
          const diff = Object.keys(_new).filter((key) => {
            return _new[key] !== _old[key]
          })
          if (diff.includes("enabled") || diff.includes("code")) {
            reload()
          }
        }
      }
    }
    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
    }
  }, [addNode, sqlite, setViews])
}
