import { useEffect } from "react"

import { useSqlite } from "./use-sqlite"
import { useTableStore } from "./use-table"

export const useColumns = (tableName: string, databaseName: string) => {
  const { sqlite } = useSqlite(databaseName)
  const { columns, setColumns } = useTableStore()
  useEffect(() => {
    if (!sqlite) return
    sqlite.exec2(`PRAGMA table_info('${tableName}');`).then((res: any) => {
      console.log("columns loaded", res)
      setColumns(res)
    })
  }, [sqlite, tableName, setColumns])

  return columns
}
