import { useState } from "react"
import { ChevronsUpDown } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { IField } from "@/packages/core/types/IField"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { makeHeaderIcons } from "@/components/table/fields/header-icons"

import { Button } from "../../ui/button"

const icons = makeHeaderIcons(14)

interface IFieldSelectorProps {
  fields: IField[]
  value?: string
  onChange: (value: string) => void
  className?: string
  excludeValues?: string[]
}

export const FieldSelector = ({
  fields,
  value,
  onChange,
  className,
  excludeValues = [],
}: IFieldSelectorProps) => {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  const handleSelect = (field: IField) => {
    onChange(field.table_column_name)
    setOpen(false)
  }

  // Filter out excluded fields
  const availableFields = fields.filter(
    (field) => !excludeValues.includes(field.table_column_name)
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          variant="outline"
          role="combobox"
          className={`h-7 w-[180px] justify-between px-2 py-1 text-xs ${className || ""}`}
        >
          <div className="max-w-[130px] truncate">
            {value
              ? fields.find((field) => field.table_column_name === value)
                  ?.name || t("table.field.untitledField")
              : t("table.field.selectField")}
          </div>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="click-outside-ignore w-full p-0">
        <Command>
          <CommandInput placeholder={t("table.field.searchField")} />
          <CommandEmpty>{t("table.field.noFieldFound")}</CommandEmpty>
          <CommandList>
            {availableFields.map((field) => {
              const iconSvgString = icons[field.type]({
                bgColor: "#aaa",
                fgColor: "currentColor",
              })
              return (
                <CommandItem
                  key={field.table_column_name}
                  value={field.name}
                  onSelect={() => handleSelect(field)}
                  className="h-7 px-2 py-1 text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      dangerouslySetInnerHTML={{
                        __html: iconSvgString,
                      }}
                    ></span>
                    <p className="max-w-[130px] truncate" title={field.name}>
                      {field.name || t("table.field.untitledField")}
                    </p>
                  </span>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
