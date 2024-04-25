import { useState } from "react"
import { Check } from "lucide-react"
import { useTheme } from "next-themes"

import { SelectOption } from "@/lib/fields/select"
import { cn } from "@/lib/utils"
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

import useChangeEffect from "../hooks/use-change-effect"
import { EmptyValue, SelectOptionItem } from "./common"

interface ISelectEditorProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  isEditing: boolean
}

export const SelectEditor = ({
  value,
  onChange,
  options,
  isEditing,
}: ISelectEditorProps) => {
  const [_value, setValue] = useState<string>(value)
  const [_options, setOptions] = useState<SelectOption[]>(options)

  const [open, setOpen] = useState(false)
  const { theme } = useTheme()
  useChangeEffect(() => {
    onChange(_value)
  }, [_value, onChange])

  const handleSelect = (value: string) => {
    setValue(value)
    if (_options.findIndex((item) => item.name == value) == -1) {
      setOptions([..._options, { id: value, name: value, color: "default" }])
    }
    onChange(value)
    setOpen(false)
  }
  const option = _options.find((item) => item.id == _value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="w-full">
        <div className="flex gap-2">
          {_value && _value.length ? (
            option && <SelectOptionItem theme={theme} option={option} />
          ) : (
            <EmptyValue />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="mt-[-42px] w-[300px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search Option..."
            // value={value}
            onValueChange={setValue}
          />
          <div
            className={cn("max-h-[400px]", {
              "overflow-y-scroll": _options.length * 32 > 400,
            })}
          >
            {" "}
            <CommandEmpty>Create some options</CommandEmpty>
            <CommandGroup className="h-full">
              {_options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    handleSelect(option.id === _value ? "" : option.id)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      _value === option.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <SelectOptionItem theme={theme} option={option} />
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
                  >
                    Create {_value}
                  </CommandItem>
                )}
            </CommandGroup>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
