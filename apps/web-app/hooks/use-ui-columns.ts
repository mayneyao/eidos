import { useCallback, useContext, useEffect, useMemo } from "react"

import { getTableIdByRawTableName } from "@/lib/utils"

import type { IField } from "@/packages/core/types/IField"
import { useCurrentPathInfo } from "./use-current-pathinfo"
import { useSqlite } from "./use-sqlite"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { useTableFields } from "./use-table"
import { TableContext } from "@/components/table/hooks"
import { tableRequestManager } from "./table-request-manager"

export const useCurrentUiColumns = () => {
  const { tableName, space } = useContext(TableContext)
  return useUiColumns(tableName, space)
}

export const useUiColumns = (
  tableName: string | undefined,
  _databaseName?: string
) => {
  const { space } = useCurrentPathInfo()
  const databaseName = _databaseName || space
  const { sqlite } = useSqlite(databaseName)
  const { setFields: setUiColumns, dataStore } = useSqliteStore()
  const { fields: uiColumns } = useTableFields(tableName)

  const updateUiColumns = useCallback(
    async (_tableName = tableName) => {
      if (!sqlite || !_tableName) return
      const res = await sqlite.listUiColumns(_tableName)
      // order by created_at
      if (!tableName?.startsWith("vw_")) {
        res.sort((a, b) => {
          return (a.created_at || 0) > (b.created_at || 0) ? 1 : -1
        })
      }
      setUiColumns(getTableIdByRawTableName(_tableName || ""), res)
    },
    [setUiColumns, sqlite, tableName]
  )

  const fieldMap = useMemo(() => {
    return dataStore.tableMap[getTableIdByRawTableName(tableName || "")]
      ?.fieldMap
  }, [dataStore.tableMap, tableName])

  const checkAndFetchTable = useCallback(
    async (_tableName = tableName) => {
      if (!sqlite || !_tableName) return

      const tableId = getTableIdByRawTableName(_tableName)

      // Use request manager to wrap the entire check logic, ensuring atomicity
      await tableRequestManager.executeRequest(tableId, async () => {
        const tableExists = dataStore.tableMap[tableId]

        if (
          !tableExists ||
          !tableExists.fieldMap ||
          Object.keys(tableExists.fieldMap).length === 0
        ) {
          console.log(`Table ${_tableName} not found in dataStore, fetching...`)
          await updateUiColumns(_tableName)
        }
      })
    },
    [sqlite, tableName, fieldMap, updateUiColumns]
  )

  useEffect(() => {
    checkAndFetchTable()
  }, [checkAndFetchTable])

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
    return uiColumns.reduce(
      (acc, cur) => {
        acc[cur.table_column_name] = cur
        return acc
      },
      {} as Record<string, IField>
    )
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
