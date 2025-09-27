import type { EidosDataEventChannelMsg } from "@/lib/const";
import { DataUpdateSignalType, EidosDataEventChannelMsgType, EidosDataEventChannelName } from "@/lib/const";
import type { KVGetType } from "@/packages/core/meta-table/kv";
import { KVTableName } from "@/packages/core/sqlite/const";
import { useCallback, useEffect, useState } from "react";
import { useSqlite } from "./use-sqlite";



// infer the data type of the default value => KVGetType
const getDataType = (defaultValue: any): KVGetType => {
    if (typeof defaultValue === 'object') {
        return 'json'
    }
    if (typeof defaultValue === 'number') {
        // how to judge if the number is an integer or a real number
        if (Number.isInteger(defaultValue)) {
            return 'integer'
        }
        return 'real'
    }
    if (typeof defaultValue === 'string') {
        return 'text'
    }
    return 'text'
}

export const useSqliteKV = <T = any>(key: string, defaultValue: T): [T | null, (newValue: T) => void] => {
    const [value, setValue] = useState<T | null>(defaultValue)
    const { sqlite } = useSqlite()

    const dataType = getDataType(defaultValue)

    useEffect(() => {
        if (!sqlite || !key) return
        sqlite.kv.get(key, dataType).then((result) => {
            setValue(result || defaultValue)
        })
    }, [sqlite, key, defaultValue, dataType])

    const _setValue = useCallback((newValue: T) => {
        setValue(newValue)
        if (sqlite) {
            sqlite.kv.put(key, newValue)
        }
    }, [sqlite, key])

    useEffect(() => {
        const bc = new BroadcastChannel(EidosDataEventChannelName)
        const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
            const { type, payload } = ev.data
            if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
                const { table, _new, _old, type: updateType } = payload
                if (table !== KVTableName) return
                // Listen for both INSERT and UPDATE events for KV table
                if (updateType !== DataUpdateSignalType.Update && updateType !== DataUpdateSignalType.Insert) return
                if (_new?.key !== key) return
                const newValue = await sqlite?.kv.get(key, dataType)
                setValue(newValue as T)
            }
        }
        bc.addEventListener("message", handler)
        return () => {
            bc.removeEventListener("message", handler)
            bc.close()
        }

    }, [sqlite, key, dataType])

    return [value, _setValue]
}