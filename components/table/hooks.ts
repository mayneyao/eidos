import { useEffect, useMemo, useState } from "react"
import { SelectFromStatement, parseFirst, toSql } from "pgsql-ast-parser"
import { useSearchParams } from "react-router-dom"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { transformSql } from "@/lib/sqlite/sql-parser"
import { IView } from "@/lib/store/IView"
import { getRawTableNameById } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
import { useTable } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"

export const useViewOperation = () => {
  const { tableId, tableName, space } = useCurrentPathInfo()
  const { updateViews } = useTable(tableName!, space)
  const { sqlite } = useSqlite()
  const addView = async () => {
    if (tableId && sqlite) {
      const view = await sqlite.createDefaultView(tableId)
      await updateViews()
      return view
    }
  }
  const delView = async (viewId: string) => {
    if (sqlite) {
      await sqlite.delView(viewId)
      await updateViews()
    }
  }
  const updateView = async (id: string, view: Partial<IView>) => {
    if (sqlite) {
      await sqlite.updateView(id, view)
      await updateViews()
    }
  }

  const addSort = (view: IView, column: string, direction: "ASC" | "DESC") => {
    const parsedSql = parseFirst(view?.query ?? "") as SelectFromStatement
    if (parsedSql?.orderBy?.some((item) => (item.by as any).name === column)) {
      const order = parsedSql.orderBy!.find(
        (item) => (item.by as any).name === column
      )!
      if (order.order !== direction) {
        order.order = direction
      } else {
        return
      }
    } else {
      parsedSql.orderBy = [
        ...(parsedSql.orderBy || []),
        {
          by: {
            type: "ref",
            name: column,
          },
          order: direction,
        },
      ]
    }
    const newSql = toSql.statement(parsedSql)
    updateView(view!.id, {
      query: newSql,
    })
  }

  return {
    addView,
    delView,
    updateView,
    addSort,
  }
}

export const useCurrentView = () => {
  const { tableName, space } = useCurrentPathInfo()
  const { views } = useTable(tableName!, space)
  const defaultViewId = useMemo(() => {
    return views[0]?.id
  }, [views])

  const [currentViewId, setCurrentViewId] = useState<string | undefined>(
    defaultViewId
  )
  let [searchParams, setSearchParams] = useSearchParams()
  const v = searchParams.get("v")

  useEffect(() => {
    if (v) {
      setCurrentViewId(v)
    } else {
      setCurrentViewId(defaultViewId)
    }
  }, [defaultViewId, setSearchParams, v])

  const currentView = useMemo(() => {
    return views.find((v) => v.id === currentViewId)
  }, [views, currentViewId])

  return {
    currentView,
    setCurrentViewId,
    defaultViewId,
  }
}

export const useViewData = (view: IView) => {
  const { tableId, query } = view
  const tableName = getRawTableNameById(tableId)
  const { sqlite } = useSqlite()

  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const { space } = useCurrentPathInfo()
  const { nameRawIdMap, uiColumnMap } = useUiColumns(tableName, space)

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
            setData((data) => [...data, _new])
            break
          case DataUpdateSignalType.Update:
            setData((data) => {
              const index = data.findIndex((d) => d._id == _old._id)
              if (index !== -1) {
                data[index] = payload._new
              }
              return [...data]
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
  }, [tableName])

  return {
    data,
    loading,
  }
}
