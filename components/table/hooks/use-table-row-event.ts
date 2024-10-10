import { useEffect } from "react"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsg,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"

type Row = EidosDataEventChannelMsg["payload"]["_new"]

interface UseTableDataEventProps {
  tableName: string
  onInsert?: (row: Row) => void
  onUpdate?: (_new: Row, _old: Row) => void
  onDelete?: (row: Row) => void
}

export const useTableRowEvent = ({
  tableName,
  onInsert,
  onUpdate,
  onDelete,
}: UseTableDataEventProps) => {
  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)
    const handler = (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.DataUpdateSignalType) {
        const { table, _new, _old } = payload
        if (tableName !== table) return
        switch (payload.type) {
          case DataUpdateSignalType.Insert:
            if (onInsert) onInsert(_new)
            break
          case DataUpdateSignalType.Update:
            if (onUpdate) onUpdate(_new, _old)
            break
          case DataUpdateSignalType.Delete:
            if (onDelete) onDelete(_old)
            break
          default:
            break
        }
      }
    }
    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
    }
  }, [onDelete, onInsert, onUpdate, tableName])
}
