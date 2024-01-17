import { useTableOperation } from "@/hooks/use-table"
import { useUiColumns } from "@/hooks/use-ui-columns"

import { useTableAppStore } from "../store"
import { FieldAppendPanel } from "./field-append-panel"
import { FieldEditorDropdown } from "./field-editor-dropdown"
import { FieldPropertyEditor } from "./field-property-editor"

interface IFieldEditorProps {
  tableName: string
  databaseName: string
}

export const FieldEditor = (props: IFieldEditorProps) => {
  const { tableName, databaseName } = props
  const { isAddFieldEditorOpen, isFieldPropertiesEditorOpen } =
    useTableAppStore()
  const { uiColumns } = useUiColumns(tableName, databaseName)

  const {
    deleteFieldByColIndex,
    addField,
    updateFieldProperty,
    changeFieldType,
  } = useTableOperation(tableName, databaseName)
  return (
    <>
      {isAddFieldEditorOpen && (
        <FieldAppendPanel addField={addField} uiColumns={uiColumns} />
      )}
      {isFieldPropertiesEditorOpen && (
        <FieldPropertyEditor updateFieldProperty={updateFieldProperty}  changeFieldType={changeFieldType}/>
      )}
      <FieldEditorDropdown
        databaseName={databaseName}
        tableName={tableName}
        deleteFieldByColIndex={deleteFieldByColIndex}
      />
    </>
  )
}
