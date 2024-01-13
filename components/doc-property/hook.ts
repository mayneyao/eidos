import { useCallback, useEffect, useState } from "react"

import { extractIdFromShortId } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"

export const useDocProperty = (data: { tableId: string; docId: string }) => {
  const { tableId, docId } = data
  const { sqlite } = useSqlite()
  const [docProperty, setDocProperty] = useState<Record<string, any>>({})

  const getProperty = useCallback(async () => {
    if (!sqlite) return
    const rowId = extractIdFromShortId(docId)
    const res = await sqlite.getRow(tableId, rowId)
    setDocProperty(res)
  }, [docId, sqlite, tableId])

  useEffect(() => {
    getProperty()
  }, [getProperty])

  const { _id, title, ...restData } = docProperty
  return {
    properties: restData,
  }
}
