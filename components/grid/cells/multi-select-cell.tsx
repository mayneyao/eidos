import * as React from "react"
import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
  ProvideEditorCallback,
  Rectangle,
  getMiddleCenterBias,
  measureTextCached,
} from "@glideapps/glide-data-grid"
import { XIcon } from "lucide-react"

import { SelectField, SelectOption } from "@/lib/fields/select"
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
import { SelectOptionItem } from "@/components/table/cell-editor/common"

import { roundedRect } from "./helper"
import { cn } from "@/lib/utils"

interface MultiSelectCellProps {
  readonly kind: "multi-select-cell"
  //  option id
  readonly values: readonly string[]
  readonly readonly?: boolean
  readonly allowedValues: readonly SelectOption[]
}

export type MultiSelectCell = CustomCell<MultiSelectCellProps>

const tagHeight = 20
const innerPad = 6

export const Editor: ReturnType<ProvideEditorCallback<MultiSelectCell>> = (
  p
) => {
  const { value: cell, initialValue, onChange, theme, onFinishedEditing } = p
  const { allowedValues, values } = cell.data
  const allowedValuesMap = allowedValues.reduce((res, option) => {
    res[option.id] = option
    return res
  }, {} as Record<string, SelectOption>)
  const themeName = (theme as any).name
  const [oldValues, setOldValues] = React.useState(values)

  const oldOptions = values
    .map((optionId) => allowedValuesMap[optionId])
    .filter(Boolean)

  const [newOptions, setNewOptions] = React.useState<SelectOption[]>([])

  const [currentSelect, setCurrentSelect] = React.useState("")
  const setNewValues = (newValues: string[]) => {
    onChange({
      ...cell,
      data: {
        ...cell.data,
        values: newValues,
      },
    })
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
      if (JSON.stringify(oldValues) == JSON.stringify(values)) {
        return
      }
      onFinishedEditing(cell)
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
        // is creating new option
        handleSelect(currentSelect)
        setInputValue("")
        setNewOptions([
          ...newOptions,
          { id: currentSelect, name: currentSelect, color: "default" },
        ])
      }
    }
  }

  const [open, setOpen] = React.useState(true)

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // on
    }
    setOpen(open)
  }

  const allOptions = React.useMemo(
    () => [...oldOptions, ...newOptions],
    [oldOptions, newOptions]
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>
        <div />
      </PopoverTrigger>
      <PopoverContent
        // z-index 10000 > gdg editor portal z index
        className="click-outside-ignore z-[10000] w-[300px] p-0"
        align="start"
        sideOffset={-6}
        alignOffset={-9}
        // onMouseDownCapture={console.log}
        asChild={true}
      >
        <Command value={currentSelect} onValueChange={setCurrentSelect}>
          <div className="flex w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50">
            <div className="flex flex-wrap gap-2 px-2">
              {allOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex h-6 items-center gap-2  truncate rounded-sm px-2 text-sm"
                  style={{
                    background: SelectField.getColorValue(
                      option.color,
                      themeName
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
              "overflow-y-scroll": allowedValues.length * 32 > 400,
            })}
          >
            {" "}
            <CommandEmpty>Create option</CommandEmpty>
            <CommandGroup className="h-full border-t">
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
              {Boolean(inputValue.length) &&
                allowedValues.findIndex((item) => item.name == inputValue) ==
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
    const rows = Math.max(
      1,
      Math.floor(drawArea.height / (tagHeight + innerPad))
    )

    let x = drawArea.x
    let row = 1
    let y =
      drawArea.y +
      (drawArea.height - rows * tagHeight - (rows - 1) * innerPad) / 2
    for (const optionId of values) {
      const option = allowedValues.find((t) => t.id === optionId)
      const colorName = option?.color
      const color = SelectField.getColorValue(colorName ?? "default", themeName)
      const name = option?.name ?? ""

      ctx.font = `12px ${theme.fontFamily}`
      const metrics = measureTextCached(name, ctx)
      const width = metrics.width + innerPad * 2
      const textY = tagHeight / 2

      if (
        x !== drawArea.x &&
        x + width > drawArea.x + drawArea.width &&
        row < rows
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
      if (x > drawArea.x + drawArea.width && row >= rows) break
    }

    return true
  },
  provideEditor: () => (p) => {
    return <Editor {...p} />
  },
  onPaste: (v, d) => {
    // trim " and '
    v = v.replace(/^["'](.*)["']$/, "$1")
    const ids = v.split(",").map((s) => s.trim())
    const allowedValuesSet = new Set(d.allowedValues.map((v) => v.id))
    return {
      ...d,
      values: ids.filter((id) => allowedValuesSet.has(id)),
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
