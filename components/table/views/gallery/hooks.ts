import { useEffect, useState } from "react"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsg,
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

type RowData = Record<string, any> & {
  _id: string
  title?: string
}

export const useGalleryViewData = (view: IView) => {
  const { table_id: tableId, query } = view
  const tableName = getRawTableNameById(tableId)
  const { sqlite } = useSqlite()
  const { setRows } = useSqliteStore()
  const { getViewSortedRows } = useViewSort(query)
  const [data, setData] = useState<string[]>([])
  const [list, setList] = useState<RowData[]>([])
  const [loading, setLoading] = useState(false)
  const { space } = useCurrentPathInfo()
  const { nameRawIdMap, uiColumnMap } = useUiColumns(tableName, space)

  useEffect(() => {
    if (sqlite && nameRawIdMap.size && tableName) {
      setLoading(true)
      const defaultQuery = `select * from ${tableName}`
      const q = query.trim().length ? query : defaultQuery
      const sql = transformSql(q, tableName, nameRawIdMap)
      sqlite.sql2`${sql}`.then((data) => {
        setRows(tableId, data)
        setData(data.map((d: any) => d._id))
        setList(data as any[])
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
    const handleMsg = (e: MessageEvent<EidosDataEventChannelMsg>) => {
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
              const rowIds = rows.map((r: any) => r._id)
              setData(rowIds)
            })
            break
          default:
            break
        }
      }
    }
    bc.addEventListener("message", handleMsg)
    return () => {
      bc.removeEventListener("message", handleMsg)
      bc.close()
    }
  }, [getViewSortedRows, data, tableName])

  return {
    data,
    list,
    loading,
  }
}
