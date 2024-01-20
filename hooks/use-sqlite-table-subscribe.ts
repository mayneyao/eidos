import { useCallback, useEffect } from "react"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { getTableIdByRawTableName } from "@/lib/utils"

import { useSqlite, useSqliteStore } from "./use-sqlite"

export const useSqliteTableSubscribe = (tableName: string) => {
  const { setRows, delRows } = useSqliteStore()
  const { sqlite } = useSqlite()
  const tableId = getTableIdByRawTableName(tableName)

  const recompute = useCallback(
    async (tableId: string, rowIds: string[]) => {
      if (!sqlite) return []
      const rows = await sqlite.getRecomputeRows(tableId, rowIds)
      return rows
    },
    [sqlite]
  )

  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)
    const handler = (
      ev: MessageEvent<{
        type: EidosDataEventChannelMsgType
        payload: {
          type: DataUpdateSignalType
          table: string
          _new: Record<string, any> & {
            _id: string
          }
          _old: Record<string, any> & {
            _id: string
          }
        }
      }>
    ) => {
      const { type, payload } = ev.data
      // resend msg to main thread, why broadcast channel not work???
      window.postMessage(ev.data)
      if (type === EidosDataEventChannelMsgType.DataUpdateSignalType) {
        const { table, _new, _old } = payload
        if (tableName !== table) return
        switch (payload.type) {
          case DataUpdateSignalType.Update:
            recompute(tableId, [_new._id]).then((rows) => {
              setRows(tableId, rows)
            })
            break
          case DataUpdateSignalType.Delete:
            delRows(tableId, [_old._id])
            break
          case DataUpdateSignalType.Insert:
            recompute(tableId, [_new._id]).then((rows) => {
              setRows(tableId, rows)
            })
            break
          default:
            break
        }
      }
    }
    bc.addEventListener("message", handler)
    return () => {
      bc.close()
    }
  }, [delRows, recompute, tableId, setRows, tableName])
}
