import { useCallback, useEffect, useState } from "react"

import { extractIdFromShortId } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"

export const useRowDataOperation = () => {
  const { sqlite } = useSqlite()
  const getProperty = useCallback(
    async (tableId: string, rowId: string) => {
      if (!sqlite) return
      const res = await sqlite.getRow(tableId, rowId)
      return res
    },
    [sqlite]
  )
  const setProperty = useCallback(
    async (tableId: string, rowId: string, data: Record<string, any>) => {
      if (!sqlite) return
      await sqlite.setRow(tableId, rowId, data)
    },
    [sqlite]
  )

  return {
    getProperty,
    setProperty,
  }
}

export const useDocProperty = (data: { tableId: string; docId: string }) => {
  const { tableId, docId } = data
  const { sqlite } = useSqlite()
  const [docProperty, setDocProperty] = useState<Record<string, any>>({})

  const { getProperty, setProperty } = useRowDataOperation()

  const _getProperty = useCallback(async () => {
    if (!sqlite) return
    const rowId = extractIdFromShortId(docId)
    const res = await getProperty(tableId, rowId)
    setDocProperty(res)
  }, [docId, getProperty, sqlite, tableId])

  const _setProperty = useCallback(
    async (data: Record<string, any>) => {
      if (!sqlite) return
      const rowId = extractIdFromShortId(docId)
      await setProperty(tableId, rowId, data)
      await _getProperty()
    },
    [sqlite, docId, setProperty, tableId, _getProperty]
  )

  useEffect(() => {
    _getProperty()
  }, [_getProperty])

  const { _id, title, ...restData } = docProperty
  return {
    properties: restData,
    setProperty: _setProperty,
  }
}
