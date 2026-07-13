import { useTranslation } from "react-i18next"

import { FieldType } from "@/packages/core/fields/const"
import { FieldIcon } from "@/components/table/fields/field-icon"
import {
  FieldTypePicker,
  type FieldTypePickerGroup,
} from "@/components/table/fields/field-type-picker"

interface FieldDefinition {
  value: FieldType
  label: string
  description?: string
}

const basicFields: FieldDefinition[] = [
  {
    value: FieldType.Text,
    label: "table.field.text",
    description: "table.fieldTypeDescriptions.text",
  },
  {
    value: FieldType.Number,
    label: "table.field.number",
    description: "table.fieldTypeDescriptions.number",
  },
  {
    value: FieldType.Select,
    label: "table.field.select",
    description: "table.fieldTypeDescriptions.select",
  },
  {
    value: FieldType.MultiSelect,
    label: "table.field.multiSelect",
    description: "table.fieldTypeDescriptions.multiSelect",
  },
  {
    value: FieldType.Checkbox,
    label: "table.field.checkbox",
    description: "table.fieldTypeDescriptions.checkbox",
  },
  {
    value: FieldType.Rating,
    label: "table.field.rating",
    description: "table.fieldTypeDescriptions.rating",
  },
  {
    value: FieldType.URL,
    label: "table.field.url",
    description: "table.fieldTypeDescriptions.url",
  },
  {
    value: FieldType.Date,
    label: "table.field.date",
    description: "table.fieldTypeDescriptions.date",
  },
  {
    value: FieldType.File,
    label: "table.field.file",
    description: "table.fieldTypeDescriptions.file",
  },
]

const advancedFields: FieldDefinition[] = [
  {
    value: FieldType.Formula,
    label: "table.field.formula",
    description: "table.fieldTypeDescriptions.formula",
  },
  {
    value: FieldType.Link,
    label: "table.field.link",
    description: "table.fieldTypeDescriptions.link",
  },
  {
    value: FieldType.Lookup,
    label: "table.field.lookup",
    description: "table.fieldTypeDescriptions.lookup",
  },
]

const systemFields: FieldDefinition[] = [
  { value: FieldType.Title, label: "table.field.title" },
  {
    value: FieldType.CreatedTime,
    label: "table.field.createdTime",
    description: "table.fieldTypeDescriptions.createdTime",
  },
  {
    value: FieldType.LastEditedTime,
    label: "table.field.lastEditedTime",
    description: "table.fieldTypeDescriptions.lastEditedTime",
  },
  {
    value: FieldType.CreatedBy,
    label: "table.field.createdBy",
    description: "table.fieldTypeDescriptions.createdBy",
  },
  {
    value: FieldType.LastEditedBy,
    label: "table.field.lastEditedBy",
    description: "table.fieldTypeDescriptions.lastEditedBy",
  },
]

interface IFieldTypeSelectProps {
  value: FieldType
  onChange: (value: FieldType) => void
  className?: string
}

export function FieldTypeSelect({
  value,
  onChange,
  className,
}: IFieldTypeSelectProps) {
  const { t } = useTranslation()
  const canBeSelected = basicFields.some((field) => field.value === value)
  const makeOptions = (
    fields: FieldDefinition[],
    disabled = false
  ): FieldTypePickerGroup<FieldType>["options"] =>
    fields.map((field) => ({
      value: field.value,
      label: t(field.label),
      description: field.description ? t(field.description) : undefined,
      icon: <FieldIcon type={field.value} className="text-muted-foreground" />,
      disabled,
    }))
  const groups: FieldTypePickerGroup<FieldType>[] = [
    {
      label: t("table.fieldCategories.basic"),
      options: makeOptions(basicFields),
    },
    {
      label: t("table.fieldCategories.advanced"),
      options: makeOptions(advancedFields),
    },
    {
      label: t("table.fieldCategories.system"),
      options: makeOptions(systemFields, true),
    },
  ]

  return (
    <FieldTypePicker
      value={value}
      groups={groups}
      onChange={onChange}
      disabled={!canBeSelected}
      ariaLabel={t("table.field.selectField")}
      searchPlaceholder={t("table.field.searchField")}
      searchAriaLabel={t("table.field.searchField")}
      emptyLabel={t("table.field.noFieldFound")}
      triggerClassName={className}
      contentClassName="click-outside-ignore w-[280px]"
    />
  )
}
