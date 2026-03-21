import * as React from "react"
import { FieldType } from "@/packages/core/fields/const"
import type { IField } from "@/packages/core/types/IField"
import { useClickAway } from "ahooks"
import {
  ArrowLeftIcon,
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

interface FieldTypeOption {
  name: string
  value: FieldType
  icon: React.ComponentType<{ className?: string }>
  description?: string
  category: "basic" | "advanced" | "system"
  disabled?: boolean
}

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
  const [isAnimating, setIsAnimating] = React.useState(false)
  const { tableName } = useTableContext()
  const ref = React.useRef<HTMLDivElement>(null)
  const { isAddFieldEditorOpen, setIsAddFieldEditorOpen } = useTableStore()

  // Reset animation state when currentField changes
  React.useEffect(() => {
    if (currentField) {
      // Small delay to ensure the DOM has updated before starting the animation
      const timer = setTimeout(() => {
        setIsAnimating(false)
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [currentField])

  const fieldTypes: FieldTypeOption[] = [
    // Basic fields
    {
      name: t("table.field.text"),
      value: FieldType.Text,
      icon: BaselineIcon,
      category: "basic",
      description: t("table.fieldTypeDescriptions.text"),
    },
    {
      name: t("table.field.number"),
      value: FieldType.Number,
      icon: HashIcon,
      category: "basic",
      description: t("table.fieldTypeDescriptions.number"),
    },
    {
      name: t("table.field.select"),
      value: FieldType.Select,
      icon: TagIcon,
      category: "basic",
      description: t("table.fieldTypeDescriptions.select"),
    },
    {
      name: t("table.field.multiSelect"),
      value: FieldType.MultiSelect,
      icon: TagsIcon,
      category: "basic",
      description: t("table.fieldTypeDescriptions.multiSelect"),
    },
    {
      name: t("table.field.checkbox"),
      value: FieldType.Checkbox,
      icon: CheckSquareIcon,
      category: "basic",
      description: t("table.fieldTypeDescriptions.checkbox"),
    },
    {
      name: t("table.field.rating"),
      value: FieldType.Rating,
      icon: StarIcon,
      category: "basic",
      description: t("table.fieldTypeDescriptions.rating"),
    },
    {
      name: t("table.field.url"),
      value: FieldType.URL,
      icon: Link2Icon,
      category: "basic",
      description: t("table.fieldTypeDescriptions.url"),
    },
    {
      name: t("table.field.date"),
      value: FieldType.Date,
      icon: CalendarDaysIcon,
      category: "basic",
      description: t("table.fieldTypeDescriptions.date"),
    },
    {
      name: t("table.field.file"),
      value: FieldType.File,
      icon: ImageIcon,
      category: "basic",
      description: t("table.fieldTypeDescriptions.file"),
    },
    // Advanced fields
    {
      name: t("table.field.formula"),
      value: FieldType.Formula,
      icon: SigmaIcon,
      category: "advanced",
      description: t("table.fieldTypeDescriptions.formula"),
    },
    {
      name: t("table.field.link"),
      value: FieldType.Link,
      icon: LinkIcon,
      category: "advanced",
      description: t("table.fieldTypeDescriptions.link"),
    },
    {
      name: t("table.field.lookup"),
      value: FieldType.Lookup,
      icon: TextSearchIcon,
      category: "advanced",
      description: t("table.fieldTypeDescriptions.lookup"),
    },
    // System fields
    {
      name: t("table.field.createdTime"),
      value: FieldType.CreatedTime,
      icon: Clock3Icon,
      category: "system",
      description: t("table.fieldTypeDescriptions.createdTime"),
    },
    {
      name: t("table.field.lastEditedTime"),
      value: FieldType.LastEditedTime,
      icon: Clock3Icon,
      category: "system",
      description: t("table.fieldTypeDescriptions.lastEditedTime"),
    },
    {
      name: t("table.field.createdBy"),
      value: FieldType.CreatedBy,
      icon: UserIcon,
      category: "system",
      description: t("table.fieldTypeDescriptions.createdBy"),
    },
    {
      name: t("table.field.lastEditedBy"),
      value: FieldType.LastEditedBy,
      icon: UserIcon,
      category: "system",
      description: t("table.fieldTypeDescriptions.lastEditedBy"),
    },
  ]

  const basicFields = fieldTypes.filter((f) => f.category === "basic")
  const advancedFields = fieldTypes.filter((f) => f.category === "advanced")
  const systemFields = fieldTypes.filter((f) => f.category === "system")

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

  const handleCreateField = (field: FieldTypeOption) => {
    setIsAnimating(true)
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

  const handleBackToTypeSelection = () => {
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentField(undefined)
      setIsAnimating(false)
    }, 150)
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

      // Ensure field type is a valid FieldType enum value
      const fieldType = currentField.type as FieldType

      addField(
        currentField.name,
        fieldType,
        currentField.property,
        currentField.table_column_name
      )
        .then(() => {
          if (insertPosition !== undefined && onFieldCreated) {
            onFieldCreated(currentField.table_column_name, insertPosition)
          }

          setIsAddFieldEditorOpen(false)
          setCurrentField(undefined)
        })
        .catch((error) => {
          console.error("Failed to add field:", error)
        })
    }
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
      isAddFieldEditorOpen && setIsAddFieldEditorOpen(false)
    },
    ref,
    ["mousedown", "touchstart"]
  )

  const renderFieldTypeGroup = (
    title: string,
    fields: FieldTypeOption[],
    showDivider: boolean = false
  ) => (
    <div className={cn(showDivider && "mt-2 pt-2 border-t")}>
      <h3 className="px-3 mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-1 px-2">
        {fields.map((field) => {
          const Icon = field.icon
          return (
            <button
              key={`${field.name}-${field.value}`}
              onClick={() => handleCreateField(field)}
              disabled={field.disabled}
              title={field.description}
              className={cn(
                "flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-all duration-150",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:ring-1 focus:ring-ring",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium truncate">{field.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div
      ref={ref}
      className={cn(
        "absolute right-0 top-0 z-50 h-full w-[280px] bg-popover shadow-xl border-l"
      )}
    >
      {currentField ? (
        <div
          className={cn(
            "flex flex-col h-full",
            isAnimating && "opacity-0",
            !isAnimating &&
              "opacity-100 animate-in fade-in slide-in-from-right-2 duration-150"
          )}
        >
          {/* Header */}
          <div className="flex-none border-b bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 -ml-1"
                onClick={handleBackToTypeSelection}
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
              </Button>
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-foreground truncate">
                  {t("table.fieldConfiguration.title")}
                </h3>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-3">
              {/* Field Name Section */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="fieldName"
                  className="text-xs font-medium text-foreground"
                >
                  {t("table.fieldConfiguration.fieldName")}
                </Label>
                <Input
                  id="fieldName"
                  value={currentField.name}
                  onChange={(e) => {
                    const newFieldName = e.target.value
                    const generatedColumnName =
                      generateColumnNameFromFieldName(newFieldName)
                    setCurrentField({
                      ...currentField,
                      name: newFieldName,
                      table_column_name: generatedColumnName,
                    })
                  }}
                  className="h-7 text-xs"
                  placeholder={t(
                    "table.fieldConfiguration.fieldNamePlaceholder"
                  )}
                />
              </div>

              {/* Database Column Section */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="columnName"
                  className="text-xs font-medium text-foreground"
                >
                  {t("table.fieldConfiguration.databaseColumn")}
                </Label>
                <div className="relative">
                  <Input
                    id="columnName"
                    value={currentField.table_column_name}
                    onChange={(e) => {
                      setCurrentField({
                        ...currentField,
                        table_column_name: e.target.value,
                      })
                    }}
                    className={cn(
                      "h-7 text-xs font-mono pr-8",
                      "bg-muted/50 border-muted-foreground/20"
                    )}
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
                        <span className="absolute right-2 top-1/2 -translate-y-1/2">
                          <svg
                            className="h-3.5 w-3.5 text-green-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </span>
                      )
                    }
                    return null
                  })()}
                </div>
                {(() => {
                  const validation = validateSqliteColumnName(
                    currentField.table_column_name,
                    uiColumns.map((col) => col.table_column_name),
                    EIDOS_RESERVED_FIELDS
                  )
                  if (!validation.isValid) {
                    return (
                      <p className="text-[11px] text-destructive flex items-center gap-1">
                        <svg
                          className="h-3 w-3 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                          />
                        </svg>
                        {validation.error}
                      </p>
                    )
                  }
                  return (
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {t("table.fieldConfiguration.databaseColumnDescription")}
                    </p>
                  )
                })()}
              </div>

              {/* Type-specific Property Editor */}
              {(currentField.type === FieldType.Link ||
                currentField.type === FieldType.Lookup) && (
                <div className="pt-1">
                  <Editor
                    uiColumn={currentField!}
                    onPropertyChange={handleUpdateField}
                    isCreateNew
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex-none p-3 border-t bg-muted/30">
            <Button
              onClick={handleSaveField}
              className="w-full h-7 text-xs"
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
        <div
          className={cn(
            "flex flex-col h-full",
            isAnimating && "opacity-0",
            !isAnimating && "opacity-100 animate-in fade-in duration-150"
          )}
          onAnimationEnd={() => setIsAnimating(false)}
        >
          {/* Header */}
          <div className="flex-none px-3 py-2 border-b bg-muted/30">
            <h2 className="text-xs font-semibold text-foreground">
              {t("table.field.addField")}
            </h2>
          </div>

          {/* Field Type Selection */}
          <div className="flex-1 overflow-y-auto py-2">
            {renderFieldTypeGroup(
              t("table.fieldCategories.basic"),
              basicFields,
              false
            )}
            {renderFieldTypeGroup(
              t("table.fieldCategories.advanced"),
              advancedFields,
              true
            )}
            {renderFieldTypeGroup(
              t("table.fieldCategories.system"),
              systemFields,
              true
            )}
          </div>
        </div>
      )}
    </div>
  )
}
