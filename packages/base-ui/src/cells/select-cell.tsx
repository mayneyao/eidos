import * as React from "react"
import { baseOptionColor, nextBaseOptionColor } from "../base-field-properties"
import type { BaseGridSelectOption as SelectOption } from "../base-grid-adapter"
import {
  GridCellKind,
  getMiddleCenterBias,
  measureTextCached,
  type CustomCell,
  type CustomRenderer,
  type ProvideEditorCallback,
  type Rectangle,
} from "@glideapps/glide-data-grid"
import { Check } from "lucide-react"

import { cn } from "../lib/cn"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/primitives"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/primitives"

import { roundedRect } from "./grid-cell-helper"

interface SelectCellProps {
  readonly kind: "select-cell"
  readonly value: string | null
  readonly allowedValues: readonly SelectOption[]
  readonly allowCreate?: boolean
  readonly readonly?: boolean
}

export type SelectCell = CustomCell<SelectCellProps>

interface SelectEditorProps {
  value: string | null
  allowedValues: readonly SelectOption[]
  allowCreate: boolean
  themeName: string
  onFinishedEditing: (value: string | null) => void
  onCancelEditing: () => void
}

function SelectEditor(props: SelectEditorProps) {
  const {
    value: valueIn,
    allowedValues,
    allowCreate,
    themeName,
    onFinishedEditing,
    onCancelEditing,
  } = props

  const [open, setOpen] = React.useState(true)
  const [searchValue, setSearchValue] = React.useState("")
  const [selectedValue, setSelectedValue] = React.useState<string | null>(
    valueIn
  )

  const oldOptionName = allowedValues.find((item) => item.id == valueIn)?.name
  const nextColorName = nextBaseOptionColor([...allowedValues])

  const handleSave = React.useCallback(() => {
    setOpen(false)
    onFinishedEditing(selectedValue)
  }, [selectedValue, onFinishedEditing])

  const handleCancel = React.useCallback(() => {
    setOpen(false)
    onCancelEditing()
  }, [onCancelEditing])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape to cancel editing
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      handleCancel()
      return
    }

    // Enter to finish editing
    if (e.key === "Enter") {
      return
    }
  }

  const handleSelect = (optionId: string) => {
    setSelectedValue(optionId)
    // 选择后立即保存（单选的常规交互）
    setOpen(false)
    onFinishedEditing(optionId)
  }

  return (
    <Popover open={open}>
      <PopoverTrigger>
        <div />
      </PopoverTrigger>
      <PopoverContent
        className="click-outside-ignore z-[10000] w-[240px] p-0 border-0 shadow-none bg-transparent"
        align="start"
        sideOffset={-6}
        alignOffset={-9}
        onPointerDownOutside={() => {
          handleSave()
        }}
      >
        <div
          className="bg-popover rounded-lg border shadow-lg overflow-hidden flex flex-col click-outside-ignore"
          onKeyDown={handleKeyDown}
        >
          <Command className="[&_[cmdk-input-wrapper]]:px-2.5 [&_[cmdk-input-wrapper]]:py-2 [&_[cmdk-input]]:h-7">
            <CommandInput
              placeholder="Search..."
              value={searchValue}
              onValueChange={setSearchValue}
              className="border-0 focus:ring-0 text-sm"
            />
            <CommandList className="max-h-[220px] overflow-y-auto">
              <CommandEmpty className="py-4 text-xs text-muted-foreground text-center">
                No options
              </CommandEmpty>
              <CommandGroup className="px-1 pb-1">
                {allowedValues.map((option) => {
                  const isSelected = selectedValue === option.id
                  const bgColor = baseOptionColor(
                    option.color,
                    themeName === "dark" ? "dark" : "light"
                  )
                  return (
                    <CommandItem
                      key={option.id}
                      value={option.name}
                      onSelect={(currentValue) => {
                        handleSelect(
                          currentValue === oldOptionName ? "" : option.id
                        )
                      }}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer",
                        "transition-colors duration-100",
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          isSelected && "ring-1 ring-current"
                        )}
                        style={{ backgroundColor: bgColor }}
                      />

                      <span className="flex-1 truncate text-sm">
                        {option.name}
                      </span>

                      <Check
                        className={cn(
                          "h-3 w-3 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  )
                })}

                {allowCreate &&
                  Boolean(searchValue.length) &&
                  allowedValues.findIndex((item) => item.name == searchValue) ==
                    -1 && (
                    <CommandItem
                      key={searchValue}
                      value={searchValue}
                      autoFocus
                      onSelect={(currentValue) => {
                        handleSelect(currentValue)
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer mt-1 border-t border-dashed border-border/30 pt-1.5"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: baseOptionColor(
                            nextColorName,
                            themeName === "dark" ? "dark" : "light"
                          ),
                        }}
                      />
                      <span className="flex-1 truncate text-sm">
                        Create "{searchValue}"
                      </span>
                    </CommandItem>
                  )}
              </CommandGroup>
            </CommandList>
          </Command>

          {/* Footer */}
          <div className="flex items-center justify-between px-2.5 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground shrink-0">
            <span>{allowedValues.length}</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-muted border text-[9px] font-sans">
                ↵
              </kbd>
              <span>save</span>
              <span className="mx-0.5">·</span>
              <kbd className="px-1 rounded bg-muted border text-[9px] font-sans">
                Esc
              </kbd>
              <span>cancel</span>
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const renderer: CustomRenderer<SelectCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is SelectCell => (c.data as any).kind === "select-cell",
  draw: (args, cell) => {
    const { ctx, theme, rect } = args
    const { value, allowedValues } = cell.data
    const displayValue =
      allowedValues.find((t) => t.id === value)?.name ?? value ?? ""
    if (!value) {
      return true
    }
    const currentTheme = (theme as any).name
    const colorName = allowedValues.find((t) => t.id === value)?.color
    const color = baseOptionColor(
      colorName ?? "default",
      currentTheme === "dark" ? "dark" : "light"
    )
    const drawArea: Rectangle = {
      x: rect.x + theme.cellHorizontalPadding,
      y: rect.y + theme.cellVerticalPadding,
      width: rect.width - 2 * theme.cellHorizontalPadding,
      height: rect.height - 2 * theme.cellVerticalPadding,
    }
    const tagHeight = 20
    const innerPad = 6
    const rows = Math.max(
      1,
      Math.floor(drawArea.height / (tagHeight + innerPad))
    )
    const metrics = measureTextCached(displayValue, ctx)
    const width = metrics.width + innerPad * 2
    let x = drawArea.x
    let y =
      drawArea.y +
      (drawArea.height - rows * tagHeight - (rows - 1) * innerPad) / 2
    if (color) {
      ctx.fillStyle = color
      ctx.beginPath()
      roundedRect(ctx, x, y, width, tagHeight, 4)
      ctx.fill()
    }
    ctx.fillStyle = theme.textDark
    ctx.fillText(
      displayValue,
      rect.x + theme.cellHorizontalPadding + innerPad,
      rect.y + rect.height / 2 + getMiddleCenterBias(ctx, theme)
    )

    return true
  },
  provideEditor: () => (p) => {
    const { value: cell, onFinishedEditing, theme } = p
    const { allowedValues, allowCreate = true, value: valueIn } = cell.data
    const themeName = (theme as any).name

    const handleFinishedEditing = (finalValue: string | null) => {
      const newCell = {
        ...cell,
        data: {
          ...cell.data,
          value: finalValue,
        },
      }
      onFinishedEditing(newCell, [0, 1])
    }

    const handleCancelEditing = () => {
      onFinishedEditing(undefined, [0, 0])
    }

    return (
      <SelectEditor
        value={valueIn}
        allowedValues={allowedValues}
        allowCreate={allowCreate}
        themeName={themeName}
        onFinishedEditing={handleFinishedEditing}
        onCancelEditing={handleCancelEditing}
      />
    )
  },

  onPaste: (v, d) => {
    return {
      ...d,
      value: (d as any as SelectCell).data.allowedValues
        .map((i) => i.name)
        .includes(v)
        ? v
        : d.value,
    }
  },
  onDelete: (d) => ({
    ...d,
    data: {
      ...d.data,
      value: "",
    },
  }),
}

export default renderer
