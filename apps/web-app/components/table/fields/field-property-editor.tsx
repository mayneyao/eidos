import React, { useContext } from "react"
import type { FieldType } from "@/packages/core/fields/const"
import type { IField } from "@/packages/core/types/IField"
import { useClickAway } from "ahooks"
import { DatabaseIcon, Trash2, XIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { CommonMenuItem } from "@/components/common-menu-item"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"

import { TableContext } from "../hooks"
import { useTableStore } from "../table-store-provider"
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
    useTableStore()
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
      className={cn(
        "absolute right-0 top-0 h-full w-[280px] border-l bg-popover shadow-xl",
        "animate-in fade-in slide-in-from-right-2 duration-150"
      )}
      ref={ref}
    >
      {currentField && (
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex-none border-b bg-muted/30 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-semibold text-foreground truncate">
                  {t("table.fieldConfiguration.editField")}
                </h3>
              </div>
              <button
                onClick={() => setIsFieldPropertiesEditorOpen(false)}
                className={cn(
                  "ml-2 p-1 rounded-md shrink-0",
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-accent transition-colors"
                )}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col h-full p-3 space-y-3">
              {/* Basic Info Section */}
              <div className="space-y-2.5">
                {/* Field Name */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-foreground">
                    {t("common.name")}
                  </Label>
                  <FieldNameEdit
                    field={currentField}
                    tableName={tableName}
                    databaseName={databaseName}
                  />
                </div>

                {/* Field Type */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-foreground">
                    {t("table.fieldType")}
                  </Label>
                  <FieldTypeSelect
                    value={currentField?.type as FieldType}
                    onChange={handleChangeFieldType}
                  />
                </div>

                {/* Database Column */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-foreground flex items-center gap-1">
                    <DatabaseIcon className="h-3 w-3 text-muted-foreground" />
                    {t("table.fieldConfiguration.databaseColumn")}
                  </Label>
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 border border-muted-foreground/10">
                    <code className="text-[11px] font-mono text-muted-foreground truncate">
                      {currentField.table_column_name}
                    </code>
                  </div>
                </div>
              </div>

              {/* Property Editor */}
              <Editor
                uiColumn={currentField}
                onPropertyChange={onPropertyChange}
              />
            </div>
          </div>

          {/* Footer - Delete Action */}
          {!isView && (
            <>
              <Separator />
              <div className="flex-none p-3 bg-muted/30">
                {currentField.table_column_name !== "title" && (
                  <FieldDelete
                    field={currentField}
                    deleteField={handleDeleteField}
                  >
                    <CommonMenuItem
                      variant="destructive"
                      className="w-full justify-center text-xs"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {t("table.deleteField")}
                    </CommonMenuItem>
                  </FieldDelete>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
