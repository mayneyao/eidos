import { useEffect, useState } from "react"
import { ChevronsUpDown } from "lucide-react"
import { useTheme } from "next-themes"

import { NumberProperty } from "@/lib/fields/number"
import { SelectField } from "@/lib/fields/select"
import { IField } from "@/lib/store/interface"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"

interface IFieldPropertyEditorProps {
  uiColumn: IField<NumberProperty>
  onPropertyChange: (property: NumberProperty) => void
  isCreateNew?: boolean
}

export const NumberPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const [format, setFormat] = useState<NumberProperty["format"]>(
    props.uiColumn.property?.format ?? "number"
  )
  const [showAs, setShowAs] = useState<NumberProperty["showAs"]>(
    props.uiColumn.property?.showAs ?? "number"
  )
  const [color, setColor] = useState<string>(
    props.uiColumn.property?.color ?? "purple"
  )
  const [divideBy, setDivideBy] = useState<number>(
    props.uiColumn.property?.divideBy ?? 100
  )
  const [showNumber, setShowNumber] = useState<boolean>(
    props.uiColumn.property?.showNumber ?? true
  )
  const [openFormat, setOpenFormat] = useState(false)
  const [openColor, setOpenColor] = useState(false)
  const [colors, setColors] = useState<{ name: string; value: string }[]>([])
  const { theme } = useTheme()

  useEffect(() => {
    setColors(SelectField.colors[theme as "light" | "dark"])
  }, [theme])

  const updateProperty = (updates: Partial<NumberProperty>) => {
    const updatedProperty = {
      format,
      showAs,
      color,
      divideBy,
      showNumber,
      ...updates,
    }
    props.onPropertyChange(updatedProperty)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* <div className="flex items-center justify-between">
        <Label>Number format</Label>
        <Popover open={openFormat} onOpenChange={setOpenFormat}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openFormat}
              className="w-[200px] justify-between"
            >
              {format.charAt(0).toUpperCase() + format.slice(1)}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="click-outside-ignore w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search format..." />
              <CommandEmpty>No format found.</CommandEmpty>
              <CommandGroup>
                <CommandList>
                  <CommandItem
                    onSelect={() => {
                      setFormat("number")
                      setOpenFormat(false)
                    }}
                  >
                    Number
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      setFormat("percent")
                      setOpenFormat(false)
                    }}
                  >
                    Percentage
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      setFormat("currency")
                      setOpenFormat(false)
                    }}
                  >
                    Currency
                  </CommandItem>
                </CommandList>
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div> */}

      <Label>Show as</Label>
      <div className="flex gap-2">
        <div
          className={`rounded-md cursor-pointer p-2 border flex-1 flex flex-col items-center justify-center h-20 ${
            showAs === "number"
              ? "bg-gray-200 dark:bg-gray-700"
              : "bg-white dark:bg-gray-900"
          }`}
          onClick={() => {
            setShowAs("number")
            updateProperty({ showAs: "number" })
          }}
        >
          <span className="text-2xl font-bold">42</span>
          <span>Number</span>
        </div>
        <div
          className={`rounded-md cursor-pointer p-2 border flex-1 flex flex-col items-center justify-center h-20 ${
            showAs === "bar"
              ? "bg-gray-200 dark:bg-gray-700"
              : "bg-white dark:bg-gray-900"
          }`}
          onClick={() => {
            setShowAs("bar")
            updateProperty({ showAs: "bar" })
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            className="w-8 h-8"
          >
            <line
              x1="4"
              y1="12"
              x2="20"
              y2="12"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="14" cy="12" r="3" fill="currentColor" />
          </svg>
          <span>Bar</span>
        </div>
      </div>

      {showAs === "bar" && (
        <>
          <div className="flex items-center justify-between">
            <Label>Color</Label>
            <Popover open={openColor} onOpenChange={setOpenColor}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openColor}
                  className="w-[200px] justify-between"
                >
                  <div className="flex items-center">
                    <div
                      className="w-4 h-4 mr-2 rounded"
                      style={{
                        backgroundColor: `#${
                          colors.find((c) => c.name === color)?.value
                        }`,
                      }}
                    />
                    {color.charAt(0).toUpperCase() + color.slice(1)}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="click-outside-ignore w-[200px] p-0">
                <Command>
                  <CommandInput placeholder="Search color..." />
                  <CommandEmpty>No color found.</CommandEmpty>
                  <CommandGroup>
                    <CommandList>
                      {colors.map((colorOption) => (
                        <CommandItem
                          key={colorOption.name}
                          onSelect={() => {
                            setColor(colorOption.name)
                            setOpenColor(false)
                            updateProperty({ color: colorOption.name })
                          }}
                        >
                          <div className="flex items-center">
                            <div
                              className="w-4 h-4 mr-2 rounded"
                              style={{
                                backgroundColor: `#${colorOption.value}`,
                              }}
                            />
                            {colorOption.name.charAt(0).toUpperCase() +
                              colorOption.name.slice(1)}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center justify-between">
            <Label>Divide by</Label>
            <Input
              type="number"
              className="w-[200px]"
              value={divideBy}
              onChange={(e) => {
                const newValue = parseInt(e.target.value, 10)
                setDivideBy(newValue)
                updateProperty({ divideBy: newValue })
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Show number</Label>
            <Switch
              checked={showNumber}
              onCheckedChange={(checked) => {
                setShowNumber(checked)
                updateProperty({ showNumber: checked })
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
