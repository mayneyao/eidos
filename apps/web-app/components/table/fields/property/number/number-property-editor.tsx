import { useEffect, useState } from "react"
import { ChevronsUpDown, Hash, BarChart3 } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { useTranslation } from "react-i18next"

import type { NumberProperty } from "@/packages/core/fields/number"
import { SelectField } from "@/packages/core/fields/select"
import type { IField } from "@/packages/core/types/IField"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"

interface IFieldPropertyEditorProps {
  uiColumn: IField<NumberProperty>
  onPropertyChange: (property: NumberProperty) => void
  isCreateNew?: boolean
}

export const NumberPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { t } = useTranslation()
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
  const [openColor, setOpenColor] = useState(false)
  const [colors, setColors] = useState<{ name: string; value: string }[]>([])
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    setColors(SelectField.colors[resolvedTheme as "light" | "dark"])
  }, [resolvedTheme])

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

  const showAsOptions = [
    {
      value: "number" as const,
      label: t("table.propertyEditor.number.number"),
      icon: Hash,
      preview: "42",
    },
    {
      value: "bar" as const,
      label: t("table.propertyEditor.number.bar"),
      icon: BarChart3,
      preview: null,
    },
  ]

  return (
    <div className="space-y-3">
      <Separator />

      {/* Show As Section */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.number.showAs")}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {showAsOptions.map((option) => {
            const Icon = option.icon
            const isSelected = showAs === option.value

            return (
              <button
                key={option.value}
                onClick={() => {
                  setShowAs(option.value)
                  updateProperty({ showAs: option.value })
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5",
                  "p-2.5 rounded-lg border-2 transition-all duration-150",
                  "hover:border-accent hover:bg-accent/5",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                )}
              >
                {option.preview ? (
                  <span
                    className={cn(
                      "text-lg font-bold",
                      isSelected ? "text-primary" : "text-foreground"
                    )}
                  >
                    {option.preview}
                  </span>
                ) : (
                  <div className="w-full flex justify-center">
                    <svg
                      viewBox="0 0 48 24"
                      className={cn(
                        "w-12 h-6",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )}
                      fill="none"
                    >
                      <rect
                        x="2"
                        y="8"
                        width="44"
                        height="8"
                        rx="4"
                        fill="currentColor"
                        opacity="0.2"
                      />
                      <rect
                        x="2"
                        y="8"
                        width="28"
                        height="8"
                        rx="4"
                        fill="currentColor"
                      />
                    </svg>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Icon
                    className={cn(
                      "h-3 w-3",
                      isSelected ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isSelected ? "text-primary" : "text-foreground"
                    )}
                  >
                    {option.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Bar-specific Options */}
      {showAs === "bar" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          <Separator />

          {/* Color Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">
              {t("table.propertyEditor.number.color")}
            </Label>
            <Popover open={openColor} onOpenChange={setOpenColor}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openColor}
                  className="w-full justify-between h-7 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3.5 h-3.5 rounded"
                      style={{
                        backgroundColor: `#${colors.find((c) => c.name === color)?.value}`,
                      }}
                    />
                    <span className="capitalize">{color}</span>
                  </div>
                  <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="click-outside-ignore w-[200px] p-0">
                <Command>
                  <CommandInput
                    placeholder={t("table.propertyEditor.number.searchColor")}
                    className="h-7 text-xs"
                  />
                  <CommandEmpty className="text-xs py-2">
                    {t("table.propertyEditor.number.noColorFound")}
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandList className="max-h-[160px]">
                      {colors.map((colorOption) => (
                        <CommandItem
                          key={colorOption.name}
                          onSelect={() => {
                            setColor(colorOption.name)
                            setOpenColor(false)
                            updateProperty({ color: colorOption.name })
                          }}
                          className="flex items-center gap-2 text-xs"
                        >
                          <div
                            className="w-3.5 h-3.5 rounded"
                            style={{
                              backgroundColor: `#${colorOption.value}`,
                            }}
                          />
                          <span className="capitalize">{colorOption.name}</span>
                          {color === colorOption.name && (
                            <svg
                              className="ml-auto h-3.5 w-3.5 text-primary"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Divide By Input */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-foreground">
              {t("table.propertyEditor.number.divideBy")}
            </Label>
            <Input
              type="number"
              className="h-7 text-xs"
              value={divideBy}
              onChange={(e) => {
                const newValue = parseInt(e.target.value, 10) || 1
                setDivideBy(newValue)
                updateProperty({ divideBy: newValue })
              }}
              min={1}
            />
            <p className="text-[10px] text-muted-foreground leading-tight">
              {t("table.propertyEditor.number.divideByDescription")}
            </p>
          </div>

          {/* Show Number Toggle */}
          <div className="flex items-center justify-between py-0.5">
            <Label className="text-xs font-medium text-foreground">
              {t("table.propertyEditor.number.showNumber")}
            </Label>
            <Switch
              checked={showNumber}
              onCheckedChange={(checked) => {
                setShowNumber(checked)
                updateProperty({ showNumber: checked })
              }}
              className="scale-90"
            />
          </div>
        </div>
      )}
    </div>
  )
}
