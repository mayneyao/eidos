import { useEffect } from "react"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { getTableIdByRawTableName } from "@/lib/utils"

import { useSqliteStore } from "./use-sqlite"

export const useSqliteTableSubscribe = (tableName: string) => {
  const { setRows, delRows } = useSqliteStore()
  const tableId = getTableIdByRawTableName(tableName)
  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)
    const handler = (ev: MessageEvent) => {
      const { type, payload } = ev.data
      // resend msg to main thread, why broadcast channel not work???
      window.postMessage(ev.data)
      if (type === EidosDataEventChannelMsgType.DataUpdateSignalType) {
        const { table, _new, _old } = payload
        if (tableName !== table) return
        switch (payload.type) {
          case DataUpdateSignalType.Update:
            setRows(tableId, [_new])
            break
          case DataUpdateSignalType.Delete:
            delRows(tableId, [_old.id])
            break
          case DataUpdateSignalType.Insert:
            setRows(tableId, [_new])
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
  }, [delRows, setRows, tableId, tableName])
}
