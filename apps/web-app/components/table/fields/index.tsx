import { useContext, useEffect } from "react"
import type { IView } from "@/packages/core/types/IView"

import { TableContext, useViewOperation } from "@/components/table/hooks"
import {
  useTableFields,
  useTableOperation,
} from "@/apps/web-app/hooks/use-table"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

import { useTableStore } from "../table-store-provider"
import { useColumns } from "../views/grid/hooks/use-col"
import { FieldAppendPanel } from "./field-append-panel"
import { FieldEditorDropdown } from "./field-editor-dropdown"
import { FieldPropertyEditor } from "./field-property-editor"

interface IFieldEditorProps {
  tableName: string
  databaseName: string
  view: IView
}

export const FieldEditor = (props: IFieldEditorProps) => {
  const { tableName, databaseName } = props
  const {
    isAddFieldEditorOpen,
    isFieldPropertiesEditorOpen,
    setCurrentUiColumn,
    currentUiColumn,
    fieldInsertPosition,
    setFieldInsertPosition,
  } = useTableStore()
  const { uiColumns } = useUiColumns(tableName, databaseName)

  useEffect(() => {
    if (currentUiColumn) {
      const newCurrentUiColumn = uiColumns.find(
        (column) =>
          column.table_column_name === currentUiColumn.table_column_name &&
          column.table_name === currentUiColumn.table_name
      )
      if (newCurrentUiColumn) {
        setCurrentUiColumn(newCurrentUiColumn)
      }
    }
  }, [uiColumns, setCurrentUiColumn, currentUiColumn])

  const { fields } = useTableFields(tableName)
  const { showColumns } = useColumns(fields, props.view)
  const { deleteField, addField, updateFieldProperty, changeFieldType } =
    useTableOperation(tableName, databaseName)
  const { updateView } = useViewOperation()
  const { isReadOnly } = useContext(TableContext)

  const handleFieldCreated = async (fieldName: string, position: number) => {
    if (props.view) {
      // If order_map is empty or doesn't have all visible columns,
      // initialize it based on current showColumns order (which matches what user sees)
      const hasExistingOrderMap =
        props.view.order_map && Object.keys(props.view.order_map).length > 0
      const newOrderMap = hasExistingOrderMap ? { ...props.view.order_map } : {}

      // If order_map was empty, initialize all visible columns with their current positions
      // This ensures new field is inserted at the correct position relative to visible columns
      if (!hasExistingOrderMap) {
        showColumns.forEach((col, index) => {
          newOrderMap[col.table_column_name!] = index
        })
      }

      newOrderMap[fieldName] = position

      Object.keys(newOrderMap).forEach((key) => {
        if (key !== fieldName && newOrderMap[key] >= position) {
          newOrderMap[key] = newOrderMap[key] + 1
        }
      })

      await updateView(props.view.id, { order_map: newOrderMap })

      const newField = uiColumns.find(
        (col) => col.table_column_name === fieldName
      )
      if (newField) {
        setCurrentUiColumn(newField)
      }

      setFieldInsertPosition(undefined)
    }
  }

  return (
    <>
      {isAddFieldEditorOpen && (
        <FieldAppendPanel
          addField={addField}
          uiColumns={uiColumns}
          insertPosition={fieldInsertPosition}
          onFieldCreated={handleFieldCreated}
        />
      )}
      {isFieldPropertiesEditorOpen && (
        <FieldPropertyEditor
          updateFieldProperty={updateFieldProperty}
          changeFieldType={changeFieldType}
          databaseName={databaseName}
          tableName={tableName}
          deleteField={deleteField}
        />
      )}
      {!isReadOnly && (
        <FieldEditorDropdown
          databaseName={databaseName}
          tableName={tableName}
          view={props.view}
          deleteField={deleteField}
        />
      )}
    </>
  )
}
