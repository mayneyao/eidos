import { useState, type ComponentType } from "react"
import type { CreateEidosFileFieldInput } from "@eidos.space/eidos-file"
import {
  Baseline,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
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

import { useEidosFileUI } from "./context"
import { cn } from "./lib/cn"
import { EidosFileCommandCombobox } from "./eidos-file-command-combobox"
import { CommandGroup, CommandItem } from "./ui/primitives"

export type EidosFileCreatableFieldType = CreateEidosFileFieldInput["type"]

const EIDOS_FILE_FIELD_TYPE_ICONS = {
  text: Baseline,
  number: Hash,
  integer: Hash,
  select: Tag,
  "multi-select": Tags,
  checkbox: CheckSquare,
  rating: Star,
  url: Link2,
  date: CalendarDays,
  datetime: Clock3,
  file: ImageIcon,
  formula: Sigma,
  relation: Link,
  lookup: TextSearch,
} satisfies Record<
  EidosFileCreatableFieldType,
  ComponentType<{ className?: string }>
>

/** Shared visual identity for every field-type choice and selected value. */
export function EidosFileFieldTypeIcon({
  type,
  className,
}: {
  type: EidosFileCreatableFieldType
  className?: string
}) {
  const Icon = EIDOS_FILE_FIELD_TYPE_ICONS[type]
  return (
    <Icon
      aria-hidden="true"
      data-eidos-file-field-type-icon={type}
      className={className}
    />
  )
}

interface EidosFileFieldTypeOption {
  value: EidosFileCreatableFieldType
  label: string
  description: string
  keywords: string[]
  icon: ComponentType<{ className?: string }>
}

interface EidosFileFieldTypeGroup {
  label: string
  options: EidosFileFieldTypeOption[]
}

export const EIDOS_FILE_FIELD_TYPE_GROUPS: EidosFileFieldTypeGroup[] = [
  {
    label: "Basic",
    options: [
      {
        value: "text",
        label: "Text",
        description: "Free-form text content",
        keywords: ["string"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.text,
      },
      {
        value: "number",
        label: "Number",
        description: "Values, currency, percent, or progress",
        keywords: ["numeric", "currency", "percent"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.number,
      },
      {
        value: "integer",
        label: "Integer",
        description: "A whole signed 64-bit value",
        keywords: ["whole number", "int64"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.integer,
      },
      {
        value: "select",
        label: "Select",
        description: "Choose one predefined option",
        keywords: ["single choice", "status"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.select,
      },
      {
        value: "multi-select",
        label: "Multi-select",
        description: "Choose multiple predefined options",
        keywords: ["multiple choice", "tags"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS["multi-select"],
      },
      {
        value: "checkbox",
        label: "Checkbox",
        description: "A true or false value",
        keywords: ["boolean", "done"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.checkbox,
      },
      {
        value: "rating",
        label: "Rating",
        description: "A five-star score",
        keywords: ["stars", "score"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.rating,
      },
      {
        value: "url",
        label: "URL",
        description: "A clickable web address",
        keywords: ["website", "link"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.url,
      },
      {
        value: "date",
        label: "Date",
        description: "A calendar date",
        keywords: ["calendar", "day"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.date,
      },
      {
        value: "datetime",
        label: "Date & time",
        description: "A calendar date with time",
        keywords: ["timestamp", "calendar"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.datetime,
      },
      {
        value: "file",
        label: "File",
        description: "Portable file and image references",
        keywords: ["attachment", "asset", "image"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.file,
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
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.formula,
      },
      {
        value: "relation",
        label: "Relation",
        description: "Connect records in another table",
        keywords: ["link", "reference"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.relation,
      },
      {
        value: "lookup",
        label: "Lookup / rollup",
        description: "Read or aggregate related values",
        keywords: ["aggregate", "relation"],
        icon: EIDOS_FILE_FIELD_TYPE_ICONS.lookup,
      },
    ],
  },
]

function selectedOption(value: EidosFileCreatableFieldType) {
  return EIDOS_FILE_FIELD_TYPE_GROUPS.flatMap((group) => group.options).find(
    (option) => option.value === value
  )
}

export function EidosFileFieldTypePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: EidosFileCreatableFieldType
  onChange: (value: EidosFileCreatableFieldType) => void
  disabled?: boolean
}) {
  const { translate: t } = useEidosFileUI()
  const [open, setOpen] = useState(false)
  const selected =
    selectedOption(value) ?? EIDOS_FILE_FIELD_TYPE_GROUPS[0].options[0]

  return (
    <EidosFileCommandCombobox
      open={open}
      onOpenChange={setOpen}
      searchPlaceholder={t("Search field types…")}
      emptyText={t("No matching field type.")}
      filter={(value, search, keywords) =>
        [value, ...(keywords ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(search.trim().toLowerCase())
          ? 1
          : 0
      }
      contentClassName="w-[340px] max-w-[calc(100vw-24px)]"
      listClassName="max-h-80"
      trigger={
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          data-eidos-file-field-type-trigger={value}
          disabled={disabled}
          className="flex h-9 w-full items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-left text-xs shadow-none outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          aria-label={t("Field type")}
        >
          <EidosFileFieldTypeIcon
            type={selected.value}
            className="h-4 w-4 text-muted-foreground"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {t(selected.label)}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {t(selected.description)}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      }
    >
      {EIDOS_FILE_FIELD_TYPE_GROUPS.map((group) => (
        <CommandGroup
          key={group.label}
          heading={
            <span className="block px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t(group.label)}
            </span>
          }
        >
          {group.options.map((option) => {
            const active = option.value === value
            return (
              <CommandItem
                key={option.value}
                value={option.value}
                keywords={[
                  option.label,
                  t(option.label),
                  option.description,
                  t(option.description),
                  ...option.keywords,
                ]}
                data-eidos-file-field-type={option.value}
                onSelect={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  "items-start gap-2.5 px-2 py-2",
                  active && "bg-accent"
                )}
              >
                <EidosFileFieldTypeIcon
                  type={option.value}
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">
                    {t(option.label)}
                  </span>
                  <span className="block text-[10px] leading-4 text-muted-foreground">
                    {t(option.description)}
                  </span>
                </span>
                {active ? <Check className="mt-0.5 h-3.5 w-3.5" /> : null}
              </CommandItem>
            )
          })}
        </CommandGroup>
      ))}
    </EidosFileCommandCombobox>
  )
}
