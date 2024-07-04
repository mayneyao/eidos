import { useEffect } from "react"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsg,
  EidosDataEventChannelMsgType,
} from "@/lib/const"

interface UseTableDataEventProps {
  tableName: string
  onInsert?: (row: EidosDataEventChannelMsg["payload"]["_new"]) => void
  onUpdate?: (row: EidosDataEventChannelMsg["payload"]["_new"]) => void
  onDelete?: (row: EidosDataEventChannelMsg["payload"]["_old"]) => void
}

export const useTableRowEvent = ({
  tableName,
  onInsert,
  onUpdate,
  onDelete,
}: UseTableDataEventProps) => {
  useEffect(() => {
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
            if (onUpdate) onUpdate(_new)
            break
          case DataUpdateSignalType.Delete:
            if (onDelete) onDelete(_old)
            break
          default:
            break
        }
      }
    }
    window.addEventListener("message", handler)
    return () => {
      window.removeEventListener("message", handler)
    }
  }, [onDelete, onInsert, onUpdate, tableName])
}
