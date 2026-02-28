import { useContext, useEffect, useState } from "react"
import { useThrottleFn } from "ahooks"

import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import { useViewSort } from "@/apps/web-app/hooks/use-view-sort"
import type { EidosDataEventChannelMsg } from "@/lib/const"
import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { transformSql } from "@/packages/core/sqlite/sql-parser"
import type { IView } from "@/packages/core/types/IView"
import { TableContext } from "../../hooks"

type RowData = Record<string, any> & {
  _id: string
  title?: string
}

export const useGalleryViewData = (view: IView) => {
  const { table_id: tableId, query } = view
  const { tableName, isView, space } = useContext(TableContext)
  const { sqlite } = useSqlite()
  const { setRows } = useSqliteStore()
  const { getViewSortedRows } = useViewSort(query)
  const [data, setData] = useState<string[]>([])
  const [list, setList] = useState<RowData[]>([])
  const [loading, setLoading] = useState(false)
  const { nameRawIdMap, uiColumnMap } = useUiColumns(tableName, space)

  useEffect(() => {
    if (sqlite && nameRawIdMap.size && tableName) {
      setLoading(true)
      const defaultQuery = `select * from ${tableName}`
      const q = query.trim().length ? query : defaultQuery
      const sql = transformSql(q, tableName, nameRawIdMap)
      console.log("useGalleryViewData", { sql, nameRawIdMap })
      sqlite.sql2`${sql}`.then((data: any[]) => {
        console.log("useGalleryViewData", { data, tableId })
        if (isView) {
          setRows(tableId, data, 0, true)
          setData(Array.from({ length: data.length }, (_, i) => i + ""))
        } else {
          setRows(tableId, data)
          setData(data.map((d: any) => d._id))
        }
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

  const { run: updateView } = useThrottleFn(
    () => {
      getViewSortedRows().then((rows) => {
        const rowIds = rows.map((r: any) => r._id)
        setData(rowIds)
      })
    },
    {
      wait: 300,
    }
  )

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
            updateView()
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
  }, [updateView, tableName])

  return {
    data,
    list,
    loading,
  }
}
