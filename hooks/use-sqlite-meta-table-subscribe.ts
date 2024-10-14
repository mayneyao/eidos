import { useEffect } from "react"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsg,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { TreeTableName } from "@/lib/sqlite/const"
import { ITreeNode } from "@/lib/store/ITreeNode"

import { useSqliteStore } from "./use-sqlite"

export const useSqliteMetaTableSubscribe = () => {
  const { addNode } = useSqliteStore()

  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)
    const handler = (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
        const { table, _new } = payload
        switch (payload.type) {
          case DataUpdateSignalType.Insert:
            if (table === TreeTableName) {
              addNode(_new as any as ITreeNode)
            }
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
  }, [addNode])
}
