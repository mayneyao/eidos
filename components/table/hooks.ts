import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { SelectFromStatement, parseFirst, toSql } from "pgsql-ast-parser"
import { useSearchParams } from "react-router-dom"

import { FieldType } from "@/lib/fields/const"
import { IView } from "@/lib/store/IView"
import { IField } from "@/lib/store/interface"
import { getTableIdByRawTableName } from "@/lib/utils"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { useTableFields, useTableOperation } from "@/hooks/use-table"

import { getShowColumns } from "./helper"
import { isInkServiceMode } from "@/lib/env"

export const TableContext = createContext<{
  tableName: string
  space: string
  viewId?: string
  isReadOnly?: boolean
}>({
  tableName: "",
  space: "",
  viewId: undefined,
  isReadOnly: true,
})

export const useViewOperation = () => {
  const { tableName, space } = useContext(TableContext)
  const tableId = getTableIdByRawTableName(tableName)
  const { updateViews } = useTableOperation(tableName!, space)
  const { setView } = useSqliteStore()
  const { sqlite } = useSqlite()

  const addView = useCallback(async () => {
    if (tableId && sqlite) {
      const view = await sqlite.createDefaultView(tableId)
      await updateViews()
      return view
    }
  }, [tableId, sqlite, updateViews])

  const delView = useCallback(
    async (viewId: string) => {
      if (sqlite) {
        await sqlite.delView(viewId)
        await updateViews()
      }
    },
    [sqlite, updateViews]
  )

  const updateView = useCallback(
    async (id: string, view: Partial<IView>) => {
      if (isInkServiceMode) {
        setView(tableId, id, view)
      } else if (sqlite) {
        await sqlite.updateView(id, view)
        await updateViews()
      }
    },
    [sqlite, updateViews]
  )

  const addSort = useCallback(
    (view: IView, column: string, direction: "ASC" | "DESC") => {
      const parsedSql = parseFirst(view?.query ?? "") as SelectFromStatement
      if (
        parsedSql?.orderBy?.some((item) => (item.by as any).name === column)
      ) {
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
      updateView(view.id, {
        query: newSql,
      })
    },
    [updateView]
  )

  return {
    addView,
    delView,
    updateView,
    addSort,
  }
}

export const useCurrentView = ({
  space,
  tableName,
  viewId,
}: {
  space: string
  tableName: string
  viewId?: string
}) => {
  const { views } = useTableOperation(tableName!, space)
  const defaultViewId = useMemo(() => {
    return views[0]?.id
  }, [views])

  const [currentViewId, setCurrentViewId] = useState<string | undefined>(
    viewId || defaultViewId
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
    currentView: currentView!,
    setCurrentViewId,
    defaultViewId,
  }
}

export const useShowColumns = (uiColumns: IField[], view: IView) => {
  return useMemo(() => {
    return getShowColumns(uiColumns, {
      orderMap: view?.order_map,
      hiddenFields: view?.hidden_fields,
    }).filter((field) => field.table_column_name !== "title")
  }, [uiColumns, view?.hidden_fields, view?.order_map])
}

export const useView = <T = any>(viewId: string) => {
  const { tableName, space } = useContext(TableContext)
  const { views } = useTableOperation(tableName!, space)
  const view = useMemo(() => {
    return views.find((v) => v.id === viewId)
  }, [views, viewId])

  return view as IView<T>
}

export const useFileFields = () => {
  const { tableName } = useContext(TableContext)
  const { fields } = useTableFields(tableName)
  return useMemo(() => {
    return fields.filter((field) => field.type === FieldType.File)
  }, [fields])
}
