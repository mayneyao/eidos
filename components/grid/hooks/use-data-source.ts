import React from "react"
import { GridCell, GridCellKind } from "@glideapps/glide-data-grid"

import { allFieldTypesMap } from "@/lib/fields"
import { FieldType } from "@/lib/fields/const"
import { useTableOperation } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"
import { useCurrentView } from "@/components/table/hooks"

import { columnsHandleMap } from "../helper"
import { RowEditedCallback } from "./use-async-data"
import { useColumns } from "./use-col"

export const useDataSource = (tableName: string, databaseName: string) => {
  const { updateCell, updateFieldProperty } = useTableOperation(
    tableName,
    databaseName
  )
  const { currentView } = useCurrentView()
  const { fieldRawColumnNameFieldMap, uiColumns } = useUiColumns(
    tableName,
    databaseName
  )
  const { columns } = useColumns(uiColumns, currentView!)

  const toCell = React.useCallback(
    (rowData: any, col: number) => {
      const column = columns[col]
      const field = fieldRawColumnNameFieldMap[column.id!]
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

      let colHandle = columnsHandleMap[field.type]
      if (!colHandle) {
        const FieldClass = allFieldTypesMap[field.type]
        if (FieldClass) {
          const fieldInstance = new FieldClass(field)
          return fieldInstance.getCellContent(cv as never)
        } else {
          throw new Error(`field type ${field.type} not found`)
        }
      }
      return colHandle.getContent(cv)
    },
    [columns, fieldRawColumnNameFieldMap]
  )

  const onEdited: RowEditedCallback<any> = React.useCallback(
    (cell, newCell, rowData) => {
      const [col] = cell
      const column = columns[col]
      const field = fieldRawColumnNameFieldMap[column.id!]
      if (!field) {
        return rowData
      }

      let colHandle = columnsHandleMap[field.type]
      const rowId = rowData._id
      const fieldName = field.table_column_name
      if (!colHandle) {
        const FieldClass = allFieldTypesMap[field.type]
        if (FieldClass) {
          const fieldInstance = new FieldClass(field)
          const res = fieldInstance.cellData2RawData(newCell as never)
          // rawData is what we want to save to database
          const rawData = res.rawData
          const shouldUpdateColumnProperty = (res as any)
            .shouldUpdateColumnProperty
          // when field property changed, update field property
          if (shouldUpdateColumnProperty) {
            updateFieldProperty(
              fieldInstance.column,
              fieldInstance.column.property
            )
          }
          console.log("updateCell", { rowId, fieldName, rawData })
          updateCell(rowId, fieldName, rawData)
          let newRowData: any
          if (field.type === FieldType.Link) {
            // link cell will update with id, but display with title
            newRowData = {
              ...rowData,
              [field.table_column_name]: (newCell.data as any).value,
            }
            console.log("newRowData", newRowData)
          } else {
            newRowData = {
              ...rowData,
              [field.table_column_name]: rawData,
            }
          }
          return newRowData
        }
      }
      // error
      updateCell(rowId, fieldName, newCell.data)
      return rowData
    },
    [columns, fieldRawColumnNameFieldMap, updateCell, updateFieldProperty]
  )
  return {
    toCell,
    onEdited,
  }
}
