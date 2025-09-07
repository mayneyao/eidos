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
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { FieldIcon } from "@/components/table/fields/field-icon"

// for now only support these fields
const fields = [
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

const readonlyFields = [
  { value: FieldType.Title, label: "table.field.title" },
  { value: FieldType.Formula, label: "table.field.formula" },
  { value: FieldType.Link, label: "table.field.link" },
  { value: FieldType.Lookup, label: "table.field.lookup" },
  { value: FieldType.CreatedTime, label: "table.field.createdTime" },
  { value: FieldType.LastEditedTime, label: "table.field.lastEditedTime" },
  { value: FieldType.CreatedBy, label: "table.field.createdBy" },
  { value: FieldType.LastEditedBy, label: "table.field.lastEditedBy" },
]

interface IFieldTypeSelectProps {
  value: FieldType
  onChange: (value: FieldType) => void
}

export function FieldTypeSelect({ value, onChange }: IFieldTypeSelectProps) {
  const [open, setOpen] = React.useState(false)
  const { t } = useTranslation()

  const canBeSelected = fields.some((field) => field.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={!canBeSelected}
          className={cn("h-7 w-[180px] justify-between px-2 py-1 text-xs")}
        >
          {value ? (
            <div className="flex items-center gap-1.5">
              <FieldIcon type={value} />
              {t(
                [...fields, ...readonlyFields].find(
                  (field) => field.value === value
                )?.label || ""
              )}
            </div>
          ) : (
            t("table.field.selectField")
          )}
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="click-outside-ignore w-[180px] p-0">
        <Command>
          <CommandInput placeholder={t("table.field.searchField")} />
          <CommandEmpty>{t("table.field.noFieldFound")}</CommandEmpty>
          <CommandGroup>
            {fields.map((field) => (
              <CommandItem
                key={field.value}
                value={field.value}
                onSelect={(currentValue) => {
                  value !== field.value && onChange(field.value)
                  setOpen(false)
                }}
                className="h-7 px-1.5 py-1"
              >
                <Check
                  className={cn(
                    "mr-1.5 h-3 w-3",
                    value === field.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex gap-1.5">
                  <FieldIcon type={field.value} />
                  {t(field.label)}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
