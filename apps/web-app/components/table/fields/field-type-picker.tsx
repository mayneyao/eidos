import { useMemo, useState, type ReactNode } from "react"
import { Check, ChevronsUpDown } from "lucide-react"

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

function optionMatches<Value extends string>(
  option: FieldTypePickerOption<Value>,
  query: string
): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  return [
    option.value,
    option.label,
    option.description,
    ...(option.keywords ?? []),
  ]
    .filter(Boolean)
    .some((part) => part?.toLocaleLowerCase().includes(normalized))
}

export interface FieldTypePickerOption<Value extends string> {
  value: Value
  label: string
  description?: string
  keywords?: string[]
  icon: ReactNode
  disabled?: boolean
}

export interface FieldTypePickerGroup<Value extends string> {
  label: string
  options: FieldTypePickerOption<Value>[]
}

export function FieldTypePicker<Value extends string>({
  value,
  groups,
  onChange,
  disabled = false,
  ariaLabel = "Field type",
  searchPlaceholder = "Search field types…",
  searchAriaLabel = "Search field types",
  emptyLabel = "No field type found.",
  triggerClassName,
  contentClassName,
}: {
  value: Value
  groups: FieldTypePickerGroup<Value>[]
  onChange: (value: Value) => void
  disabled?: boolean
  ariaLabel?: string
  searchPlaceholder?: string
  searchAriaLabel?: string
  emptyLabel?: string
  triggerClassName?: string
  contentClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeValue, setActiveValue] = useState<string>(value)
  const options = useMemo(
    () => groups.flatMap((group) => group.options),
    [groups]
  )
  const selected = options.find((option) => option.value === value)
  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) {
      setQuery("")
      setActiveValue(value)
    }
  }
  const changeQuery = (next: string) => {
    setQuery(next)
    setActiveValue(
      options.find((option) => !option.disabled && optionMatches(option, next))
        ?.value ?? ""
    )
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between gap-2 px-2.5 text-xs font-normal",
            triggerClassName
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                {selected.icon}
              </span>
              <span className="truncate">{selected.label}</span>
            </span>
          ) : (
            <span className="truncate text-muted-foreground">
              Choose a field type
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className={cn("w-80 p-0", contentClassName)}
      >
        <Command
          value={activeValue}
          onValueChange={setActiveValue}
          filter={(candidate, search) => {
            const option = options.find((item) => item.value === candidate)
            return option && optionMatches(option, search) ? 1 : 0
          }}
        >
          <CommandInput
            aria-label={searchAriaLabel}
            placeholder={searchPlaceholder}
            className="h-9 text-xs"
            value={query}
            onValueChange={changeQuery}
          />
          <CommandEmpty className="px-3 py-6 text-center text-xs text-muted-foreground">
            {emptyLabel}
          </CommandEmpty>
          <CommandList className="max-h-80 py-1">
            {groups.map((group, groupIndex) => (
              <CommandGroup
                key={group.label}
                heading={group.label}
                className={cn(groupIndex > 0 && "mt-1 border-t pt-1")}
              >
                {group.options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    data-field-type={option.value}
                    className="items-start gap-2 px-2 py-2"
                    onSelect={() => {
                      if (option.disabled) return
                      if (option.value !== value) onChange(option.value)
                      changeOpen(false)
                    }}
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                      {option.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium leading-4">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    <Check
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        option.value === value ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
