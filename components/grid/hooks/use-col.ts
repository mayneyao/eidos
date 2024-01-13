import React, { useEffect } from "react"
import { GridColumn } from "@glideapps/glide-data-grid"
import { useDebounceFn } from "ahooks"

import { IGridViewProperties, IView } from "@/lib/store/IView"
import { IField } from "@/lib/store/interface"
import { useViewOperation } from "@/components/table/hooks"

import { getColumns } from "../helper"

export const useColumns = (
  uiColumns: IField[],
  view: IView<IGridViewProperties>
) => {
  const hasResized = React.useRef(new Set<number>())
  const [columns, setColumns] = React.useState<GridColumn[]>([])
  const { updateView } = useViewOperation()

  useEffect(() => {
    setColumns(getColumns(uiColumns, view.properties?.fieldWidthMap))
  }, [uiColumns, view])

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
    const field = uiColumns[colIndex]
    _updateColumnWidth(field.table_column_name, newSizeWithGrow)
  }
  return {
    onColumnResize,
    columns,
  }
}
