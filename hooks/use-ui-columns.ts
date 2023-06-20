import { useCallback, useEffect, useMemo } from "react"

import { useSqlite } from "./use-sqlite"
import { IUIColumn, useTableStore } from "./use-table"

export const useUiColumns = (tableName: string, databaseName: string) => {
  const { sqlite } = useSqlite(databaseName)
  const { uiColumns, setUiColumns } = useTableStore()
  const updateUiColumns = useCallback(async () => {
    if (!sqlite) return
    const res = await sqlite.listUiColumns(tableName)
    setUiColumns(res)
  }, [setUiColumns, sqlite, tableName])

  useEffect(() => {
    updateUiColumns()
  }, [updateUiColumns])

  const uiColumnMap = useMemo(() => {
    const map = new Map<string, IUIColumn>()
    uiColumns.forEach((column) => {
      map.set(column.name, column)
    })
    return map
  }, [uiColumns])

  return { uiColumns, uiColumnMap, updateUiColumns }
}
