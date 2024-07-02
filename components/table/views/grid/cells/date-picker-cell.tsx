import * as React from "react"
import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
  drawTextCell,
} from "@glideapps/glide-data-grid"

import { Calendar } from "@/components/ui/calendar"

interface DatePickerCellProps {
  readonly kind: "date-picker-cell"
  readonly date: Date | undefined
  readonly displayDate: string
  readonly format: "date" | "datetime-local"
}

export type DatePickerCell = CustomCell<DatePickerCellProps>

const renderer: CustomRenderer<DatePickerCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is DatePickerCell =>
    (cell.data as any).kind === "date-picker-cell",
  draw: (args, cell) => {
    const { displayDate } = cell.data
    drawTextCell(args, displayDate, cell.contentAlign)
    return true
  },
  provideEditor: () => (p) => {
    const cellData = p.value.data
    const { format, date } = cellData

    let val = ""
    if (date !== undefined) {
      val = date.toISOString()
      if (format === "date") {
        val = val.split("T")[0]
      }
    }
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={(d) => {
          p.onChange({
            ...p.value,
            data: {
              ...p.value.data,
              date: d ?? undefined,
              displayDate: d?.toLocaleString() ?? "",
            },
          })
        }}
        className="rounded-md border-none outline-none"
      />
    )
  },
  onPaste: (v, d) => {
    let newDate: Date | undefined
    console.log("onPaste", v, d)
    try {
      newDate = new Date(v)
    } catch {
      /* do nothing */
    }

    return {
      ...d,
      date: Number.isNaN(newDate) ? undefined : newDate,
      displayDate: newDate?.toLocaleString() ?? "",
    }
  },
  onDelete: (d) => {
    return {
      ...d,
      data: {
        ...d.data,
        date: undefined,
        displayDate: "",
      },
    }
  },
}

export default renderer
