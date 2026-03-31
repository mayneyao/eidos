import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { FieldType } from "@/packages/core/fields/const"
import type { FormulaProperty } from "@/packages/core/fields/formula"
import type { IField } from "@/packages/core/types/IField"
import {
  FunctionSquareIcon,
  Type,
  Link2,
  FileIcon,
  Edit3,
  Hash,
  BarChart3,
  Tag,
  Plus,
  X,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/theme-provider"
import type { NumberProperty } from "@/packages/core/fields/number"
import { SelectField } from "@/packages/core/fields/select"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
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
import { Separator } from "@/components/ui/separator"
import type { CodeMirrorFormulaEditorRef } from "@/components/formula-editor/codemirror-editor"
import { useCurrentUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import { ChevronsUpDown } from "lucide-react"

// lazy import FormulaEditor
const FormulaEditor = lazy(
  () => import("../../../views/grid/plugins/formula-editor")
)

interface IFieldPropertyEditorProps {
  uiColumn: IField<FormulaProperty>
  onPropertyChange: (property: FormulaProperty) => void
  isCreateNew?: boolean
}

const displayTypeOptions = [
  {
    value: FieldType.Text,
    labelKey: "table.propertyEditor.formula.displayType.text",
    icon: Type,
    descriptionKey: "table.propertyEditor.formula.displayType.textDescription",
  },
  {
    value: FieldType.Number,
    labelKey: "table.propertyEditor.formula.displayType.number",
    icon: Hash,
    descriptionKey:
      "table.propertyEditor.formula.displayType.numberDescription",
  },
  {
    value: FieldType.Select,
    labelKey: "table.propertyEditor.formula.displayType.select",
    icon: Tag,
    descriptionKey:
      "table.propertyEditor.formula.displayType.selectDescription",
  },
  {
    value: FieldType.MultiSelect,
    labelKey: "table.propertyEditor.formula.displayType.multiSelect",
    icon: Tag,
    descriptionKey:
      "table.propertyEditor.formula.displayType.multiSelectDescription",
  },
  {
    value: FieldType.URL,
    labelKey: "table.propertyEditor.formula.displayType.url",
    icon: Link2,
    descriptionKey: "table.propertyEditor.formula.displayType.urlDescription",
  },
  {
    value: FieldType.File,
    labelKey: "table.propertyEditor.formula.displayType.file",
    icon: FileIcon,
    descriptionKey: "table.propertyEditor.formula.displayType.fileDescription",
  },
]

export const FormulaPropertyEditor = (props: IFieldPropertyEditorProps) => {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { formula = "" } = props.uiColumn.property ?? ({} as FormulaProperty)
  const [displayType, setDisplayType] = useState(
    props.uiColumn.property.displayType ?? FieldType.Text
  )

  // Number config state
  const [numberConfig, setNumberConfig] = useState<
    FormulaProperty["numberConfig"]
  >(
    props.uiColumn.property.numberConfig ?? {
      showAs: "number",
      color: "purple",
      divideBy: 100,
      showNumber: true,
    }
  )

  // Option config state - colorMap is used to override auto hash colors
  const [optionConfig, setOptionConfig] = useState<
    FormulaProperty["optionConfig"]
  >(
    props.uiColumn.property.optionConfig ?? {
      colorMap: [],
    }
  )
  // New color mapping input state
  const [newMappingValue, setNewMappingValue] = useState("")
  const [newMappingColor, setNewMappingColor] = useState("default")

  const ref = useRef<HTMLDivElement>(null)
  const editorRef = useRef<CodeMirrorFormulaEditorRef>(null)
  const [isOpen, setIsOpen] = useState(false)
  const { uiColumns } = useCurrentUiColumns()
  // Get colors directly from SelectField based on theme
  const colors = SelectField.colors[resolvedTheme as "light" | "dark"] ?? []

  // Sync with external changes
  useEffect(() => {
    setDisplayType(props.uiColumn.property.displayType ?? FieldType.Text)
    setNumberConfig(
      props.uiColumn.property.numberConfig ?? {
        showAs: "number",
        color: "purple",
        divideBy: 100,
        showNumber: true,
      }
    )
    setOptionConfig(
      props.uiColumn.property.optionConfig ?? {
        colorMap: [],
      }
    )
  }, [
    props.uiColumn.property.displayType,
    props.uiColumn.property.numberConfig,
    props.uiColumn.property.optionConfig,
  ])

  const handleChangeFieldDisplayType = (value: FieldType) => {
    setDisplayType(value)
    props.onPropertyChange({
      ...props.uiColumn.property,
      displayType: value,
      numberConfig: value === FieldType.Number ? numberConfig : undefined,
      optionConfig:
        value === FieldType.Select || value === FieldType.MultiSelect
          ? optionConfig
          : undefined,
    })
  }

  const handleNumberConfigChange = (
    updates: Partial<FormulaProperty["numberConfig"]>
  ) => {
    const updatedConfig = {
      ...numberConfig,
      ...updates,
    } as FormulaProperty["numberConfig"]
    setNumberConfig(updatedConfig)
    props.onPropertyChange({
      ...props.uiColumn.property,
      numberConfig: updatedConfig,
    })
  }

  const handleOptionConfigChange = (
    updates: Partial<FormulaProperty["optionConfig"]>
  ) => {
    const updatedConfig = {
      ...optionConfig,
      ...updates,
    } as FormulaProperty["optionConfig"]
    setOptionConfig(updatedConfig)
    props.onPropertyChange({
      ...props.uiColumn.property,
      optionConfig: updatedConfig,
    })
  }

  const addColorMapping = () => {
    if (!newMappingValue.trim()) return
    const newMapping = { value: newMappingValue.trim(), color: newMappingColor }
    handleOptionConfigChange({
      colorMap: [...(optionConfig?.colorMap ?? []), newMapping],
    })
    setNewMappingValue("")
  }

  const removeColorMapping = (index: number) => {
    const newColorMap = [...(optionConfig?.colorMap ?? [])]
    newColorMap.splice(index, 1)
    handleOptionConfigChange({ colorMap: newColorMap })
  }

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        editorRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Truncate long formula for display
  const displayFormula =
    formula.length > 50 ? formula.slice(0, 50) + "..." : formula || ""

  return (
    <div className="space-y-3" ref={ref}>
      <Separator />

      {/* Formula Editor Section */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.formula.formula")}
        </Label>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <button className="w-full group">
              <div
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-md",
                  "bg-muted/50 border border-muted-foreground/20",
                  "hover:border-primary/50 hover:bg-muted",
                  "transition-colors duration-150 text-left"
                )}
              >
                <FunctionSquareIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <code className="flex-1 text-xs font-mono text-foreground truncate">
                  {displayFormula || (
                    <span className="text-muted-foreground italic">
                      {t("table.propertyEditor.formula.clickToEdit")}
                    </span>
                  )}
                </code>
                <Edit3 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0 border-none w-[500px]"
            container={ref.current!}
            side="left"
            align="start"
            alignOffset={20}
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
                  {t("table.propertyEditor.formula.loading")}
                </div>
              }
            >
              <FormulaEditor
                editorRef={editorRef}
                closeEditor={() => setIsOpen(false)}
                formulaField={props.uiColumn}
                uiColumns={uiColumns}
                rowId={null}
              />
            </Suspense>
          </PopoverContent>
        </Popover>
      </div>

      {/* Display Type Section */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">
          {t("table.propertyEditor.formula.displayAs")}
        </Label>
        <div className="grid grid-cols-3 gap-1.5">
          {displayTypeOptions.map((option) => {
            const Icon = option.icon
            const isSelected = displayType === option.value
            return (
              <button
                key={option.value}
                onClick={() => handleChangeFieldDisplayType(option.value)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1",
                  "px-2 py-2 rounded-lg border-2 transition-all duration-150",
                  "hover:border-accent hover:bg-accent/5",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isSelected ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-medium",
                    isSelected ? "text-primary" : "text-foreground"
                  )}
                >
                  {t(option.labelKey)}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t(
            displayTypeOptions.find((o) => o.value === displayType)
              ?.descriptionKey || ""
          )}
        </p>
      </div>

      {/* Number Configuration Section */}
      {displayType === FieldType.Number && numberConfig && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          <Separator />

          {/* Show As Options */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground">
              {t("table.propertyEditor.number.showAs")}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleNumberConfigChange({ showAs: "number" })}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5",
                  "p-2.5 rounded-lg border-2 transition-all duration-150",
                  "hover:border-accent hover:bg-accent/5",
                  numberConfig.showAs === "number"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                )}
              >
                <span
                  className={cn(
                    "text-lg font-bold",
                    numberConfig.showAs === "number"
                      ? "text-primary"
                      : "text-foreground"
                  )}
                >
                  42
                </span>
                <div className="flex items-center gap-1">
                  <Hash
                    className={cn(
                      "h-3 w-3",
                      numberConfig.showAs === "number"
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      numberConfig.showAs === "number"
                        ? "text-primary"
                        : "text-foreground"
                    )}
                  >
                    {t("table.propertyEditor.number.number")}
                  </span>
                </div>
              </button>
              <button
                onClick={() => handleNumberConfigChange({ showAs: "bar" })}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5",
                  "p-2.5 rounded-lg border-2 transition-all duration-150",
                  "hover:border-accent hover:bg-accent/5",
                  numberConfig.showAs === "bar"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                )}
              >
                <div className="w-full flex justify-center">
                  <svg
                    viewBox="0 0 48 24"
                    className={cn(
                      "w-12 h-6",
                      numberConfig.showAs === "bar"
                        ? "text-primary"
                        : "text-muted-foreground"
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
                <div className="flex items-center gap-1">
                  <BarChart3
                    className={cn(
                      "h-3 w-3",
                      numberConfig.showAs === "bar"
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      numberConfig.showAs === "bar"
                        ? "text-primary"
                        : "text-foreground"
                    )}
                  >
                    {t("table.propertyEditor.number.bar")}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Bar-specific Options */}
          {numberConfig.showAs === "bar" && (
            <div className="space-y-3">
              {/* Color Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">
                  {t("table.propertyEditor.number.color")}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-7 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3.5 h-3.5 rounded"
                          style={{
                            backgroundColor: `#${colors.find((c) => c.name === numberConfig.color)?.value}`,
                          }}
                        />
                        <span className="capitalize">{numberConfig.color}</span>
                      </div>
                      <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="click-outside-ignore w-[200px] p-0">
                    <Command>
                      <CommandInput
                        placeholder={t(
                          "table.propertyEditor.number.searchColor"
                        )}
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
                                handleNumberConfigChange({
                                  color: colorOption.name,
                                })
                              }}
                              className="flex items-center gap-2 text-xs"
                            >
                              <div
                                className="w-3.5 h-3.5 rounded"
                                style={{
                                  backgroundColor: `#${colorOption.value}`,
                                }}
                              />
                              <span className="capitalize">
                                {colorOption.name}
                              </span>
                              {numberConfig.color === colorOption.name && (
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
                  value={numberConfig.divideBy}
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value, 10) || 1
                    handleNumberConfigChange({ divideBy: newValue })
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
                  checked={numberConfig.showNumber}
                  onCheckedChange={(checked) => {
                    handleNumberConfigChange({ showNumber: checked })
                  }}
                  className="scale-90"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Option Configuration Section */}
      {(displayType === FieldType.Select ||
        displayType === FieldType.MultiSelect) &&
        optionConfig && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <Separator />

            <p className="text-[10px] text-muted-foreground">
              {t("table.propertyEditor.formula.optionConfig.description")}
            </p>

            {/* Color Mappings */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-foreground">
                {t("table.propertyEditor.formula.optionConfig.colorOverrides")}
              </Label>

              {/* Existing mappings */}
              {optionConfig.colorMap.length > 0 && (
                <div className="space-y-1.5">
                  {optionConfig.colorMap.map((mapping, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-1.5 rounded-md bg-muted/50"
                    >
                      <div
                        className="w-3 h-3 rounded flex-shrink-0"
                        style={{
                          backgroundColor: `#${colors.find((c) => c.name === mapping.color)?.value}`,
                        }}
                      />
                      <span className="text-xs flex-1 truncate">
                        {mapping.value}
                      </span>
                      <button
                        onClick={() => removeColorMapping(index)}
                        className="p-0.5 hover:bg-muted rounded"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new mapping */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder={t(
                    "table.propertyEditor.formula.optionConfig.placeholder"
                  )}
                  className="h-7 text-xs flex-1"
                  value={newMappingValue}
                  onChange={(e) => setNewMappingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      addColorMapping()
                    }
                  }}
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-7 w-7 p-0 flex-shrink-0"
                    >
                      <div
                        className="w-3.5 h-3.5 rounded"
                        style={{
                          backgroundColor: `#${colors.find((c) => c.name === newMappingColor)?.value}`,
                        }}
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="click-outside-ignore w-[150px] p-0">
                    <Command>
                      <CommandGroup>
                        <CommandList className="max-h-[120px]">
                          {colors.map((colorOption) => (
                            <CommandItem
                              key={colorOption.name}
                              onSelect={() =>
                                setNewMappingColor(colorOption.name)
                              }
                              className="flex items-center gap-2 text-xs"
                            >
                              <div
                                className="w-3.5 h-3.5 rounded"
                                style={{
                                  backgroundColor: `#${colorOption.value}`,
                                }}
                              />
                              <span className="capitalize">
                                {colorOption.name}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandList>
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={addColorMapping}
                  disabled={!newMappingValue.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}
