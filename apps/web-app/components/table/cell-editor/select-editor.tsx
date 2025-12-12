import { useState } from "react"
import type { SelectOption } from "@/packages/core/fields/select"
import { Check } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

import { cn } from "@/lib/utils"
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

import useChangeEffect from "../hooks/use-change-effect"
import { EmptyValue, SelectOptionItem } from "./common"

interface ISelectEditorProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  isEditing: boolean
  onFinishEditing?: () => void
}

export const SelectEditor = ({
  value,
  onChange,
  options,
  isEditing,
  onFinishEditing,
}: ISelectEditorProps) => {
  const [_value, setValue] = useState<string>(value)
  const [_options, setOptions] = useState<SelectOption[]>(options)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)

  const { resolvedTheme } = useTheme()
  useChangeEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  const handleSelect = (value: string) => {
    setValue(value)
    if (_options.findIndex((item) => item.name == value) == -1) {
      setOptions([..._options, { id: value, name: value, color: "default" }])
    }
    onChange(value)
    setIsPopoverOpen(false)
    onFinishEditing?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isEditing) {
      e.preventDefault()
      setIsPopoverOpen(true)
    }
  }

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open)
    if (!open) {
      onFinishEditing?.()
    }
  }

  const option = _options.find((item) => item.id == _value)

  return (
    <Popover
      open={isPopoverOpen}
      onOpenChange={handlePopoverOpenChange}
    >
      <PopoverTrigger className="w-full">
        <div
          className="flex h-full w-full items-center px-1.5 gap-1.5"
          onKeyDown={handleKeyDown}
          onClick={() => setIsPopoverOpen(true)}
          tabIndex={0}
        >
          {_value && _value.length ? (
            option && <SelectOptionItem theme={resolvedTheme} option={option} />
          ) : (
            <EmptyValue />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start" sideOffset={-20}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search Option..."
            value={_value}
            onValueChange={setValue}
            autoFocus
          />
          <CommandList
            className={cn("max-h-[320px]", {
              "overflow-y-scroll": _options.length * 28 > 320,
            })}
          >
            <CommandEmpty>Create some options</CommandEmpty>
            <CommandGroup className="h-full">
              {_options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    handleSelect(option.id === _value ? "" : option.id)
                  }}
                  className="h-7 px-2 py-1"
                >
                  <Check
                    className={cn(
                      "mr-1.5 h-3 w-3",
                      _value === option.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <SelectOptionItem theme={resolvedTheme} option={option} />
                </CommandItem>
              ))}
              {Boolean(_value?.length) &&
                _options.findIndex((item) => item.name == _value) == -1 && (
                  <CommandItem
                    autoFocus
                    key={_value}
                    value={_value}
                    onSelect={(currentValue) => {
                      handleSelect(currentValue)
                    }}
                    className="h-7 px-2 py-1 text-xs"
                  >
                    Create {_value}
                  </CommandItem>
                )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
