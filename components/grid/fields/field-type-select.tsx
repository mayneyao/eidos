import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { FieldType } from "@/lib/fields/const"
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
import { FieldIcon } from "@/components/table/field-icon"

// for now only support these fields
const fields = [
  {
    value: FieldType.Text,
    label: "Text",
  },
  {
    value: FieldType.Number,
    label: "Number",
  },
  {
    value: FieldType.Select,
    label: "Select",
  },
  {
    value: FieldType.MultiSelect,
    label: "Multi-select",
  },
  {
    value: FieldType.Checkbox,
    label: "Checkbox",
  },
  {
    value: FieldType.Rating,
    label: "Rating",
  },
  {
    value: FieldType.URL,
    label: "URL",
  },
  {
    value: FieldType.Date,
    label: "Date",
  },
  {
    value: FieldType.File,
    label: "File",
  },
]

const readonlyFields = [
  {
    value: FieldType.Title,
    label: "Title",
  },
  {
    value: FieldType.Formula,
    label: "Formula",
  },
  {
    value: FieldType.Link,
    label: "Link",
  },
  {
    value: FieldType.Lookup,
    label: "Lookup",
  },
  {
    value: FieldType.CreatedTime,
    label: "Created Time",
  },
  {
    value: FieldType.LastEditedTime,
    label: "Last Edited Time",
  },
  {
    value: FieldType.CreatedBy,
    label: "Created By",
  },
  {
    value: FieldType.LastEditedBy,
    label: "Last Edited By",
  },
]

interface IFieldTypeSelectProps {
  value: FieldType
  onChange: (value: FieldType) => void
}

export function FieldTypeSelect({ value, onChange }: IFieldTypeSelectProps) {
  const [open, setOpen] = React.useState(false)

  const canBeSelected = fields.some((field) => field.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={!canBeSelected}
          className={cn("w-[200px] justify-between")}
        >
          {value ? (
            <div className="flex items-center gap-2">
              <FieldIcon type={value} />
              {
                [...fields, ...readonlyFields].find(
                  (field) => field.value === value
                )?.label
              }
            </div>
          ) : (
            "Select field..."
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="click-outside-ignore w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search field..." />
          <CommandEmpty>No field found.</CommandEmpty>
          <CommandGroup>
            {fields.map((field) => (
              <CommandItem
                key={field.value}
                value={field.value}
                onSelect={(currentValue) => {
                  value !== field.value && onChange(field.value)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === field.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex gap-2">
                  <FieldIcon type={field.value} />
                  {field.label}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
