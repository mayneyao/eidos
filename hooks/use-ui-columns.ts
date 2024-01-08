import { useCallback, useEffect, useMemo } from "react"


import { IField } from "../lib/store/interface"
import { useCurrentPathInfo } from "./use-current-pathinfo"
import { useSqlite, useSqliteStore } from "./use-sqlite"
import { useTableFields } from "./use-table"

export const useCurrentUiColumns = () => {
  const { space, tableName } = useCurrentPathInfo()
  return useUiColumns(tableName!, space!)
}

export const useUiColumns = (tableName: string, databaseName: string) => {
  const { sqlite } = useSqlite(databaseName)
  const { setFields: setUiColumns } = useSqliteStore()
  const { fieldMap: uiColumnsMap, fields: uiColumns } = useTableFields(
    tableName,
    databaseName
  )
  const updateUiColumns = useCallback(async () => {
    if (!sqlite) return
    const res = await sqlite.listUiColumns(tableName!)
    setUiColumns(tableName, res)
  }, [setUiColumns, sqlite, tableName])

  useEffect(() => {
    updateUiColumns()
  }, [updateUiColumns, tableName])

  const uiColumnMap = useMemo(() => {
    const map = new Map<string, IField>()
    uiColumns.forEach((column) => {
      map.set(column.name, column)
    })
    return map
  }, [uiColumns])

  const nameRawIdMap = useMemo(() => {
    const map = new Map<string, string>()
    uiColumns.forEach((column) => {
      map.set(column.name, column.table_column_name)
    })
    return map
  }, [uiColumns])

  const rawIdNameMap = useMemo(() => {
    const map = new Map<string, string>()
    uiColumns.forEach((column) => {
      map.set(column.table_column_name, column.name)
    })
    return map
  }, [uiColumns])

  const getFieldByIndex = useCallback(
    (index: number) => {
      return uiColumns[index]
    },
    [uiColumns]
  )

  return {
    uiColumns,
    uiColumnMap,
    updateUiColumns,
    getFieldByIndex,
    nameRawIdMap,
    rawIdNameMap,
  }
}
