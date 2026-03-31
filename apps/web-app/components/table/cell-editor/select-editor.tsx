import { useEffect, useState } from "react"
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
import { EmptyValue, SelectOptionItem, getLayoutClasses } from "./common"
import type { CellEditorProps } from "./types"
import { useCellEditor } from "./use-cell-editor"

interface ISelectEditorProps extends CellEditorProps<string> {
  options: SelectOption[]
}

export const SelectEditor = ({
  value,
  onChange,
  options,
  isEditing,
  onFinishEditing,
  onCancelEditing,
  layout = "flow",
  disabled = false,
}: ISelectEditorProps) => {
  const [_value, setValue] = useState<string>(value)
  const [_options, setOptions] = useState<SelectOption[]>(options)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)

  const { resolvedTheme } = useTheme()

  const { isActuallyEditing, handleKeyDown, finishEditing, cancelEditing } =
    useCellEditor({
      isEditing,
      onFinishEditing,
      onCancelEditing,
      originalValue: value,
      setValue,
    })

  // Auto-open popover when entering edit mode
  useEffect(() => {
    if (isActuallyEditing) {
      setIsPopoverOpen(true)
    }
  }, [isActuallyEditing])

  useChangeEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  useEffect(() => {
    setValue(value)
  }, [value])

  useEffect(() => {
    setOptions(options)
  }, [options])

  const handleSelect = (selectedValue: string) => {
    setValue(selectedValue)
    if (_options.findIndex((item) => item.name == selectedValue) == -1) {
      setOptions([
        ..._options,
        { id: selectedValue, name: selectedValue, color: "default" },
      ])
    }
    onChange(selectedValue)
    setIsPopoverOpen(false)
    finishEditing()
  }

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open)
    if (!open) {
      finishEditing()
    }
  }

  const option = _options.find((item) => item.id == _value)
  const containerClasses = getLayoutClasses(layout, isActuallyEditing, disabled)

  // Popover trigger content
  const triggerContent = (
    <div
      className="flex h-full w-full items-center gap-1.5"
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
  )

  return (
    <div className={containerClasses}>
      <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger className="w-full h-full">
          {triggerContent}
        </PopoverTrigger>
        <PopoverContent
          className="w-[280px] p-0"
          align="start"
          sideOffset={-20}
        >
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
    </div>
  )
}
