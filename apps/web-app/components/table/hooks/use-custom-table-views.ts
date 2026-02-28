import { useSqlite } from "@/hooks/use-sqlite"
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

export const useCustomTableViews = () => {
  const [tableViews, setTableViews] = useState<IExtension<TableViewMeta>[]>([])
  const { sqlite } = useSqlite()

  useEffect(() => {
    const fetchTableViews = async () => {
      // Get all block extensions and filter for table views
      const allBlockExtensions =
        await sqlite?.extension.getBlockExtensions("enabled")
      const tableViewExtensions =
        (allBlockExtensions?.filter(
          (ext) => ext.meta?.type === "tableView"
        ) as IExtension<TableViewMeta>[]) || []
      setTableViews(tableViewExtensions)
    }
    fetchTableViews()
  }, [sqlite])

  return { tableViews }
}
