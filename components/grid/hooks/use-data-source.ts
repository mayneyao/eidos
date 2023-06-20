import React, { useCallback } from "react"
import {
  EditableGridCell,
  GridCell,
  GridCellKind,
  Item,
} from "@glideapps/glide-data-grid"

import { allFieldTypesMap } from "@/lib/fields"
import { useTable } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"

import { columnsHandleMap } from "../helper"
import { useColumns } from "./use-col"

export const useDataSource = (tableName: string, databaseName: string) => {
  const { data, updateCell } = useTable(tableName, databaseName)
  const { uiColumns, uiColumnMap } = useUiColumns(tableName, databaseName)
  const { columns } = useColumns(uiColumns)

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [columnIndex, rowIndex] = cell
      const content = data[rowIndex]?.[columnIndex] ?? ""
      const field = columns[columnIndex]
      const emptyCell: GridCell = {
        kind: GridCellKind.Text,
        data: content,
        displayData: `${content}`,
        allowOverlay: true,
      }
      if (!field) {
        return emptyCell
      }
      const uiCol = uiColumnMap.get(field.title)
      if (!uiCol) {
        return emptyCell
      }
      let colHandle = columnsHandleMap[uiCol.type]
      if (!colHandle) {
        const FieldClass = allFieldTypesMap[uiCol.type]
        if (FieldClass) {
          const field = new FieldClass(uiCol)
          return field.getCellContent(content as never)
        } else {
          throw new Error(`field type ${uiCol.type} not found`)
        }
      }
      return colHandle.getContent(content)
    },
    [data, columns, uiColumnMap]
  )

  // event handle
  const onCellEdited = React.useCallback(
    async (cell: Item, newValue: EditableGridCell) => {
      console.log("onCellEdited", cell, newValue)
      const field = columns[cell[0]]
      if (!field) {
        return
      }
      const uiCol = uiColumnMap.get(field.title)
      if (!uiCol) {
        return
      }
      let colHandle = columnsHandleMap[uiCol.type]
      if (!colHandle) {
        const FieldClass = allFieldTypesMap[uiCol.type]
        if (FieldClass) {
          const field = new FieldClass(uiCol)
          const rawData = field.cellData2RawData(newValue as never)
          console.log(newValue, rawData)
          return updateCell(cell[0], cell[1], rawData)
        }
      }
      return updateCell(cell[0], cell[1], newValue.data)
    },
    [columns, uiColumnMap, updateCell]
  )

  return {
    getCellContent,
    onCellEdited,
  }
}
