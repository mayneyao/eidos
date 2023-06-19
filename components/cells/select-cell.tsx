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

import { roundedRect } from "./helper"

interface SelectCellProps {
  readonly kind: "select-cell"
  readonly value: string
  readonly allowedValues: readonly {
    tag: string
    color: string
  }[]
  readonly readonly?: boolean
}

export type SelectCell = CustomCell<SelectCellProps>

const Editor: ReturnType<ProvideEditorCallback<SelectCell>> = (p) => {
  const { value: cell, onFinishedEditing, initialValue } = p
  const { allowedValues, value: valueIn } = cell.data

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

  return (
    <Popover open={open}>
      <PopoverTrigger>
        <div />
      </PopoverTrigger>
      <PopoverContent
        className="click-outside-ignore w-[200px] p-0"
        align="start"
        sideOffset={-6}
        alignOffset={-9}
        onMouseDown={(e) => console.log(e)}
        onMouseDownCapture={console.log}
        asChild={true}
      >
        <Command>
          <CommandInput
            placeholder="Search Option..."
            // value={value}
            onValueChange={setValue}
          />
          <CommandEmpty>Create option(todo)</CommandEmpty>
          <CommandGroup>
            {allowedValues.map((option) => (
              <CommandItem
                key={option.tag}
                value={option.tag}
                onSelect={(currentValue) => {
                  handleSelect(currentValue === valueIn ? "" : currentValue)
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    valueIn === option.tag ? "opacity-100" : "opacity-0"
                  )}
                />
                <span
                  className="rounded-sm px-2"
                  style={{
                    background: option.color,
                  }}
                >
                  {option.tag}
                </span>
              </CommandItem>
            ))}
            {Boolean(value.length) &&
              allowedValues.findIndex((item) => item.tag == value) == -1 && (
                <CommandItem
                  key={value}
                  value={value}
                  onSelect={(currentValue) => {
                    handleSelect(currentValue)
                  }}
                >
                  Create {value}
                </CommandItem>
              )}
          </CommandGroup>
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
    const color = allowedValues.find((t) => t.tag === value)?.color
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
    const metrics = measureTextCached(value, ctx)
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
      value,
      rect.x + theme.cellHorizontalPadding + innerPad,
      rect.y + rect.height / 2 + getMiddleCenterBias(ctx, theme)
    )

    return true
  },
  provideEditor: () => (p) => {
    return <Editor {...p} />
  },
  onPaste: (v, d) => ({
    ...d,
    value: d.allowedValues.map((i) => i.tag).includes(v) ? v : d.value,
  }),
  onDelete: (d) => ({
    ...d,
    data: {
      ...d.data,
      value: "",
    },
  }),
}

export default renderer
