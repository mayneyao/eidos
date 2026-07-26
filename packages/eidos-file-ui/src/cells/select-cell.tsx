import * as React from "react"
import {
  eidosFileOptionColor,
  nextEidosFileOptionColor,
} from "../eidos-file-field-properties"
import type { EidosFileGridSelectOption as SelectOption } from "../eidos-file-grid-adapter"
import {
  GridCellKind,
  getMiddleCenterBias,
  measureTextCached,
  type CustomCell,
  type CustomRenderer,
  type ProvideEditorComponent,
  type Rectangle,
} from "@glideapps/glide-data-grid"
import { Check, Tag } from "lucide-react"

import { useEidosFileUI } from "../context"
import { cn } from "../lib/cn"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Button,
} from "../ui/primitives"
import { Popover, PopoverTrigger } from "../ui/primitives"
import { SelectOptionItem } from "../ui/select-option-item"

import {
  EIDOS_FILE_GRID_EDITOR_CONTROL_CLASS_NAME,
  EIDOS_FILE_GRID_EDITOR_FOOTER_CLASS_NAME,
  EidosFileGridEditorHeader,
  EidosFileGridEditorPopoverContent,
  EidosFileGridEditorSurface,
  eidosFileGridPopupEditor,
} from "./grid-editor-surface"
import { roundedRect } from "./grid-cell-helper"

interface SelectCellProps {
  readonly kind: "select-cell"
  readonly value: string | null
  readonly allowedValues: readonly SelectOption[]
  readonly allowCreate?: boolean
  readonly onCreateOption?: (options: readonly SelectOption[]) => Promise<void>
  readonly readonly?: boolean
}

export type SelectCell = CustomCell<SelectCellProps>

interface SelectEditorProps {
  value: string | null
  allowedValues: readonly SelectOption[]
  allowCreate: boolean
  onCreateOption?: (options: readonly SelectOption[]) => Promise<void>
  themeName: string
  onFinishedEditing: (
    value: string | null,
    options?: readonly SelectOption[]
  ) => void
  onCancelEditing: () => void
}

function SelectEditor(props: SelectEditorProps) {
  const { translate: t } = useEidosFileUI()
  const {
    value: valueIn,
    allowedValues,
    allowCreate,
    onCreateOption,
    themeName,
    onFinishedEditing,
    onCancelEditing,
  } = props

  const [open, setOpen] = React.useState(true)
  const [searchValue, setSearchValue] = React.useState("")
  const [selectedValue, setSelectedValue] = React.useState<string | null>(
    valueIn
  )
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState(false)
  const canCreate = allowCreate && Boolean(onCreateOption)

  const nextColorName = nextEidosFileOptionColor([...allowedValues])

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

  const handleCreate = async (rawName: string) => {
    const name = rawName.trim()
    if (
      !name ||
      creating ||
      !onCreateOption ||
      allowedValues.some((option) => option.name === name)
    ) {
      return
    }
    const option = { id: name, name, color: nextColorName }
    const options = [...allowedValues, option]
    setCreating(true)
    setCreateError(false)
    try {
      await onCreateOption(options)
      setSelectedValue(name)
      setOpen(false)
      onFinishedEditing(name, options)
    } catch {
      setCreateError(true)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Popover open={open}>
      <PopoverTrigger>
        <div />
      </PopoverTrigger>
      <EidosFileGridEditorPopoverContent
        onPointerDownOutside={() => {
          handleSave()
        }}
      >
        <EidosFileGridEditorSurface onKeyDown={handleKeyDown}>
          <EidosFileGridEditorHeader
            icon={<Tag />}
            title={t("Select option")}
          />
          <Command className="min-h-0 flex-1 rounded-none bg-transparent">
            <div
              className={`${EIDOS_FILE_GRID_EDITOR_CONTROL_CLASS_NAME} [&_[cmdk-input-wrapper]]:h-8 [&_[cmdk-input-wrapper]]:rounded-md [&_[cmdk-input-wrapper]]:border [&_[cmdk-input-wrapper]]:px-2 [&_[cmdk-input]]:h-7`}
            >
              <CommandInput
                placeholder={t("Search...")}
                value={searchValue}
                onValueChange={setSearchValue}
                className="border-0 text-xs focus:ring-0"
              />
            </div>
            <CommandList className="max-h-[220px] overflow-y-auto">
              <CommandEmpty className="py-4 text-xs text-muted-foreground text-center">
                {t("No options")}
              </CommandEmpty>
              <CommandGroup className="px-1 pb-1">
                {allowedValues.map((option) => {
                  const isSelected = selectedValue === option.id
                  return (
                    <CommandItem
                      key={option.id}
                      value={option.name}
                      onSelect={() => {
                        handleSelect(option.id)
                      }}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer",
                        "transition-colors duration-100",
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <SelectOptionItem
                        theme={themeName === "dark" ? "dark" : "light"}
                        option={option}
                        className="max-w-[220px]"
                      />

                      <Check
                        className={cn(
                          "h-3 w-3 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  )
                })}

                {canCreate &&
                  Boolean(searchValue.trim().length) &&
                  allowedValues.findIndex(
                    (item) => item.name === searchValue.trim()
                  ) === -1 && (
                    <CommandItem
                      key={searchValue}
                      value={searchValue}
                      autoFocus
                      disabled={creating}
                      onSelect={() => {
                        void handleCreate(searchValue)
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer mt-1 border-t border-dashed border-border/30 pt-1.5"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: eidosFileOptionColor(
                            nextColorName,
                            themeName === "dark" ? "dark" : "light"
                          ),
                        }}
                      />
                      <span className="flex-1 truncate text-sm">
                        {t('Create "{value}"', { value: searchValue })}
                      </span>
                    </CommandItem>
                  )}
              </CommandGroup>
            </CommandList>
          </Command>

          <div
            className={`${EIDOS_FILE_GRID_EDITOR_FOOTER_CLASS_NAME} justify-between`}
          >
            <span>
              {createError
                ? t("Unable to create option")
                : t("Arrow keys navigate · Enter selects")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={handleSave}
            >
              {t("Done")}
            </Button>
          </div>
        </EidosFileGridEditorSurface>
      </EidosFileGridEditorPopoverContent>
    </Popover>
  )
}

export const EidosFileSelectCellEditor: ProvideEditorComponent<SelectCell> = (
  p
) => {
  const { value: cell, onFinishedEditing, theme } = p
  const {
    allowedValues,
    allowCreate = true,
    onCreateOption,
    value: valueIn,
  } = cell.data
  const themeName = (theme as { name?: string }).name ?? "light"

  const handleFinishedEditing = (
    finalValue: string | null,
    finalOptions: readonly SelectOption[] = allowedValues
  ) => {
    const newCell = {
      ...cell,
      data: {
        ...cell.data,
        value: finalValue,
        allowedValues: finalOptions,
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
      onCreateOption={onCreateOption}
      themeName={themeName}
      onFinishedEditing={handleFinishedEditing}
      onCancelEditing={handleCancelEditing}
    />
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
    const color = eidosFileOptionColor(
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
  provideEditor: () => eidosFileGridPopupEditor(EidosFileSelectCellEditor),

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
