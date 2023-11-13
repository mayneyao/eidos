import React from "react"
import { useClickAway } from "ahooks"

import { FieldType } from "@/lib/fields/const"
import { IUIColumn } from "@/hooks/use-table"

import { useTableAppStore } from "../store"
import { FilePropertyEditor } from "./property/file/file-property-editor"
import { FormulaPropertyEditor } from "./property/formula/formula-property-editor"
import { LinkPropertyEditor } from "./property/link/link-property-editor"
import { SelectPropertyEditor } from "./property/select/select-property-editor"

export const PropertyEditorTypeMap: {
  [type: string]: React.FC<{
    uiColumn: IUIColumn<any>
    onPropertyChange: (property: any) => void
    onSave?: () => void
    isCreateNew?: boolean
  }>
} = {
  select: SelectPropertyEditor,
  "multi-select": SelectPropertyEditor,
  formula: FormulaPropertyEditor,
  link: LinkPropertyEditor,
  file: FilePropertyEditor,
}
const BASE_Fields = [
  FieldType.Text,
  FieldType.Number,
  FieldType.URL,
  FieldType.File,
  // FieldType.Link,
]

export const NotImplementEditor = () => {
  return <div>Not implement</div>
}

interface IFieldPropertyEditorProps {
  updateFieldProperty: (fieldName: IUIColumn, property: any) => void
  changeFieldType: (rawFieldName: string, type: FieldType) => void
}

export const FieldPropertyEditor = ({
  updateFieldProperty,
  changeFieldType,
}: IFieldPropertyEditorProps) => {
  const ref = React.useRef<HTMLDivElement>(null)
  const { setIsFieldPropertiesEditorOpen, currentUiColumn: currentField } =
    useTableAppStore()

  useClickAway(
    (e) => {
      setIsFieldPropertiesEditorOpen(false)
    },
    [ref]
  )

  const onPropertyChange = (property: any) => {
    currentField && updateFieldProperty(currentField, property)
  }
  const handleChangeFieldType = (type: FieldType) => {
    currentField && changeFieldType(currentField.table_column_name, type)
  }

  const Editor =
    PropertyEditorTypeMap[currentField?.type ?? "select"] ?? NotImplementEditor
  return (
    <div
      className="absolute right-0 top-0 h-full w-[400px] bg-slate-50 dark:bg-slate-950"
      ref={ref}
    >
      {/* simple implement change field type */}
      {BASE_Fields.includes(currentField!.type) && (
        <select
          name="field-type"
          id="field-type-select"
          value={currentField?.type}
          onChange={(e) => handleChangeFieldType(e.target.value as FieldType)}
        >
          {BASE_Fields.map((fieldType) => (
            <option key={fieldType} value={fieldType}>
              {fieldType}
            </option>
          ))}
        </select>
      )}
      <Editor uiColumn={currentField!} onPropertyChange={onPropertyChange} />
    </div>
  )
}
