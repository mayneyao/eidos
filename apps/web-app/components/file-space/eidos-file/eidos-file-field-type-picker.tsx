import type { CreateEidosFileFieldInput } from "@eidos.space/eidos-file"
import {
  Baseline,
  CalendarDays,
  CheckSquare,
  Clock3,
  Hash,
  ImageIcon,
  Link,
  Link2,
  Sigma,
  Star,
  Tag,
  Tags,
  TextSearch,
} from "lucide-react"

import {
  FieldTypePicker,
  type FieldTypePickerGroup,
} from "@/components/table/fields/field-type-picker"

export type EidosFileCreatableFieldType = CreateEidosFileFieldInput["type"]

export const EIDOS_FILE_FIELD_TYPE_GROUPS: FieldTypePickerGroup<EidosFileCreatableFieldType>[] =
  [
    {
      label: "Basic",
      options: [
        {
          value: "text",
          label: "Text",
          description: "Free-form text content",
          keywords: ["string"],
          icon: <Baseline className="h-4 w-4" />,
        },
        {
          value: "number",
          label: "Number",
          description: "Values, currency, percent, or progress bars",
          keywords: ["numeric", "currency", "percent"],
          icon: <Hash className="h-4 w-4" />,
        },
        {
          value: "select",
          label: "Select",
          description: "Choose one predefined option",
          keywords: ["single choice", "status"],
          icon: <Tag className="h-4 w-4" />,
        },
        {
          value: "multi-select",
          label: "Multi-select",
          description: "Choose multiple predefined options",
          keywords: ["multiple choice", "tags"],
          icon: <Tags className="h-4 w-4" />,
        },
        {
          value: "checkbox",
          label: "Checkbox",
          description: "A true or false value",
          keywords: ["boolean", "done"],
          icon: <CheckSquare className="h-4 w-4" />,
        },
        {
          value: "rating",
          label: "Rating",
          description: "A five-star score",
          keywords: ["stars", "score"],
          icon: <Star className="h-4 w-4" />,
        },
        {
          value: "url",
          label: "URL",
          description: "A clickable web address",
          keywords: ["website", "link"],
          icon: <Link2 className="h-4 w-4" />,
        },
        {
          value: "date",
          label: "Date",
          description: "A calendar date",
          keywords: ["calendar", "day"],
          icon: <CalendarDays className="h-4 w-4" />,
        },
        {
          value: "datetime",
          label: "Date & time",
          description: "A calendar date with time",
          keywords: ["timestamp", "calendar"],
          icon: <Clock3 className="h-4 w-4" />,
        },
        {
          value: "file",
          label: "File",
          description: "Space-relative files and images",
          keywords: ["attachment", "asset", "image"],
          icon: <ImageIcon className="h-4 w-4" />,
        },
      ],
    },
    {
      label: "Advanced",
      options: [
        {
          value: "formula",
          label: "Formula",
          description: "Calculate a value from other fields",
          keywords: ["expression", "computed"],
          icon: <Sigma className="h-4 w-4" />,
        },
        {
          value: "link",
          label: "Relation",
          description: "Connect records in another table",
          keywords: ["link", "reference"],
          icon: <Link className="h-4 w-4" />,
        },
        {
          value: "lookup",
          label: "Lookup / rollup",
          description: "Read or aggregate values from related records",
          keywords: ["aggregate", "relation"],
          icon: <TextSearch className="h-4 w-4" />,
        },
      ],
    },
  ]

export function EidosFileFieldTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: EidosFileCreatableFieldType
  onChange: (value: EidosFileCreatableFieldType) => void
  disabled: boolean
}) {
  return (
    <FieldTypePicker
      value={value}
      groups={EIDOS_FILE_FIELD_TYPE_GROUPS}
      onChange={onChange}
      disabled={disabled}
      ariaLabel="Field type"
      searchPlaceholder="Search field types…"
      searchAriaLabel="Search field types"
      emptyLabel="No matching field type."
      contentClassName="w-[340px]"
    />
  )
}
