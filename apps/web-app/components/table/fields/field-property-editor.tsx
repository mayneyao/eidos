import React, { useContext } from "react"
import type { FieldType } from "@/packages/core/fields/const"
import type { IField } from "@/packages/core/types/IField"
import { useClickAway } from "ahooks"
import { Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Label } from "@/components/ui/label"
import { CommonMenuItem } from "@/components/common-menu-item"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"

import { TableContext } from "../hooks"
import { useTableAppStore } from "../views/grid/store"
import { FieldDelete } from "./field-delete"
import { FieldNameEdit } from "./field-name-edit"
import { FieldTypeSelect } from "./field-type-select"
import { FilePropertyEditor } from "./property/file/file-property-editor"
import { FormulaPropertyEditor } from "./property/formula/formula-property-editor"
import { LinkPropertyEditor } from "./property/link/link-property-editor"
import { LookupPropertyEditor } from "./property/lookup/lookup-property-editor"
import { NumberPropertyEditor } from "./property/number/number-property-editor"
import { SelectPropertyEditor } from "./property/select/select-property-editor"
import { TextPropertyEditor } from "./property/text/text-property-editor"

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
  number: NumberPropertyEditor,
  text: TextPropertyEditor,
}

export const NotImplementEditor = () => {
  return null
}

interface IFieldPropertyEditorProps {
  updateFieldProperty: (fieldName: IField, property: any) => void
  changeFieldType: (field: IField, type: FieldType) => void
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
  const { t } = useTranslation()
  const ref = React.useRef<HTMLDivElement>(null)
  const { setIsFieldPropertiesEditorOpen, currentUiColumn: currentField } =
    useTableAppStore()
  const { updateViewColumn } = useTableOperation(tableName, databaseName)
  const { isView } = useContext(TableContext)
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
    if (isView && currentField) {
      updateViewColumn(
        tableName,
        currentField.table_column_name,
        type,
        currentField.property
      )
    } else {
      currentField && changeFieldType(currentField, type)
    }
  }

  const Editor =
    PropertyEditorTypeMap[currentField?.type ?? "select"] ?? NotImplementEditor
  return (
    <div
      className="absolute right-0 top-0 h-full w-[350px] border-l bg-popover p-3 shadow-lg"
      ref={ref}
    >
      {currentField && (
        <div className="flex h-full flex-col space-y-2">
          <div className="flex-none space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("common.name")}</Label>
              <FieldNameEdit
                field={currentField}
                tableName={tableName}
                databaseName={databaseName}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("table.fieldType")}</Label>
              <FieldTypeSelect
                value={currentField?.type}
                onChange={handleChangeFieldType}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("table.fieldConfiguration.databaseColumn")}</Label>
              <div className="w-[180px] rounded border bg-muted px-2 py-1 text-sm text-muted-foreground">
                {currentField.table_column_name}
              </div>
            </div>
          </div>

          <Editor uiColumn={currentField} onPropertyChange={onPropertyChange} />

          {!isView && (
            <div className="flex-none">
              <hr />
              {currentField.table_column_name !== "title" && (
                <FieldDelete
                  field={currentField}
                  deleteField={handleDeleteField}
                >
                  <CommonMenuItem>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("table.deleteField")}
                  </CommonMenuItem>
                </FieldDelete>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
