import { useEffect, useState } from "react"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { transformSql } from "@/lib/sqlite/sql-parser"
import { IView } from "@/lib/store/IView"
import { getRawTableNameById } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { useUiColumns } from "@/hooks/use-ui-columns"
import { useViewSort } from "@/hooks/use-view-sort"

export const useGalleryViewData = (view: IView) => {
  const { table_id: tableId, query } = view
  const tableName = getRawTableNameById(tableId)
  const { sqlite } = useSqlite()
  const { setRows } = useSqliteStore()
  const { getViewSortedRows } = useViewSort(query)
  const [data, setData] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const { space } = useCurrentPathInfo()
  const { nameRawIdMap, uiColumnMap } = useUiColumns(tableName, space)

  // const checkRowExistInQuery = useCallback(
  //   async (rowId: string, callback: (isExist: boolean) => void) => {
  //     if (!sqlite || !query) return
  //     const tableId = getTableIdByRawTableName(tableName)
  //     const isExist = await sqlite.isRowExistInQuery(tableId, rowId, query)
  //     callback(isExist)
  //   },
  //   [sqlite, tableName, query]
  // )

  useEffect(() => {
    if (sqlite && nameRawIdMap.size && tableName) {
      setLoading(true)
      const defaultQuery = `select * from ${tableName}`
      const q = query.trim().length ? query : defaultQuery
      const sql = transformSql(q, tableName, nameRawIdMap)
      sqlite.sql2`${sql}`.then((data) => {
        setRows(tableId, data)
        setData(data.map((d) => d._id))
        setLoading(false)
      })
    }
  }, [
    sqlite,
    query,
    tableName,
    view.id,
    nameRawIdMap,
    uiColumnMap,
    setRows,
    tableId,
  ])

  useEffect(() => {
    // TODO: Use a universal data source manager, which should be a singleton instance, with a mapping to store all data sources, and also an array to store the order.
    const bc = new BroadcastChannel(EidosDataEventChannelName)
    bc.onmessage = (e: MessageEvent) => {
      const { type, payload } = e.data
      if (
        type === EidosDataEventChannelMsgType.DataUpdateSignalType &&
        payload.table === tableName
      ) {
        const { _new, _old } = payload
        switch (payload.type) {
          case DataUpdateSignalType.Insert:
          case DataUpdateSignalType.Update:
          case DataUpdateSignalType.Delete:
            getViewSortedRows().then((rows) => {
              const rowIds = rows.map((r) => r._id)
              setData(rowIds)
            })
            break
          default:
            break
        }
      }
    }
    return () => {
      bc.close()
    }
  }, [getViewSortedRows, data, tableName])

  return {
    data,
    loading,
  }
}
