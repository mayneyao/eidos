import React, { useEffect } from "react"
import { GridColumn } from "@glideapps/glide-data-grid"
import { useDebounceFn } from "ahooks"

import { IGridViewProperties, IView } from "@/lib/store/IView"
import { IField } from "@/lib/store/interface"
import { useViewOperation } from "@/components/table/hooks"

import { getShowColumns } from "../helper"

export const useColumns = (
  uiColumns: IField[],
  view: IView<IGridViewProperties>
) => {
  const hasResized = React.useRef(new Set<number>())
  const [columns, setColumns] = React.useState<GridColumn[]>([])
  const [showColumns, setShowColumns] = React.useState<IField[]>([])
  const { updateView } = useViewOperation()

  useEffect(() => {
    const fields = getShowColumns(uiColumns, {
      orderMap: view.order_map,
      hiddenFields: view.hidden_fields,
    })
    setShowColumns(fields)
  }, [uiColumns, view.order_map, view.hidden_fields])

  useEffect(() => {
    setColumns(
      showColumns.map((column) => {
        return {
          id: column.table_column_name,
          title: column.name,
          width:
            view.properties?.fieldWidthMap?.[column.table_column_name] || 200,
          hasMenu: false,
          icon: column.type,
        }
      })
    )
  }, [showColumns, view.properties?.fieldWidthMap])

  const updateColumnWidth = async (
    fieldName: string,
    newSizeWithGrow: number
  ) => {
    await updateView(view.id, {
      properties: {
        ...view.properties,
        fieldWidthMap: {
          ...view.properties?.fieldWidthMap,
          [fieldName]: newSizeWithGrow,
        },
      },
    })
  }

  const { run: _updateColumnWidth } = useDebounceFn(updateColumnWidth, {
    wait: 500,
  })

  const _onColumnResize = React.useCallback(
    (column: GridColumn, newSize: number) => {
      const index = columns.findIndex((ci) => ci.title === column.title)
      const newColumns = [...columns]
      newColumns[index] = { ...column, width: newSize }
      // const _newColumns = newColumns.map((x, i) => ({ ...x, grow: hasResized.current.has(i) ? undefined : (5 + i) / 5 }));
      setColumns(newColumns)
    },
    [columns]
  )

  const onColumnResize = (
    col: GridColumn,
    _newSize: number,
    colIndex: number,
    newSizeWithGrow: number
  ) => {
    hasResized.current.add(colIndex)
    _onColumnResize(col, newSizeWithGrow)
    const field = showColumns[colIndex]
    _updateColumnWidth(field.table_column_name, newSizeWithGrow)
  }

  const onColumnMoved = React.useCallback(
    async (sourceIndex: number, targetIndex: number) => {
      const newShowColumns = [...showColumns]
      const [removedShow] = newShowColumns.splice(sourceIndex, 1)
      newShowColumns.splice(targetIndex, 0, removedShow)
      setShowColumns(newShowColumns)

      const orderMap = newShowColumns.reduce((acc, cur, index) => {
        acc[cur.table_column_name] = index
        return acc
      }, {} as Record<string, number>)

      await updateView(view.id, {
        order_map: orderMap,
      })
    },
    [showColumns, updateView, view]
  )

  return {
    onColumnResize,
    onColumnMoved,
    columns,
    showColumns,
  }
}
