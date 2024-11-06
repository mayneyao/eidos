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
import { Check } from "lucide-react"

import { SelectField, SelectOption } from "@/lib/fields/select"
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
import { SelectOptionItem } from "@/components/table/cell-editor/common"

import { roundedRect } from "./helper"

interface SelectCellProps {
  readonly kind: "select-cell"
  readonly value: string | null
  readonly allowedValues: readonly SelectOption[]
  readonly readonly?: boolean
}

export type SelectCell = CustomCell<SelectCellProps>

export const Editor: ReturnType<ProvideEditorCallback<SelectCell>> = (p) => {
  const { value: cell, onFinishedEditing, initialValue, theme } = p
  const { allowedValues, value: valueIn } = cell.data
  const createNewOptionRef = React.useRef<HTMLInputElement>(null)

  const themeName = (theme as any).name
  const oldOptionName = allowedValues.find((item) => item.id == valueIn)?.name
  const nextColorName = SelectField.getNextAvailableColor([...allowedValues])

  const handleSelect = (value: string) => {
    setValue(value)
    onFinishedEditing({
      ...cell,
      data: {
        ...cell.data,
        value,
      },
    })
    setOpen(false)
  }
  const [open, setOpen] = React.useState(true)
  //  input
  const [value, setValue] = React.useState("")
  React.useEffect(() => {
    if (allowedValues.findIndex((item) => item.name == value) == -1) {
      setTimeout(() => {
        createNewOptionRef.current?.focus()
      }, 200)
    }
  }, [allowedValues, value])

  return (
    <Popover open={open}>
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
        <Command>
          <CommandInput
            placeholder="Search Option..."
            // value={value}
            onValueChange={setValue}
          />
          <div
            className={cn("max-h-[400px]", {
              "overflow-y-scroll": allowedValues.length * 32 > 400,
            })}
          >
            <CommandEmpty>Create some options</CommandEmpty>
            <CommandGroup className="h-full">
              {allowedValues.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={(currentValue) => {
                    handleSelect(
                      currentValue === oldOptionName ? "" : option.id
                    )
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      valueIn === option.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <SelectOptionItem theme={themeName} option={option} />
                </CommandItem>
              ))}
              {Boolean(value.length) &&
                allowedValues.findIndex((item) => item.name == value) == -1 && (
                  <CommandItem
                    key={value}
                    ref={createNewOptionRef}
                    className="flex items-center gap-2"
                    value={value}
                    onSelect={(currentValue) => {
                      handleSelect(currentValue)
                    }}
                  >
                    <span>Create</span>
                    <SelectOptionItem
                      theme={themeName}
                      option={{
                        id: value,
                        name: value,
                        color: nextColorName,
                      }}
                    />
                  </CommandItem>
                )}
            </CommandGroup>
          </div>
        </Command>
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
    // if (!value || !displayValue) {
    // if has value but no displayValue, it's means the value is not in allowedValues, we will display a blank box, we don't delete the value, let user to delete it
    if (!value) {
      return true
    }
    const currentTheme = (theme as any).name
    const colorName = allowedValues.find((t) => t.id === value)?.color
    const color = SelectField.getColorValue(
      colorName ?? "default",
      currentTheme
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
    return <Editor {...p} />
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
