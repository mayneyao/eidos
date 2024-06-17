import React, { useMemo } from "react"
import { XIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { SelectField, SelectOption } from "@/lib/fields/select"
import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput2,
  CommandItem,
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
}

export const MultiSelectEditor = ({
  value,
  onChange,
  options,
  isEditing,
}: IMultiSelectEditorProps) => {
  const optionsMap = useMemo(
    () =>
      options.reduce((res, option) => {
        res[option.id] = option
        return res
      }, {} as Record<string, SelectOption>),
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
      set.delete(value)
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
          <div className="flex gap-2">
            {values.map((optionId) => {
              const option = oldOptionsMap[optionId]
              if (!option) return null
              return <SelectOptionItem theme={theme} option={option} />
            })}
          </div>
        ) : (
          <EmptyValue />
        )}
      </PopoverTrigger>
      <PopoverContent
        // z-index 10000 > gdg editor portal z index
        className="click-outside-ignore z-[10000] w-[300px] p-0"
        align="start"
        sideOffset={-32}
        asChild={true}
      >
        <Command value={currentSelect} onValueChange={setCurrentSelect}>
          <div className="flex w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50">
            <div className="flex flex-wrap gap-2 px-2">
              {allOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex h-6 items-center gap-2 truncate rounded-sm px-2 text-sm"
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
                    className="h-3 w-3 cursor-pointer opacity-60"
                    data-id={option.id}
                  />
                </div>
              ))}
              <CommandInput2
                onKeyDown={handleBackspace}
                value={inputValue}
                onValueChange={setInputValue}
                autoFocus
              />
            </div>
          </div>
          <div
            className={cn("max-h-[400px]", {
              "overflow-y-scroll": allOptions.length * 32 > 400,
            })}
          >
            <CommandEmpty>Create option</CommandEmpty>
            <CommandGroup className="h-full border-t">
              {allOptions.map((option) => (
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
                allOptions.findIndex((item) => item.name == inputValue) ==
                  -1 && (
                  <CommandItem
                    autoFocus
                    key={inputValue}
                    value={inputValue}
                    onSelect={(currentValue) => {
                      handleSelect(currentValue)
                    }}
                  >
                    Create {inputValue}
                  </CommandItem>
                )}
            </CommandGroup>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
