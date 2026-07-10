import { useEffect, useState } from "react"

import { useSqlite } from "./use-sqlite"
import type { IExtension } from "@/packages/core/meta-table/extension"
import type { EidosDataEventChannelMsg } from "@/lib/const"
import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { ExtensionTableName } from "@/packages/core/sqlite/const"

export const useMblocksBatch = (ids: string[], enabled = true) => {
  const [blocks, setBlocks] = useState<Record<string, IExtension | null>>({})
  const [loading, setLoading] = useState(false)
  const { sqlite } = useSqlite()

  useEffect(() => {
    if (!enabled || !sqlite || ids.length === 0) {
      setBlocks({})
      return
    }

    const fetchBlocks = async () => {
      setLoading(true)
      try {
        const newIds = ids.filter((id) => !(id in blocks))

        if (newIds.length === 0) {
          setLoading(false)
          return
        }

        const batchResults = await sqlite.extension.findMany({
          where: {
            id: {
              in: newIds,
            },
          },
        })

        setBlocks((prev) => {
          const newBlocks = { ...prev }
          batchResults.forEach((block) => {
            newBlocks[block.id] = block as unknown as IExtension
          })
          return newBlocks
        })
      } catch (error) {
        console.error("Failed to fetch blocks:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchBlocks()
  }, [enabled, sqlite, ids.join(",")])

  useEffect(() => {
    if (!enabled) return
    const bc = new BroadcastChannel(EidosDataEventChannelName)

    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
        const { table, _new, _old, type: updateType } = payload
        if (table !== ExtensionTableName) return
        if (_new?.type !== "block") return
        try {
          switch (updateType) {
            case DataUpdateSignalType.Update:
              setBlocks((prev) => {
                const newBlocks = { ...prev }
                newBlocks[_new.id] = _new as unknown as IExtension
                return newBlocks
              })
              break
          }
        } catch (error) {
          console.error("Failed to update blocks:", error)
        } finally {
          setLoading(false)
        }
      }
    }

    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
      bc.close()
    }
  }, [enabled])

  useEffect(() => {
    setBlocks((prev) => {
      const newBlocks: Record<string, IExtension | null> = {}
      ids.forEach((id) => {
        if (id in prev) {
          newBlocks[id] = prev[id]
        }
      })
      return newBlocks
    })
  }, [enabled, ids.join(",")])

  return { blocks, loading }
}
