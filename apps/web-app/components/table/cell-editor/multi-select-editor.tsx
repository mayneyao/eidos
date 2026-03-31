import React, { useEffect, useMemo } from "react"
import { SelectField, type SelectOption } from "@/packages/core/fields/select"
import { XIcon } from "lucide-react"
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

import { EmptyValue, SelectOptionItem, getLayoutClasses } from "./common"
import type { CellEditorProps } from "./types"
import { useCellEditor } from "./use-cell-editor"

interface IMultiSelectEditorProps extends CellEditorProps<string> {
  options: SelectOption[]
  inline?: boolean
}

export const MultiSelectEditor = ({
  value,
  onChange,
  options,
  isEditing,
  inline = false,
  onFinishEditing,
  onCancelEditing,
  layout = "flow",
  disabled = false,
}: IMultiSelectEditorProps) => {
  const optionsMap = useMemo(
    () =>
      options.reduce(
        (res, option) => {
          res[option.id] = option
          return res
        },
        {} as Record<string, SelectOption>
      ),
    [options]
  )

  const [oldOptionsMap, setOldOptionsMap] = React.useState(optionsMap)
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false)

  const { resolvedTheme } = useTheme()
  const [values, setValues] = React.useState(value ? value.split(",") : [])

  const { isActuallyEditing, handleKeyDown, finishEditing, cancelEditing } =
    useCellEditor({
      isEditing,
      onFinishEditing,
      onCancelEditing,
      originalValue: value ? value.split(",") : [],
      setValue: (v) => setValues(v),
    })

  // Auto-open popover when entering edit mode
  useEffect(() => {
    if (isActuallyEditing) {
      setIsPopoverOpen(true)
    }
  }, [isActuallyEditing])

  useEffect(() => {
    const newValues = value ? value.split(",") : []
    setValues(newValues)
  }, [value])

  useEffect(() => {
    setOldOptionsMap(optionsMap)
  }, [optionsMap])

  const allOptions = values
    .map((optionId) => oldOptionsMap[optionId])
    .filter(Boolean)

  const [currentSelect, setCurrentSelect] = React.useState("")
  const setNewValues = (newValues: string[]) => {
    setValues(newValues)
    onChange(newValues.join(","))
  }

  const clickRemoveOption = (e: React.MouseEvent<SVGSVGElement>) => {
    const optionId = e.currentTarget.dataset.id
    if (!optionId) return
    const set = new Set<string>(values)
    set.delete(optionId)
    setNewValues(Array.from(set))
  }

  const handleSelect = (selectedValue?: string) => {
    if (!selectedValue) return
    const set = new Set<string>(values)
    if (set.has(selectedValue)) {
      return
    } else {
      set.add(selectedValue)
    }
    setNewValues(Array.from(set))
  }

  const [inputValue, setInputValue] = React.useState("")

  const handleInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (
    e
  ) => {
    handleKeyDown(e as unknown as React.KeyboardEvent)
    if (e.defaultPrevented) return

    if (e.key === "Backspace" && !inputValue?.length) {
      const _values: string[] = Array.from(values)
      _values.pop()
      setNewValues(_values)
    }
    if (e.key === "Enter") {
      e.stopPropagation()
      const currentOptionId = options.find(
        (option) => option.name == currentSelect
      )?.id
      if (currentOptionId) {
        handleSelect(currentOptionId)
        setInputValue("")
      } else {
        if (!inputValue?.length) return
        handleSelect(inputValue)
        setInputValue("")
        setOldOptionsMap({
          ...optionsMap,
          [inputValue]: {
            id: inputValue,
            name: inputValue,
            color: "default",
          },
        })
      }
    }
  }

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open)
    if (!open) {
      finishEditing()
    }
  }

  const containerClasses = getLayoutClasses(layout, isActuallyEditing, disabled)

  // Trigger content
  const triggerContent = value ? (
    <div
      className={cn(
        "flex w-full gap-0.5",
        inline
          ? "h-full items-center flex-nowrap overflow-hidden"
          : "flex-wrap py-0.5"
      )}
      onKeyDown={handleKeyDown}
      onClick={() => setIsPopoverOpen(true)}
      tabIndex={0}
    >
      {values.map((optionId) => {
        const option = oldOptionsMap[optionId]
        if (!option) return null
        return (
          <span
            key={optionId}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
            style={{
              background: SelectField.getColorValue(
                option?.color || SelectField.defaultColor,
                resolvedTheme as any
              ),
            }}
          >
            {option.name}
          </span>
        )
      })}
    </div>
  ) : (
    <div
      className="flex h-full w-full items-center"
      onKeyDown={handleKeyDown}
      onClick={() => setIsPopoverOpen(true)}
      tabIndex={0}
    >
      <EmptyValue />
    </div>
  )

  return (
    <div className={containerClasses}>
      <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger className="w-full h-full">
          {triggerContent}
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            "click-outside-ignore z-[10000] min-w-[250px] p-0",
            inline ? "w-full" : "w-full max-w-[300px]"
          )}
          align="start"
          sideOffset={inline ? -28 : 4}
          asChild={true}
        >
          <Command value={currentSelect} onValueChange={setCurrentSelect}>
            <div className="flex w-full rounded-md bg-transparent py-2 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50">
              <div className="flex flex-wrap gap-1 px-2 py-1.5">
                {allOptions.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center gap-0.5 truncate rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{
                      background: SelectField.getColorValue(
                        option.color,
                        resolvedTheme as any
                      ),
                    }}
                  >
                    {option.name}
                    <XIcon
                      onClick={clickRemoveOption}
                      className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100"
                      data-id={option.id}
                    />
                  </div>
                ))}
                <div className="[&_[cmdk-input-wrapper]_svg]:hidden [&_[cmdk-input-wrapper]]:border-none flex-1 min-w-[80px]">
                  <CommandInput
                    onKeyDown={handleInputKeyDown}
                    value={inputValue}
                    onValueChange={setInputValue}
                    className="border-none p-0 focus:ring-0 focus-visible:ring-0 h-6 text-xs bg-transparent"
                    autoFocus
                  />
                </div>
              </div>
            </div>
            <CommandList
              className={cn("max-h-[300px]", {
                "overflow-y-scroll": options.length * 28 > 300,
              })}
            >
              <CommandEmpty>Create option</CommandEmpty>
              <CommandGroup className="h-full border-t">
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.name}
                    onSelect={() => {
                      handleSelect(option.id)
                    }}
                  >
                    <SelectOptionItem theme={resolvedTheme} option={option} />
                  </CommandItem>
                ))}
                {Boolean(inputValue.length) &&
                  options.findIndex((item) => item.name == inputValue) ==
                    -1 && (
                    <CommandItem
                      key={inputValue}
                      value={inputValue}
                      className="flex items-center gap-2"
                      onSelect={(currentValue) => {
                        handleSelect(currentValue)
                      }}
                    >
                      <span>Create</span>
                      <SelectOptionItem
                        theme={resolvedTheme}
                        option={{
                          id: inputValue,
                          name: inputValue,
                          color: "default",
                        }}
                      />
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
