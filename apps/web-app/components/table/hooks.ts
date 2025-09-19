import type { SelectFromStatement } from "pgsql-ast-parser";
import { parseFirst, toSql } from "pgsql-ast-parser"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react"
import { useSearchParams } from "react-router-dom"

import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { useTableFields, useTableOperation } from "@/apps/web-app/hooks/use-table"
import { FieldType } from "@/packages/core/fields/const"
import type { IView, ViewType } from "@/packages/core/types/IView";
import { ViewTypeEnum } from "@/packages/core/types/IView"
import type { IField } from "@/packages/core/types/IField"
import { getTableIdByRawTableName } from "@/lib/utils"

import { isInkServiceMode } from "@/lib/env"
import { getFieldInstance } from "@/packages/core/fields"
import { getShowColumns } from "./helper"
import { useLookupContext } from "./views/grid/hooks/use-lookup-context"



interface TableContextType {
  tableName: string
  space: string
  viewId?: string
  isReadOnly?: boolean
  isView?: boolean
  udfs?: {
    id: string
    name: string
    code: string
  }[] // name list of user defined function
}

export const TableContext = createContext<TableContextType>({
  tableName: "",
  space: "",
  viewId: undefined,
  isReadOnly: true,
  isView: false,
  udfs: [],
})

export const useTableContext = () => {
  return useContext(TableContext)
}

export const useUDFs = () => {
  const [udfs, setUdfs] = useState<{
    id: string
    name: string
    code: string
  }[]>([])
  const { sqlite } = useSqlite()
  useEffect(() => {
    if (sqlite) {
      sqlite.extension.getUDFExtensions('enabled').then((udfs) => {
        setUdfs(udfs.map(udf => {
          return {
            id: udf.id,
            name: udf.meta!.udf!.name,
            code: udf.code,
          }
        }))
      })
    }
  }, [sqlite])
  return udfs
}

export const useViewOperation = () => {
  const { tableName, space } = useContext(TableContext)
  const tableId = getTableIdByRawTableName(tableName)
  const { updateViews } = useTableOperation(tableName!, space)
  const { setView } = useSqliteStore()
  const { sqlite } = useSqlite()

  const addView = useCallback(async (type: ViewType = ViewTypeEnum.Grid) => {
    if (tableId && sqlite) {
      const view = await sqlite.view.createDefaultView(tableName, type)
      await updateViews()
      return view
    }
  }, [tableId, sqlite, updateViews])

  const delView = useCallback(
    async (viewId: string) => {
      if (sqlite) {
        await sqlite.view.del(viewId)
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
        await sqlite.view.set(id, view)
        await updateViews()
      }
    },
    [sqlite, updateViews]
  )

  const freezeColumn = useCallback(async (viewId: string, colIndex: number) => {
    if (sqlite) {
      const view = await sqlite.view.get(viewId)
      updateView(viewId, {
        properties: {
          ...(view?.properties || {}),
          freezeColumns: colIndex
        }
      })
    }
  }, [sqlite, updateView])

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

  const moveViewPosition = useCallback(
    async (dragId: string, targetId: string, direction: "up" | "down") => {
      if (sqlite) {
        await sqlite.view.movePosition({
          dragId,
          targetId,
          direction,
          tableId,
        })
        await updateViews()
      }
    },
    [sqlite, tableId, updateViews]
  )


  return {
    addView,
    delView,
    updateView,
    addSort,
    moveViewPosition,
    freezeColumn,
  }
}

export const useCurrentView = <T = any>({
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
    currentView: currentView as IView<T>,
    setCurrentViewId,
    defaultViewId,
  }
}

export const useShowColumns = (uiColumns: IField[], view: IView) => {
  return useMemo(() => {
    return getShowColumns(uiColumns, {
      orderMap: view?.order_map,
      hiddenFields: view?.hidden_fields,
    })
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
  const { tableName, space } = useContext(TableContext)
  const { fields } = useTableFields(tableName)
  const { contextMap } = useLookupContext(tableName, space)


  const getFieldContext = useCallback(
    (field: IField) => {
      if (field.type === FieldType.Lookup) {
        return contextMap[field.table_column_name]
      }
      return
    },
    [contextMap]
  )

  return useMemo(() => {
    return fields.filter((field) => {
      const fieldInstance = getFieldInstance(field, getFieldContext(field))
      return fieldInstance?.displayType === FieldType.File
    })
  }, [fields, getFieldContext])
}
