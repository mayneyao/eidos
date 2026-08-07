import { useMemo, useState, type ComponentType } from "react"
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
  Search,
  Sigma,
  Star,
  Tag,
  Tags,
  TextSearch,
} from "lucide-react"

import { useEidosFileUI } from "./context"
import { cn } from "./lib/cn"
import { Input, Popover, PopoverContent, PopoverTrigger } from "./ui/primitives"

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
  const [query, setQuery] = useState("")
  const selected =
    selectedOption(value) ?? EIDOS_FILE_FIELD_TYPE_GROUPS[0].options[0]
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return EIDOS_FILE_FIELD_TYPE_GROUPS
    return EIDOS_FILE_FIELD_TYPE_GROUPS.map((group) => ({
      ...group,
      options: group.options.filter((option) =>
        [
          option.label,
          t(option.label),
          option.description,
          t(option.description),
          ...option.keywords,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      ),
    })).filter((group) => group.options.length > 0)
  }, [query, t])

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQuery("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
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
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[340px] max-w-[calc(100vw-24px)] p-0"
      >
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            className="h-8 pl-8 text-xs"
            placeholder={t("Search field types…")}
            aria-label={t("Search field types")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {groups.length ? (
            groups.map((group) => (
              <section key={group.label} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t(group.label)}
                </p>
                {group.options.map((option) => {
                  const active = option.value === value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-eidos-file-field-type={option.value}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        active && "bg-accent"
                      )}
                      onClick={() => {
                        onChange(option.value)
                        setOpen(false)
                      }}
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
                    </button>
                  )
                })}
              </section>
            ))
          ) : (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              {t("No matching field type.")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
