import { useCallback, useEffect, useMemo, useState } from "react"
import type { KVGetType } from "@/packages/core/meta-table/kv"
import { KVTableName } from "@/packages/core/sqlite/const"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
  type EidosDataEventChannelMsg,
} from "@/lib/const"
import { useKVStore } from "@/apps/web-app/store/kv-store"

import { useSqlite } from "./use-sqlite"

// infer the data type of the default value => KVGetType
const getDataType = (defaultValue: any): KVGetType => {
  if (typeof defaultValue === "boolean") {
    return "json"
  }
  if (typeof defaultValue === "object") {
    return "json"
  }
  if (typeof defaultValue === "number") {
    // how to judge if the number is an integer or a real number
    if (Number.isInteger(defaultValue)) {
      return "integer"
    }
    return "real"
  }
  if (typeof defaultValue === "string") {
    return "text"
  }
  return "text"
}

export const useSqliteKV = <T = any>(
  key: string,
  defaultValue: T
): [T | null, (newValue: T) => void] => {
  // Use selector to only subscribe to this specific key's changes
  const cachedValue = useKVStore(
    useCallback((state) => state.cache[key], [key])
  )
  const setCache = useKVStore(useCallback((state) => state.setCache, []))

  const { sqlite } = useSqlite()

  // If cache has value, use it. Otherwise default.
  const value = cachedValue !== undefined ? (cachedValue as T) : defaultValue

  const dataType = useMemo(() => getDataType(defaultValue), [defaultValue])

  useEffect(() => {
    if (!sqlite || !key) return

    // Always fetch latest from DB to ensure cache is fresh (SWR pattern)
    sqlite.kv.get(key, dataType).then((result) => {
      let newValue = result !== null ? result : defaultValue

      // Explicitly handle boolean conversion for robustness
      if (typeof defaultValue === "boolean" && result !== null) {
        if (typeof result === "string") {
          newValue = (result === "true" || result === "1") as any
        } else if (typeof result === "number") {
          newValue = (result === 1) as any
        }
      }

      setCache(key, newValue)
    })
  }, [sqlite, key, dataType, defaultValue, setCache])

  const _setValue = useCallback(
    (newValue: T) => {
      setCache(key, newValue)
      if (sqlite) {
        sqlite.kv.put(key, newValue)
      }
    },
    [sqlite, key, setCache]
  )

  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)
    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
        const { table, _new, _old, type: updateType } = payload
        if (table !== KVTableName) return
        if (
          updateType !== DataUpdateSignalType.Update &&
          updateType !== DataUpdateSignalType.Insert
        )
          return
        if (_new?.key !== key) return
        const newValue = await sqlite?.kv.get(key, dataType)
        setCache(key, newValue as T)
      }
    }
    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
      bc.close()
    }
  }, [sqlite, key, dataType, setCache])

  return [value, _setValue]
}
