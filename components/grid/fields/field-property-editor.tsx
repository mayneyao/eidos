import React from "react"
import { useClickAway } from "ahooks"
import { Trash2 } from "lucide-react"

import { FieldType } from "@/lib/fields/const"
import { IField } from "@/lib/store/interface"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CommonMenuItem } from "@/components/common-menu-item"

import { useTableAppStore } from "../store"
import { FieldDelete } from "./field-delete"
import { FieldNameEdit } from "./field-name-edit"
import { FieldTypeSelect } from "./field-type-select"
import { FilePropertyEditor } from "./property/file/file-property-editor"
import { FormulaPropertyEditor } from "./property/formula/formula-property-editor"
import { LinkPropertyEditor } from "./property/link/link-property-editor"
import { LookupPropertyEditor } from "./property/lookup/lookup-property-editor"
import { SelectPropertyEditor } from "./property/select/select-property-editor"

export const PropertyEditorTypeMap: {
  [type: string]: React.FC<{
    uiColumn: IField<any>
    onPropertyChange: (property: any) => void
    onSave?: () => void
    isCreateNew?: boolean
  }>
} = {
  select: SelectPropertyEditor,
  "multi-select": SelectPropertyEditor,
  formula: FormulaPropertyEditor,
  link: LinkPropertyEditor,
  lookup: LookupPropertyEditor,
  file: FilePropertyEditor,
}

export const NotImplementEditor = () => {
  return null
}

interface IFieldPropertyEditorProps {
  updateFieldProperty: (fieldName: IField, property: any) => void
  changeFieldType: (rawFieldName: string, type: FieldType) => void
  tableName: string
  databaseName: string
  deleteField: (fieldId: string) => void
}

export const FieldPropertyEditor = ({
  updateFieldProperty,
  changeFieldType,
  tableName,
  databaseName,
  deleteField,
}: IFieldPropertyEditorProps) => {
  const ref = React.useRef<HTMLDivElement>(null)
  const { setIsFieldPropertiesEditorOpen, currentUiColumn: currentField } =
    useTableAppStore()

  const handleDeleteField = () => {
    currentField && deleteField(currentField.table_column_name)
    setIsFieldPropertiesEditorOpen(false)
  }
  useClickAway(
    (e) => {
      const res = document.querySelectorAll(".click-outside-ignore")
      if (Array.from(res).some((node) => node.contains(e.target as Node))) {
        return
      }
      if (ref.current?.contains(e.target as Node)) {
        return
      }
      setIsFieldPropertiesEditorOpen(false)
    },
    ref,
    ["mousedown", "touchstart"]
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
      className="absolute right-0 top-0 h-full w-[400px] border-l bg-white p-3 dark:bg-slate-950"
      ref={ref}
    >
      {currentField && (
        <div className="flex h-full flex-col">
          <div className="flex-none space-y-2">
            <div className="flex items-center justify-between">
              <Label>Name</Label>
              <div className="w-[200px]">
                <FieldNameEdit
                  field={currentField}
                  tableName={tableName}
                  databaseName={databaseName}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Type</Label>
              <FieldTypeSelect
                value={currentField?.type}
                onChange={handleChangeFieldType}
              />
            </div>
          </div>

          <Editor uiColumn={currentField} onPropertyChange={onPropertyChange} />

          <div className="flex-none">
            <hr />
            {currentField.table_column_name !== "title" && (
              <FieldDelete field={currentField} deleteField={handleDeleteField}>
                <CommonMenuItem>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Field
                </CommonMenuItem>
              </FieldDelete>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
