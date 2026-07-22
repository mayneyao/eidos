import * as React from "react"
import type { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid"
import { GridCellKind, drawTextCell } from "@glideapps/glide-data-grid"

import { useEidosFileUI } from "../context"
import { Calendar } from "../ui/primitives"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/primitives"

interface DatePickerCellProps {
  readonly kind: "date-picker-cell"
  readonly date: Date | undefined
  readonly displayDate: string
  readonly format: "date" | "datetime-local"
}

export type DatePickerCell = CustomCell<DatePickerCellProps>

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function toDatetimeLocalValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${y}-${m}-${d}T${hours}:${minutes}`
}

function formatDateForDisplay(
  date: Date,
  format: "date" | "datetime-local"
): string {
  if (format === "date") {
    return date.toLocaleDateString()
  }
  return date.toLocaleString()
}

interface DatePickerEditorProps {
  format: "date" | "datetime-local"
  date: Date | undefined
  onFinishedEditing: (date: Date | undefined) => void
  onCancelEditing: () => void
}

function DatePickerEditor(props: DatePickerEditorProps) {
  const { locale, translate: t } = useEidosFileUI()
  const { format, date, onFinishedEditing, onCancelEditing } = props

  const defaultDate = date ?? new Date()
  const [open, setOpen] = React.useState(true)

  const [inputValue, setInputValue] = React.useState(
    format === "date"
      ? toDateInputValue(defaultDate)
      : toDatetimeLocalValue(defaultDate)
  )
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(date)
  const [month, setMonth] = React.useState<Date>(defaultDate)

  const commitDate = React.useCallback(
    (d: Date | undefined) => {
      setSelectedDate(d)
      if (d) {
        setMonth(d)
        setInputValue(
          format === "date" ? toDateInputValue(d) : toDatetimeLocalValue(d)
        )
      }
    },
    [format]
  )

  const handleSave = React.useCallback(
    (finalDate?: Date) => {
      setOpen(false)
      // 如果没有传值，使用选中的值或默认值
      const dateToSave = finalDate ?? selectedDate ?? defaultDate
      onFinishedEditing(dateToSave)
    },
    [selectedDate, defaultDate, onFinishedEditing]
  )

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
      e.preventDefault()
      e.stopPropagation()
      handleSave()
      return
    }
  }

  return (
    <Popover open={open}>
      <PopoverTrigger>
        <div />
      </PopoverTrigger>
      <PopoverContent
        className="click-outside-ignore z-[10000] w-auto p-0 border-0 shadow-none bg-transparent"
        align="start"
        sideOffset={-6}
        alignOffset={-9}
        onPointerDownOutside={() => {
          // 点击外部视为 Enter 保存，使用当前选中的值
          handleSave()
        }}
      >
        <div
          className="min-w-[280px] bg-popover rounded-lg border shadow-lg overflow-hidden flex flex-col click-outside-ignore"
          onKeyDown={handleKeyDown}
        >
          {/* Content */}
          <div className="flex flex-col gap-3 p-3 pt-4">
            {/* Date/DateTime Input */}
            <input
              type={format === "date" ? "date" : "datetime-local"}
              value={inputValue}
              autoFocus
              onChange={(e) => {
                const v = e.target.value
                setInputValue(v)
                if (!v) {
                  commitDate(undefined)
                  return
                }
                const d =
                  format === "date"
                    ? new Date(
                        Number(v.slice(0, 4)),
                        Number(v.slice(5, 7)) - 1,
                        Number(v.slice(8, 10))
                      )
                    : new Date(v)
                if (!Number.isNaN(d.getTime())) {
                  commitDate(d)
                }
              }}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            />

            {/* Calendar */}
            <Calendar
              mode="single"
              selected={selectedDate}
              month={month}
              onMonthChange={setMonth}
              onSelect={commitDate}
              formatters={
                locale === "zh"
                  ? {
                      formatCaption: (value) =>
                        `${value.getFullYear()}年${value.getMonth() + 1}月`,
                      formatWeekdayName: (value) =>
                        "日一二三四五六"[value.getDay()] ?? "",
                    }
                  : undefined
              }
              className="rounded-md border-none outline-hidden mx-auto"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center px-2.5 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground shrink-0">
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded bg-muted border text-[9px] font-sans">
                ↵
              </kbd>
              <span>{t("save")}</span>
              <span className="mx-0.5">·</span>
              <kbd className="px-1 rounded bg-muted border text-[9px] font-sans">
                Esc
              </kbd>
              <span>{t("cancel")}</span>
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

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

    const handleFinishedEditing = (finalDate: Date | undefined) => {
      const newCell = {
        ...p.value,
        data: {
          ...p.value.data,
          date: finalDate,
          displayDate: finalDate ? formatDateForDisplay(finalDate, format) : "",
        },
      }
      p.onFinishedEditing(newCell, [0, 1])
    }

    const handleCancelEditing = () => {
      p.onFinishedEditing(undefined, [0, 0])
    }

    return (
      <DatePickerEditor
        format={format}
        date={date}
        onFinishedEditing={handleFinishedEditing}
        onCancelEditing={handleCancelEditing}
      />
    )
  },
  onPaste: (v, d) => {
    const format = d.format ?? "date"
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    const newDate =
      format === "date" && date
        ? new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]))
        : new Date(v)

    return {
      ...d,
      date: Number.isNaN(newDate.getTime()) ? undefined : newDate,
      displayDate: Number.isNaN(newDate.getTime())
        ? ""
        : formatDateForDisplay(newDate, format),
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
