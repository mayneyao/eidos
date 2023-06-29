import React from "react"
import { GridCell, GridCellKind } from "@glideapps/glide-data-grid"

import { allFieldTypesMap } from "@/lib/fields"
import { useTable } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"

import { columnsHandleMap } from "../helper"
import { RowEditedCallback } from "./use-async-data"

export const useDataSource = (tableName: string, databaseName: string) => {
  const { updateCell, updateFieldProperty } = useTable(tableName, databaseName)
  const { uiColumns, uiColumnMap } = useUiColumns(tableName, databaseName)

  const toCell = React.useCallback(
    (rowData: any, col: number) => {
      const field = uiColumns[col]
      if (!field)
        return {
          kind: GridCellKind.Text,
          data: null,
          displayData: "",
          allowOverlay: true,
        }
      const cv = rowData[field.table_column_name]
      const emptyCell: GridCell = {
        kind: GridCellKind.Text,
        data: cv,
        displayData: `${cv}`,
        allowOverlay: true,
      }
      if (!field) {
        return emptyCell
      }
      const uiCol = uiColumnMap.get(field.name)
      if (!uiCol) {
        return emptyCell
      }
      let colHandle = columnsHandleMap[uiCol.type]
      if (!colHandle) {
        const FieldClass = allFieldTypesMap[uiCol.type]
        if (FieldClass) {
          const field = new FieldClass(uiCol)
          return field.getCellContent(cv as never)
        } else {
          throw new Error(`field type ${uiCol.type} not found`)
        }
      }
      return colHandle.getContent(cv)
    },
    [uiColumnMap, uiColumns]
  )

  const onEdited: RowEditedCallback<any> = React.useCallback(
    (cell, newVal, rowData) => {
      // console.log("onCellEdited", cell, newVal, rowData)
      const [col] = cell
      const field = uiColumns[col]

      if (!field) {
        return rowData
      }
      const uiCol = uiColumnMap.get(field.name)
      if (!uiCol) {
        return rowData
      }
      let colHandle = columnsHandleMap[uiCol.type]
      const rowId = rowData._id
      const fieldName = field.table_column_name
      if (!colHandle) {
        const FieldClass = allFieldTypesMap[uiCol.type]
        if (FieldClass) {
          const field = new FieldClass(uiCol)
          const res = field.cellData2RawData(newVal as never)
          const rawData = res.rawData
          const shouldUpdateColumnProperty = (res as any)
            .shouldUpdateColumnProperty
          // when field property changed, update field property
          if (shouldUpdateColumnProperty) {
            updateFieldProperty(
              field.column.table_column_name,
              field.column.property
            )
          }
          updateCell(rowId, fieldName, rawData)
          const newRowData: any = {
            ...rowData,
            [uiCol.table_column_name]: rawData,
          }
          return newRowData
        }
      }
      // error
      updateCell(rowId, fieldName, newVal.data)
      return rowData
    },
    [uiColumns, uiColumnMap, updateCell, updateFieldProperty]
  )
  return {
    toCell,
    onEdited,
  }
}
