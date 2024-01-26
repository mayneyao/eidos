import { useCallback, useEffect, useMemo } from "react"

import { IView } from "@/lib/store/IView"
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
  const { fields: uiColumns } = useTableFields(tableName, databaseName)
  const tableId = getTableIdByRawTableName(tableName || "")

  const updateUiColumns = useCallback(async () => {
    if (!sqlite || !tableName) return
    const res = await sqlite.listUiColumns(tableName)
    setUiColumns(tableId, res)
  }, [setUiColumns, sqlite, tableId, tableName])

  useEffect(() => {
    // updateUiColumns()
    if (uiColumns.length === 0) {
      updateUiColumns()
    }
  }, [updateUiColumns, tableName, uiColumns.length])

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
