import { useEffect } from "react"

import { useSqlite } from "@/hooks/use-sqlite"
import { getSortColumns } from "@/lib/sqlite/sql-sort-parser"
import { IView } from "@/lib/store/IView"
import { getRawTableNameById } from "@/lib/utils"

import { DataLevel, getDataLevel } from "../helper"
import { useTableCount } from "./use-table-count"

export const useAutoIndex = (view: IView) => {
  const { count } = useTableCount(getRawTableNameById(view.table_id))
  const dataLevel = getDataLevel(count)
  const { sqlite } = useSqlite()

  useEffect(() => {
    if (!sqlite) return
    if (dataLevel > DataLevel.L2) {
      const columns = getSortColumns(view.query)
      // const filterColumns = getFilterColumns(view.query)
      for (const column of columns || []) {
        sqlite.createTableIndex(view.table_id, column)
      }
      // for (const column of filterColumns || []) {
      //   sqlite.createTableIndex(view.table_id, column)
      // }
    }
  }, [dataLevel, sqlite, view.query, view.table_id])
}
