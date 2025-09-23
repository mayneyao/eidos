import * as React from "react"
import { FieldType } from "@/packages/core/fields/const"
import type { IField } from "@/packages/core/types/IField"
import { useClickAway } from "ahooks"
import {
  BaselineIcon,
  CalendarDaysIcon,
  CheckSquareIcon,
  Clock3Icon,
  HashIcon,
  ImageIcon,
  Link2Icon,
  LinkIcon,
  SigmaIcon,
  StarIcon,
  TagIcon,
  TagsIcon,
  TextSearchIcon,
  UserIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  cn,
  generateColumnNameFromFieldName,
  generateValidSqliteColumnName,
  validateSqliteColumnName,
  EIDOS_RESERVED_FIELDS,
} from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { useTableStore } from "../table-store-provider"
import {
  NotImplementEditor,
  PropertyEditorTypeMap,
} from "./field-property-editor"
import { useTableContext } from "../hooks"

export function FieldAppendPanel({
  addField,
  uiColumns,
  insertPosition,
  onFieldCreated,
}: {
  addField: (
    fieldName: string,
    fieldType: FieldType,
    property?: any,
    tableColumnName?: string
  ) => Promise<void>
  uiColumns: IField[]
  insertPosition?: number
  onFieldCreated?: (fieldName: string, position: number) => void
}) {
  const { t } = useTranslation()
  const [currentField, setCurrentField] = React.useState<IField>()
  const { tableName } = useTableContext()
  const ref = React.useRef<HTMLDivElement>(null)
  const { isAddFieldEditorOpen, setIsAddFieldEditorOpen } = useTableStore()
  const fieldTypes = [
    { name: t("table.field.text"), value: FieldType.Text, icon: BaselineIcon },
    { name: t("table.field.number"), value: FieldType.Number, icon: HashIcon },
    { name: t("table.field.select"), value: FieldType.Select, icon: TagIcon },
    {
      name: t("table.field.multiSelect"),
      value: FieldType.MultiSelect,
      icon: TagsIcon,
    },
    {
      name: t("table.field.checkbox"),
      value: FieldType.Checkbox,
      icon: CheckSquareIcon,
    },
    { name: t("table.field.rating"), value: FieldType.Rating, icon: StarIcon },
    { name: t("table.field.url"), value: FieldType.URL, icon: Link2Icon },
    {
      name: t("table.field.date"),
      value: FieldType.Date,
      icon: CalendarDaysIcon,
    },
    { name: t("table.field.file"), value: FieldType.File, icon: ImageIcon },
    {
      name: t("table.field.formula"),
      value: FieldType.Formula,
      icon: SigmaIcon,
    },
    {
      name: t("table.field.link"),
      value: FieldType.Link,
      icon: LinkIcon,
      disable: false,
    },
    {
      name: t("table.field.lookup"),
      value: FieldType.Lookup,
      icon: TextSearchIcon,
    },
    {
      name: t("table.field.createdTime"),
      value: FieldType.CreatedTime,
      icon: Clock3Icon,
    },
    {
      name: t("table.field.lastEditedTime"),
      value: FieldType.LastEditedTime,
      icon: Clock3Icon,
    },
    {
      name: t("table.field.createdBy"),
      value: FieldType.CreatedBy,
      icon: UserIcon,
    },
    {
      name: t("table.field.lastEditedBy"),
      value: FieldType.LastEditedBy,
      icon: UserIcon,
    },
  ]

  const handleUpdateField = (draftFieldProperty: any) => {
    currentField &&
      setCurrentField({
        ...currentField,
        property: {
          ...currentField?.property,
          ...draftFieldProperty,
        },
      })
  }

  const Editor =
    PropertyEditorTypeMap[currentField?.type ?? "select"] ?? NotImplementEditor

  const handleCreateField = (field: (typeof fieldTypes)[0]) => {
    // generate new field name, use field.name if it is not duplicated. otherwise, append a number
    let newFieldName = field.name
    if (uiColumns.some((col) => col.name === newFieldName)) {
      let i = 1
      while (uiColumns.some((col) => col.name === `${newFieldName} ${i}`)) {
        i++
      }
      newFieldName = `${newFieldName} ${i}`
    }
    // All fields now need to configure table_column_name first
    setCurrentField({
      name: newFieldName,
      type: field.value,
      table_column_name: generateColumnNameFromFieldName(
        newFieldName,
        uiColumns.map((col) => col.table_column_name)
      ),
      table_name: tableName!,
      property: {},
    })
  }

  const handleSaveField = () => {
    if (currentField) {
      // Validate column name before saving
      const columnNameValidation = validateSqliteColumnName(
        currentField.table_column_name,
        uiColumns.map((col) => col.table_column_name),
        EIDOS_RESERVED_FIELDS
      )
      if (!columnNameValidation.isValid) {
        console.error("Invalid column name:", columnNameValidation.error)
        return
      }

      addField(
        currentField.name,
        currentField.type,
        currentField.property,
        currentField.table_column_name
      ).then(() => {
        if (insertPosition !== undefined && onFieldCreated) {
          onFieldCreated(currentField.table_column_name, insertPosition)
        }

        setIsAddFieldEditorOpen(false)
        setCurrentField(undefined)
      })
    }
  }

  // useClickAway(
  //   () => {
  //     isAddFieldEditorOpen && setIsAddFieldEditorOpen(false)
  //   },
  //   ref,
  //   ["mousedown", "touchstart"]
  // )

  useClickAway(
    (e) => {
      const res = document.querySelectorAll(".click-outside-ignore")
      if (Array.from(res).some((node) => node.contains(e.target as Node))) {
        return
      }
      if (ref.current?.contains(e.target as Node)) {
        return
      }
      isAddFieldEditorOpen && setIsAddFieldEditorOpen(false)
    },
    ref,
    ["mousedown", "touchstart"]
  )

  return (
    <div
      ref={ref}
      className={cn(
        "absolute right-0 top-0 z-50 h-full w-[350px] bg-popover shadow-lg"
      )}
    >
      {currentField ? (
        <div className="flex flex-col h-full">
          {/* Field Basic Configuration */}
          <div className="flex-none p-4 border-b">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-foreground mb-1">
                {t("table.fieldConfiguration.title")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("table.fieldConfiguration.description")}
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  {t("table.fieldConfiguration.fieldName")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("table.fieldConfiguration.fieldNameDescription")}
                </p>
                <Input
                  value={currentField.name}
                  onChange={(e) => {
                    const newFieldName = e.target.value
                    // Generate table_column_name from field name
                    const generatedColumnName =
                      generateColumnNameFromFieldName(newFieldName)
                    setCurrentField({
                      ...currentField,
                      name: newFieldName,
                      table_column_name: generatedColumnName,
                    })
                  }}
                  className="w-full text-sm"
                  placeholder={t(
                    "table.fieldConfiguration.fieldNamePlaceholder"
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  {t("table.fieldConfiguration.databaseColumn")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("table.fieldConfiguration.databaseColumnDescription")}
                </p>
                <Input
                  value={currentField.table_column_name}
                  onChange={(e) => {
                    setCurrentField({
                      ...currentField,
                      table_column_name: e.target.value,
                    })
                  }}
                  className="w-full text-sm"
                  placeholder={t(
                    "table.fieldConfiguration.databaseColumnPlaceholder"
                  )}
                />
                {(() => {
                  const validation = validateSqliteColumnName(
                    currentField.table_column_name,
                    uiColumns.map((col) => col.table_column_name),
                    EIDOS_RESERVED_FIELDS
                  )
                  if (validation.isValid) {
                    return (
                      <span className="text-green-500 text-xs block">
                        {t("table.fieldConfiguration.validColumnName")}
                      </span>
                    )
                  } else {
                    return (
                      <span className="text-red-500 text-xs block">
                        {t("table.fieldConfiguration.errorPrefix")}{" "}
                        {validation.error}
                      </span>
                    )
                  }
                })()}
              </div>
            </div>
          </div>

          {(currentField.type === FieldType.Link ||
            currentField.type === FieldType.Lookup) && (
            <Editor
              uiColumn={currentField!}
              onPropertyChange={handleUpdateField}
              isCreateNew
            />
          )}
          <div className="flex-none p-2 border-t">
            <Button
              onClick={handleSaveField}
              className="w-full"
              disabled={
                !validateSqliteColumnName(
                  currentField.table_column_name,
                  uiColumns.map((col) => col.table_column_name),
                  EIDOS_RESERVED_FIELDS
                ).isValid
              }
            >
              {t("table.fieldConfiguration.createField")}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="relative px-6 text-lg font-semibold tracking-tight">
            {t("table.field.addField")}
          </h2>
          <div className="space-y-1 p-2">
            {fieldTypes.map((field, i) => {
              const Icon = field.icon
              return (
                <React.Fragment key={`${field.name}-${field.value}`}>
                  {[FieldType.Formula, FieldType.CreatedTime].includes(
                    field.value
                  ) && <hr />}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start font-normal"
                    onClick={(e) => {
                      handleCreateField(field)
                    }}
                    disabled={field.disable}
                  >
                    <Icon className="mr-1 h-5 w-5" />
                    {field.name}
                  </Button>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
