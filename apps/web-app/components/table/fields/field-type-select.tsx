import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { useTranslation } from "react-i18next"

import { FieldType } from "@/packages/core/fields/const"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { FieldIcon } from "@/components/table/fields/field-icon"

// Basic fields
const basicFields = [
  { value: FieldType.Text, label: "table.field.text" },
  { value: FieldType.Number, label: "table.field.number" },
  { value: FieldType.Select, label: "table.field.select" },
  { value: FieldType.MultiSelect, label: "table.field.multiSelect" },
  { value: FieldType.Checkbox, label: "table.field.checkbox" },
  { value: FieldType.Rating, label: "table.field.rating" },
  { value: FieldType.URL, label: "table.field.url" },
  { value: FieldType.Date, label: "table.field.date" },
  { value: FieldType.File, label: "table.field.file" },
]

// Advanced fields
const advancedFields = [
  { value: FieldType.Formula, label: "table.field.formula" },
  { value: FieldType.Link, label: "table.field.link" },
  { value: FieldType.Lookup, label: "table.field.lookup" },
]

// System fields (read-only)
const systemFields = [
  { value: FieldType.Title, label: "table.field.title" },
  { value: FieldType.CreatedTime, label: "table.field.createdTime" },
  { value: FieldType.LastEditedTime, label: "table.field.lastEditedTime" },
  { value: FieldType.CreatedBy, label: "table.field.createdBy" },
  { value: FieldType.LastEditedBy, label: "table.field.lastEditedBy" },
]

const allFields = [...basicFields, ...advancedFields, ...systemFields]

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
  const [open, setOpen] = React.useState(false)
  const { t } = useTranslation()

  const canBeSelected = basicFields.some((field) => field.value === value)
  const selectedField = allFields.find((field) => field.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={!canBeSelected}
          className={cn(
            "h-7 w-full justify-between px-2.5 py-1 text-xs",
            className
          )}
        >
          {selectedField ? (
            <div className="flex items-center gap-1.5">
              <FieldIcon type={value} />
              <span className="truncate">{t(selectedField.label)}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {t("table.field.selectField")}
            </span>
          )}
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="click-outside-ignore w-[220px] p-0">
        <Command>
          <CommandInput
            placeholder={t("table.field.searchField")}
            className="h-8 text-xs"
          />
          <CommandEmpty className="text-xs py-2">
            {t("table.field.noFieldFound")}
          </CommandEmpty>
          <CommandList className="max-h-[280px]">
            {/* Basic Fields */}
            <CommandGroup
              heading={t("table.fieldCategories.basic")}
              className="text-[10px] uppercase tracking-wider"
            >
              {basicFields.map((field) => (
                <CommandItem
                  key={field.value}
                  value={field.value}
                  onSelect={() => {
                    if (value !== field.value) {
                      onChange(field.value)
                    }
                    setOpen(false)
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer"
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      value === field.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <FieldIcon type={field.value} />
                  <span className="truncate">{t(field.label)}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {/* Advanced Fields */}
            <CommandGroup
              heading={t("table.fieldCategories.advanced")}
              className="text-[10px] uppercase tracking-wider border-t"
            >
              {advancedFields.map((field) => (
                <CommandItem
                  key={field.value}
                  value={field.value}
                  onSelect={() => {
                    if (value !== field.value) {
                      onChange(field.value)
                    }
                    setOpen(false)
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer"
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      value === field.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <FieldIcon type={field.value} />
                  <span className="truncate">{t(field.label)}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {/* System Fields (read-only display) */}
            <CommandGroup
              heading={t("table.fieldCategories.system")}
              className="text-[10px] uppercase tracking-wider border-t"
            >
              {systemFields.map((field) => (
                <CommandItem
                  key={field.value}
                  value={field.value}
                  disabled
                  className="flex items-center gap-2 px-2 py-1.5 text-xs opacity-50"
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      value === field.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <FieldIcon type={field.value} />
                  <span className="truncate">{t(field.label)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
