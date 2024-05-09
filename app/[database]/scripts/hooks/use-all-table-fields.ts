import { useCallback, useEffect } from "react"
import { create } from "zustand"

import { IField } from "@/lib/store/interface"
import { useSqlite } from "@/hooks/use-sqlite"

interface TableState {
  uiColumnsMap: Record<string, IField[]>
  setUiColumns: (tableId: string, uiColumns: IField[]) => void
}

// not using persist
export const useTableStore = create<TableState>()((set) => ({
  uiColumnsMap: {},
  setUiColumns: (tableId: string, uiColumns: IField[]) => {
    set((state) => {
      return {
        uiColumnsMap: {
          ...state.uiColumnsMap,
          [tableId]: uiColumns,
        },
      }
    })
  },
}))

export const useTablesUiColumns = (
  tableNames: string[],
  databaseName?: string
) => {
  const { sqlite } = useSqlite(databaseName)
  const { uiColumnsMap, setUiColumns } = useTableStore()
  const updateUiColumns = useCallback(async () => {
    if (!sqlite) return
    await Promise.all(
      tableNames.map(async (tableName) => {
        const res = await sqlite.listUiColumns(tableName)
        setUiColumns(tableName, res)
      })
    )
  }, [setUiColumns, sqlite, tableNames])
  useEffect(() => {
    updateUiColumns()
  }, [updateUiColumns, tableNames])

  return {
    uiColumnsMap,
  }
}
