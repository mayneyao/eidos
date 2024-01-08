import React, { useEffect } from "react"
import { GridColumn } from "@glideapps/glide-data-grid"

import { IField } from "@/lib/store/interface"

import { getColumns } from "../helper"

export const useColumns = (uiColumns: IField[]) => {
  const hasResized = React.useRef(new Set<number>())
  const [columns, setColumns] = React.useState<GridColumn[]>([])

  useEffect(() => {
    setColumns(getColumns(uiColumns))
  }, [uiColumns])

  const _onColumnResize = React.useCallback(
    (column: GridColumn, newSize: number) => {
      const index = columns.findIndex((ci) => ci.title === column.title)
      const newColumns = [...columns]
      newColumns.splice(index, 1, {
        ...columns[index],
        width: newSize,
      })
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
  }

  return {
    onColumnResize,
    columns,
  }
}
