import { useCallback, useMemo } from "react"

import { getTableIdByRawTableName } from "@/lib/utils"

import { IField } from "../lib/store/interface"
import { useCurrentPathInfo } from "./use-current-pathinfo"
import { useSqlite, useSqliteStore } from "./use-sqlite"
import { useTableFields } from "./use-table"

export const useCurrentUiColumns = () => {
  const { space, tableName } = useCurrentPathInfo()
  return useUiColumns(tableName!, space!)
}

export const useUiColumns = (
  tableName: string | undefined,
  _databaseName?: string
) => {
  const { space } = useCurrentPathInfo()
  const databaseName = _databaseName || space
  const { sqlite } = useSqlite(databaseName)
  const { setFields: setUiColumns } = useSqliteStore()
  const { fields: uiColumns } = useTableFields(tableName)

  const updateUiColumns = useCallback(
    async (_tableName = tableName) => {
      if (!sqlite || !_tableName) return
      const res = await sqlite.listUiColumns(_tableName)
      // order by created_at
      res.sort((a, b) => {
        return (a.created_at || 0) > (b.created_at || 0) ? 1 : -1
      })
      setUiColumns(getTableIdByRawTableName(_tableName || ""), res)
    },
    [setUiColumns, sqlite, tableName]
  )

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

  const fieldRawColumnNameFieldMap = useMemo(() => {
    return uiColumns.reduce((acc, cur) => {
      acc[cur.table_column_name] = cur
      return acc
    }, {} as Record<string, IField>)
  }, [uiColumns])

  return {
    uiColumns,
    uiColumnMap,
    updateUiColumns,
    nameRawIdMap,
    rawIdNameMap,
    fieldRawColumnNameFieldMap,
  }
}
