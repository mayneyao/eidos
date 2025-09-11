import { useCallback, useEffect, useMemo, useState } from "react";

import { useSqlite } from "@/apps/web-app/hooks/use-sqlite";
import type { EidosDataEventChannelMsg } from "@/lib/const";
import { DataUpdateSignalType, EidosDataEventChannelMsgType, EidosDataEventChannelName } from "@/lib/const";
import { ColumnTableName, DocTableName } from "@/packages/core/sqlite/const";
import { useDocPropertyTypes } from "./property-type-hook";
import { SYSTEM_PROPERTY_NAMES } from "./utils";

/**
 * State-managed hook for document properties
 * Provides loading states and automatic state updates for UI components
 * @param data.docId - The document ID to manage properties for
 */
export const useDocProperty = (data: { docId: string }) => {
  const { docId } = data
  const { sqlite } = useSqlite()
  const [docProperty, setDocProperty] = useState<Record<string, any> | null>(
    null
  )
  const { propertyTypeMap } = useDocPropertyTypes()


  const displayProperties = useMemo(() => {
    // filter out properties that are not in the propertyTypeMap
    const validPropertyKeys = new Set([...SYSTEM_PROPERTY_NAMES, ...Object.keys(propertyTypeMap)])
    const filteredProperties = JSON.parse(docProperty?.meta || '{}')?.displayProperties || [] as string[]
    return filteredProperties.filter((property: string) => validPropertyKeys.has(property))
  }, [docProperty?.meta, propertyTypeMap])

  const getAllProperties = useCallback(
    async (docId: string) => {
      if (!sqlite) return
      const res = await sqlite.doc.getAllProperties(docId)
      return res
    },
    [sqlite]
  )

  const setProperty = useCallback(
    async (data: Record<string, any>) => {
      if (!sqlite) return
      return await sqlite.doc.setProperties(docId, data)
    },
    [sqlite, docId]
  )

  const addDisplayProperty = useCallback(
    async (docId: string, propertyName: string) => {
      if (!sqlite) return { success: false }
      const res = await sqlite.doc.addDisplayProperty(docId, propertyName)
      return res
    },
    [sqlite]
  )

  const removeDisplayProperty = useCallback(
    async (docId: string, propertyName: string) => {
      if (!sqlite) return { success: false }
      const res = await sqlite.doc.removeDisplayProperty(docId, propertyName)
      return res
    },
    [sqlite]
  )

  const setDisplayProperties = useCallback(
    async (docId: string, propertyNames: string[]) => {
      if (!sqlite) return { success: false }
      const res = await sqlite.doc.setDisplayProperties(docId, propertyNames)
      return res
    },
    [sqlite]
  )

  const _getAllProperties = useCallback(async () => {
    if (!sqlite) return
    const res = await getAllProperties(docId)
    res && setDocProperty(res)
  }, [docId, getAllProperties, sqlite])


  useEffect(() => {
    _getAllProperties()
  }, [_getAllProperties])

  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)

    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
        const { table, _new, _old, type: updateType } = payload
        const id = _new?.id || _old?.id
        if (id !== docId) return
        if (table !== DocTableName) return
        // find diff between _new and _old
        const diff = Object.keys(_new).filter((key) => {
          return _new[key] !== _old[key]
        })
        if (diff.length === 0) return
        switch (updateType) {
          case DataUpdateSignalType.Update:
            console.log('update', diff, _new)
            setDocProperty(_new)
            break
          default:
            break
        }
      }
      if (type === EidosDataEventChannelMsgType.SchemaUpdateSignalType) {
        const { table, type: updateType } = payload;
        if (table !== DocTableName) return;
        switch (updateType) {
          case DataUpdateSignalType.DeleteColumn:
          case DataUpdateSignalType.AddColumn:
            // Refresh when some properties are deleted
            _getAllProperties();
            break;
          default:
            break;
        }
      }
    }

    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
      bc.close()
    }
  }, [docId])


  return {
    properties: docProperty,
    setProperty: setProperty,
    addDisplayProperty: addDisplayProperty,
    removeDisplayProperty: removeDisplayProperty,
    setDisplayProperties: setDisplayProperties,
    displayProperties: displayProperties,
  }
}
