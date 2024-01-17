import { useCallback, useEffect, useState } from "react"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { transformSql } from "@/lib/sqlite/sql-parser"
import { IView } from "@/lib/store/IView"
import { getRawTableNameById, getTableIdByRawTableName } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
import { useUiColumns } from "@/hooks/use-ui-columns"

export const useGalleryViewData = (view: IView) => {
  const { tableId, query } = view
  const tableName = getRawTableNameById(tableId)
  const { sqlite } = useSqlite()

  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const { space } = useCurrentPathInfo()
  const { nameRawIdMap, uiColumnMap } = useUiColumns(tableName, space)

  const checkRowExistInQuery = useCallback(
    async (rowId: string, callback: (isExist: boolean) => void) => {
      if (!sqlite || !query) return
      const tableId = getTableIdByRawTableName(tableName)
      const isExist = await sqlite.isRowExistInQuery(tableId, rowId, query)
      callback(isExist)
    },
    [sqlite, tableName, query]
  )

  useEffect(() => {
    if (sqlite && nameRawIdMap.size && tableName) {
      setLoading(true)
      const defaultQuery = `select * from ${tableName}`
      const q = query.trim().length ? query : defaultQuery
      const sql = transformSql(q, tableName, nameRawIdMap)
      sqlite.sql2`${sql}`.then((data) => {
        setData(data)
        setLoading(false)
      })
    }
  }, [sqlite, query, tableName, view.id, nameRawIdMap, uiColumnMap])

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
            checkRowExistInQuery(_new._id, (isExist) => {
              if (isExist && data.findIndex((d) => d._id == _new._id) === -1) {
                setData((data) => [_new, ...data])
              }
            })
            break
          case DataUpdateSignalType.Update:
            checkRowExistInQuery(_new._id, (isExist) => {
              setData((data) => {
                const index = data.findIndex((d) => d._id == _old._id)
                if (isExist) {
                  if (index !== -1) {
                    data[index] = payload._new
                    console.log("update row", payload._new)
                    setData([...data])
                  } else {
                    return [_new, ...data]
                  }
                } else {
                  data.splice(index, 1)
                }
                return [...data]
              })
            })

            break
          case DataUpdateSignalType.Delete:
            setData((data) => {
              const index = data.findIndex((d) => d.id == _old.id)
              if (index !== -1) {
                data.splice(index, 1)
              }
              return [...data]
            })
            break
        }
      }
    }
    return () => {
      bc.close()
    }
  }, [checkRowExistInQuery, data, tableName])

  return {
    data,
    loading,
  }
}
