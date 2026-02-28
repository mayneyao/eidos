import React, { useCallback } from "react"
import type { GridCell } from "@glideapps/glide-data-grid"
import { GridCellKind } from "@glideapps/glide-data-grid"

import { getFieldInstance } from "@/packages/core/fields"
import { FieldType } from "@/packages/core/fields/const"
import type { IField } from "@/packages/core/types/IField"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import { useUserMap } from "@/apps/web-app/hooks/use-user-map"
import { useCurrentView } from "@/components/table/hooks"

import { columnsHandleMap } from "../helper"
import type { RowEditedCallback } from "./use-async-data"
import { useColumns } from "./use-col"
import { useLookupContext } from "./use-lookup-context"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { getTableIdByRawTableName } from "@/lib/utils"
import { useTheme } from "@/components/theme-provider"

export const useDataSource = (tableName: string, databaseName: string) => {
  const { updateCell, updateFieldProperty } = useTableOperation(
    tableName,
    databaseName
  )
  const { currentView } = useCurrentView()
  const { sqlite } = useSqlite()
  const { userMap } = useUserMap()
  const { uiColumns } = useUiColumns(tableName, databaseName)
  const { contextMap } = useLookupContext(tableName, databaseName)
  const { showColumns } = useColumns(uiColumns, currentView)

  const { resolvedTheme } = useTheme()

  const findRowIndexInView = useCallback(
    (rowId: string) => {
      if (!sqlite) {
        return Promise.resolve(-1)
      }
      const rowIndex = sqlite?.view.findRowIndexInQuery(
        getTableIdByRawTableName(tableName),
        rowId,
        currentView.query
      )
      return rowIndex
    },
    [currentView, tableName]
  )

  const getFieldContext = useCallback(
    (field: IField) => {
      if (field.type === FieldType.Lookup) {
        return contextMap[field.table_column_name]
      }
      return
    },
    [contextMap]
  )

  const toCell = React.useCallback(
    (rowData: any, col: number) => {
      const field = showColumns[col]
      if (!field || !rowData)
        return {
          kind: GridCellKind.Text,
          data: null,
          displayData: "",
          allowOverlay: true,
        }
      const errorCell: GridCell = {
        kind: GridCellKind.Loading,
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
      try {
        let colHandle = columnsHandleMap[field.type]
        if (!colHandle) {
          const fieldInstance = getFieldInstance(field, getFieldContext(field))
          if (fieldInstance) {
            return fieldInstance.getCellContent(cv as never, {
              userMap,
              row: rowData,
              theme: resolvedTheme,
            })
          } else {
            throw new Error(`field type ${field.type} not found`)
          }
        }
        return colHandle.getContent(cv)
      } catch (error) {
        console.error("render cell error", error)
        return errorCell
      }
    },
    [getFieldContext, showColumns, userMap, resolvedTheme]
  )

  const onEdited: RowEditedCallback<any> = React.useCallback(
    (cell, newCell, rowData) => {
      const [col] = cell
      const field = showColumns[col]
      if (!field) {
        return rowData
      }

      let colHandle = columnsHandleMap[field.type]
      const rowId = rowData._id
      const fieldName = field.table_column_name
      if (!colHandle) {
        const fieldInstance = getFieldInstance(field)
        if (fieldInstance) {
          const res = fieldInstance.cellData2RawData(newCell as never)
          // rawData is what we want to save to database
          const rawData = res.rawData
          // const shouldUpdateColumnProperty = (res as any)
          //   .shouldUpdateColumnProperty
          // // when field property changed, update field property
          // if (shouldUpdateColumnProperty) {
          //   updateFieldProperty(
          //     fieldInstance.column,
          //     fieldInstance.column.property
          //   )
          // }
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
    [showColumns, updateCell]
  )
  return {
    toCell,
    onEdited,
    findRowIndexInView,
  }
}
