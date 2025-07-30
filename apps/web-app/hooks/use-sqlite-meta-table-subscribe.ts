import { useEffect } from "react";

import type {
  EidosDataEventChannelMsg
} from "@/lib/const";
import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const";
import { ExtensionTableName, TreeTableName } from "@/packages/core/sqlite/const";
import type { ITreeNode } from "@/packages/core/types/ITreeNode";

import { useEngine } from "./use-engine";
import { useSqliteStore } from "./use-sqlite";

export const useSqliteMetaTableSubscribe = () => {
  const { addNode, setNode } = useSqliteStore()

  const { reload } = useEngine()
  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)
    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
        const { table, _new, _old } = payload
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
          default:
            break
        }
        if (table === ExtensionTableName) {
          if (_new.type !== 'script') {
            return
          }
          if (JSON.parse(_new.meta).type !== 'udf') {
            return
          }
          const diff = Object.keys(_new).filter((key) => {
            return _new[key] !== _old[key]
          })
          if (diff.includes('enabled') || diff.includes('code')) {
            reload()
          }
        }
      }
    }
    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
    }
  }, [addNode])
}
