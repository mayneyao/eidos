import React, { useMemo } from "react"
import { SelectField, type SelectOption } from "@/packages/core/fields/select"
import { XIcon } from "lucide-react"
import { useTheme } from "next-themes"

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

import { EmptyValue, SelectOptionItem } from "./common"

interface IMultiSelectEditorProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  isEditing: boolean
  inline?: boolean
}

export const MultiSelectEditor = ({
  value,
  onChange,
  options,
  isEditing,
  inline = false,
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

  const { theme } = useTheme()
  const [values, setValues] = React.useState(value ? value.split(",") : [])

  const allOptions = values
    .map((optionId) => oldOptionsMap[optionId])
    .filter(Boolean)

  const [currentSelect, setCurrentSelect] = React.useState("")
  const setNewValues = (newValues: string[]) => {
    setValues(newValues)
    onChange(newValues.join(","))
  }

  const clickRemoveOption = (e: any) => {
    const optionId = e.target.dataset.id
    const set = new Set<string>(values)
    set.delete(optionId)
    setNewValues(Array.from(set))
  }
  const handleSelect = (value?: string) => {
    if (!value) return
    const set = new Set<string>(values)
    if (set.has(value)) {
      return
    } else {
      set.add(value)
    }
    setNewValues(Array.from(set))
  }
  const [inputValue, setInputValue] = React.useState("")
  const handleBackspace: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Backspace" && !inputValue?.length) {
      const _values: string[] = Array.from(values)
      _values.pop()
      setNewValues(_values)
    }
    if (e.key === "Escape") {
      if (JSON.stringify(values) == JSON.stringify(values)) {
        return
      }
      setNewValues(values)
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
        // is creating new option
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

  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="w-full">
        {value ? (
          <div
            className={cn(
              "flex h-full w-full items-center px-2 gap-1",
              inline ? "flex-nowrap overflow-hidden" : "flex-wrap"
            )}
          >
            {values.map((optionId) => {
              const option = oldOptionsMap[optionId]
              if (!option) return null
              return inline ? (
                <span
                  key={optionId}
                  className="rounded-sm px-2 text-sm whitespace-nowrap"
                  style={{
                    background: SelectField.getColorValue(
                      option?.color || SelectField.defaultColor,
                      theme as any
                    ),
                  }}
                >
                  {option.name}
                </span>
              ) : (
                <SelectOptionItem
                  key={optionId}
                  theme={theme}
                  option={option}
                />
              )
            })}
          </div>
        ) : (
          <div className="flex h-full w-full items-center px-2">
            <EmptyValue />
          </div>
        )}
      </PopoverTrigger>
      <PopoverContent
        // z-index 10000 > gdg editor portal z index
        className={cn(
          "click-outside-ignore z-[10000] min-w-[250px] p-0",
          inline ? "w-full" : "w-full max-w-[300px]"
        )}
        align="start"
        sideOffset={-28}
        asChild={true}
      >
        <Command value={currentSelect} onValueChange={setCurrentSelect}>
          <div className="flex w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50">
            <div className="flex flex-wrap gap-1 px-2">
              {allOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex h-5 items-center gap-1 truncate rounded-sm px-1.5 text-xs"
                  style={{
                    background: SelectField.getColorValue(
                      option.color,
                      theme as any
                    ),
                  }}
                >
                  {option.name}
                  <XIcon
                    onClick={clickRemoveOption}
                    className="h-2.5 w-2.5 cursor-pointer opacity-60"
                    data-id={option.id}
                  />
                </div>
              ))}
              {/* <CommandInput
                onKeyDown={handleBackspace}
                value={inputValue}
                onValueChange={setInputValue}
                className="w-full"
                autoFocus
              /> */}
              <div className="[&_[cmdk-input-wrapper]_svg]:hidden [&_[cmdk-input-wrapper]]:border-none">
                <CommandInput
                  onKeyDown={handleBackspace}
                  value={inputValue}
                  onValueChange={setInputValue}
                  className="border-none p-0 focus:ring-0 focus-visible:ring-0 h-5 text-xs"
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
                  <SelectOptionItem theme={theme} option={option} />
                </CommandItem>
              ))}
              {Boolean(inputValue.length) &&
                options.findIndex((item) => item.name == inputValue) == -1 && (
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
                      theme={theme}
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
  )
}
