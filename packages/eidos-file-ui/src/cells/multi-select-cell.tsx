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
import { Tags, XIcon } from "lucide-react"

import { useEidosFileUI } from "../context"
import { cn } from "../lib/cn"
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
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

interface MultiSelectCellProps {
  readonly kind: "multi-select-cell"
  //  option id
  readonly values: readonly string[] | null
  readonly readonly?: boolean
  readonly allowedValues: readonly SelectOption[]
  readonly allowCreate?: boolean
  readonly onCreateOption?: (options: readonly SelectOption[]) => Promise<void>
}

export type MultiSelectCell = CustomCell<MultiSelectCellProps>

const tagHeight = 20
const innerPad = 6

export const Editor: ProvideEditorComponent<MultiSelectCell> = (p) => {
  const { translate: t } = useEidosFileUI()
  const { value: cell, onChange, theme, onFinishedEditing } = p
  const {
    allowedValues,
    allowCreate = true,
    onCreateOption,
    values = [],
  } = cell.data
  const selectedValues = values ?? []

  const themeName = (theme as any).name
  const inputRef = React.useRef<HTMLInputElement>(null)

  const allowedValuesMap = React.useMemo(
    () =>
      allowedValues.reduce(
        (res, option) => {
          res[option.id] = option
          return res
        },
        {} as Record<string, SelectOption>
      ),
    [allowedValues]
  )
  const currentOptions = selectedValues
    .map((optionId) => allowedValuesMap[optionId])
    .filter(Boolean)

  const [currentSelect, setCurrentSelect] = React.useState("")
  const setNewValues = (
    newValues: string[],
    nextAllowedValues: readonly SelectOption[] = allowedValues
  ) => {
    onChange({
      ...cell,
      data: {
        ...cell.data,
        values: newValues,
        allowedValues: nextAllowedValues,
      },
    })
  }

  const clickRemoveOption = (e: any) => {
    const optionId = e.target.dataset.id
    const set = new Set<string>(selectedValues)
    set.delete(optionId)
    setNewValues(Array.from(set))
  }
  const handleSelect = (value?: string) => {
    if (!value) return
    setInputValue("")
    const set = new Set<string>(selectedValues)
    if (set.has(value)) {
      set.delete(value)
    } else {
      set.add(value)
    }
    setNewValues(Array.from(set))
    inputRef.current?.focus()
  }
  const [inputValue, setInputValue] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState(false)
  const canCreate = allowCreate && Boolean(onCreateOption)

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
    const option = {
      id: name,
      name,
      color: nextEidosFileOptionColor(allowedValues),
    }
    const nextAllowedValues = [...allowedValues, option]
    setCreating(true)
    setCreateError(false)
    try {
      await onCreateOption(nextAllowedValues)
      const nextValues = Array.from(new Set([...selectedValues, name]))
      setNewValues(nextValues, nextAllowedValues)
      setInputValue("")
      inputRef.current?.focus()
    } catch {
      setCreateError(true)
    } finally {
      setCreating(false)
    }
  }

  const [open, setOpen] = React.useState(true)

  const handleSave = React.useCallback(() => {
    setOpen(false)
    onFinishedEditing(cell, [0, 1])
  }, [cell, onFinishedEditing])

  const handleCancel = React.useCallback(() => {
    setOpen(false)
    onFinishedEditing(undefined, [0, 0])
  }, [onFinishedEditing])

  const handleBackspace: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Backspace" && !inputValue?.length) {
      const _values: string[] = Array.from(selectedValues)
      _values.pop()
      setNewValues(_values)
    }
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      handleCancel()
      return
    }
    if (e.key === "Enter") {
      e.stopPropagation()
      const currentOptionId = allowedValues.find(
        (option) => option.name == currentSelect
      )?.id
      if (currentOptionId) {
        handleSelect(currentOptionId)
        setInputValue("")
      } else {
        if (!canCreate || !inputValue.trim().length) return
        void handleCreate(inputValue)
      }
    }
  }

  return (
    <Popover open={open}>
      <PopoverTrigger>
        <div />
      </PopoverTrigger>
      <EidosFileGridEditorPopoverContent onPointerDownOutside={handleSave}>
        <EidosFileGridEditorSurface className="max-h-[390px]">
          <EidosFileGridEditorHeader
            icon={<Tags />}
            title={t("Select options")}
          />
          <Command
            value={currentSelect}
            onValueChange={setCurrentSelect}
            className="min-h-0 flex-1 rounded-none bg-transparent"
          >
            <div
              className={`${EIDOS_FILE_GRID_EDITOR_CONTROL_CLASS_NAME} flex min-h-12 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <div className="flex min-h-8 flex-wrap items-center gap-1.5">
                {currentOptions.map((option) => (
                  <div
                    key={option.id}
                    className="flex h-6 items-center gap-2 truncate rounded-xs px-2 text-sm"
                    style={{
                      background: eidosFileOptionColor(
                        option.color,
                        themeName === "dark" ? "dark" : "light"
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
                <div className="[&_[cmdk-input-wrapper]_svg]:hidden [&_[cmdk-input-wrapper]]:border-none">
                  <CommandInput
                    ref={inputRef}
                    onKeyDown={handleBackspace}
                    value={inputValue}
                    onValueChange={setInputValue}
                    className="h-6 border-none p-0 text-xs focus:ring-0 focus-visible:ring-0"
                    autoFocus
                  />
                </div>
              </div>
            </div>
            <CommandList
              className={cn("max-h-[220px]", {
                "overflow-y-scroll": allowedValues.length * 32 > 220,
              })}
            >
              <CommandEmpty>
                {canCreate ? t("Create option") : t("No options")}
              </CommandEmpty>
              <CommandGroup className="h-full">
                {allowedValues.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.name}
                    onSelect={(currentValue) => {
                      handleSelect(option.id)
                    }}
                  >
                    <SelectOptionItem theme={themeName} option={option} />
                  </CommandItem>
                ))}
                {canCreate &&
                  Boolean(inputValue.trim().length) &&
                  allowedValues.findIndex(
                    (item) => item.name === inputValue.trim()
                  ) === -1 && (
                    <CommandItem
                      key={inputValue}
                      value={inputValue}
                      className="flex items-center gap-2"
                      autoFocus
                      disabled={creating}
                      onSelect={() => {
                        void handleCreate(inputValue)
                      }}
                    >
                      <span>{t("Create")}</span>
                      <SelectOptionItem
                        theme={themeName}
                        option={{
                          id: inputValue,
                          name: inputValue,
                          color: nextEidosFileOptionColor([...allowedValues]),
                        }}
                      />
                    </CommandItem>
                  )}
              </CommandGroup>
            </CommandList>
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
          </Command>
        </EidosFileGridEditorSurface>
      </EidosFileGridEditorPopoverContent>
    </Popover>
  )
}

const renderer: CustomRenderer<MultiSelectCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is MultiSelectCell =>
    (c.data as any).kind === "multi-select-cell",
  draw: (args, cell) => {
    const { ctx, theme, rect } = args
    const { allowedValues, values } = cell.data

    const themeName = (theme as any).name
    const drawArea: Rectangle = {
      x: rect.x + theme.cellHorizontalPadding,
      y: rect.y + theme.cellVerticalPadding,
      width: rect.width - 2 * theme.cellHorizontalPadding,
      height: rect.height - 2 * theme.cellVerticalPadding,
    }
    const maxRows = Math.max(
      1,
      Math.floor(drawArea.height / (tagHeight + innerPad))
    )

    ctx.font = `12px ${theme.fontFamily}`
    let rowsUsed = 1
    {
      let x = drawArea.x
      for (const optionId of values!) {
        const option = allowedValues.find((t) => t.id === optionId)
        const name = option?.name ?? optionId ?? ""
        const width = measureTextCached(name, ctx).width + innerPad * 2
        if (
          x !== drawArea.x &&
          x + width > drawArea.x + drawArea.width &&
          rowsUsed < maxRows
        ) {
          rowsUsed++
          x = drawArea.x
        }
        x += width + 8
        if (x > drawArea.x + drawArea.width && rowsUsed >= maxRows) break
      }
    }

    let x = drawArea.x
    let y =
      drawArea.y +
      (drawArea.height - rowsUsed * tagHeight - (rowsUsed - 1) * innerPad) / 2
    let row = 1
    for (const optionId of values!) {
      const option = allowedValues.find((t) => t.id === optionId)
      const colorName = option?.color
      const color = eidosFileOptionColor(
        colorName ?? "default",
        themeName === "dark" ? "dark" : "light"
      )
      const name = option?.name ?? optionId ?? ""

      const metrics = measureTextCached(name, ctx)
      const width = metrics.width + innerPad * 2
      const textY = tagHeight / 2

      if (
        x !== drawArea.x &&
        x + width > drawArea.x + drawArea.width &&
        row < maxRows
      ) {
        row++
        y += tagHeight + innerPad
        x = drawArea.x
      }

      ctx.fillStyle = color
      ctx.beginPath()
      roundedRect(ctx, x, y, width, tagHeight, 4)
      ctx.fill()

      ctx.fillStyle = theme.textDark
      ctx.fillText(
        name,
        x + innerPad,
        y + textY + getMiddleCenterBias(ctx, `12px ${theme.fontFamily}`)
      )

      x += width + 8
      if (x > drawArea.x + drawArea.width && row >= maxRows) break
    }

    return true
  },
  provideEditor: () => eidosFileGridPopupEditor(Editor),
  onPaste: (v, d) => {
    // trim " and '
    v = v.replace(/^["'](.*)["']$/, "$1")
    const ids = Array.from(
      new Set(
        v
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      )
    )
    return {
      ...d,
      values: ids,
    }
  },
  onDelete(cell) {
    return {
      ...cell,
      data: {
        ...cell.data,
        values: [],
      },
    }
  },
}

export default renderer
