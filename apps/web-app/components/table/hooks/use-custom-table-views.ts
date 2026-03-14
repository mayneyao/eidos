import { useSqlite } from "@/hooks/use-sqlite"
import { getTableIdByRawTableName } from "@/lib/utils"
import type {
  IExtension,
  TableViewMeta,
} from "@/packages/core/types/IExtension"
import { useEffect } from "react"
import { useState } from "react"

export const useTableViewInfoByExtType = (type?: string) => {
  const { sqlite } = useSqlite()
  const [tableViews, setTableViews] = useState<IExtension<TableViewMeta>[]>([])
  useEffect(() => {
    if (!type?.startsWith("ext__")) {
      return
    }
    const fetchTableViews = async () => {
      // Get all table view extensions and filter by type
      const allTableViews =
        await sqlite?.extension.getBlockExtensions("enabled")
      const filteredTableViews =
        (allTableViews?.filter(
          (ext) =>
            ext.meta?.type === "tableView" &&
            ext.meta?.tableView?.type === type.split("__")[1]
        ) as IExtension<TableViewMeta>[]) || []
      setTableViews(filteredTableViews)
    }
    fetchTableViews()
  }, [sqlite, type])
  return tableViews[0] || null
}

export const useCustomTableViews = (tableName?: string) => {
  const [tableViews, setTableViews] = useState<IExtension<TableViewMeta>[]>([])
  const { sqlite } = useSqlite()

  useEffect(() => {
    const fetchTableViews = async () => {
      // Get all block extensions
      const allBlockExtensions =
        await sqlite?.extension.getBlockExtensions("enabled")

      // Get current table ID if tableName is provided
      const currentTableId = tableName
        ? getTableIdByRawTableName(tableName)
        : undefined

      // Filter for table views and apply table binding logic
      const tableViewExtensions =
        (allBlockExtensions?.filter((ext) => {
          if (ext.meta?.type !== "tableView") return false

          const tableViewMeta = ext.meta.tableView
          const boundTableId = tableViewMeta?.tableId

          // If the view is bound to a specific table, only show for that table
          if (boundTableId) {
            return boundTableId === currentTableId
          }

          // General views are shown for all tables
          return true
        }) as IExtension<TableViewMeta>[]) || []

      setTableViews(tableViewExtensions)
    }
    fetchTableViews()
  }, [sqlite, tableName])

  return { tableViews }
}
