import * as React from "react"
import type {
  CustomCell,
  CustomRenderer,
  ProvideEditorComponent,
} from "@glideapps/glide-data-grid"
import { GridCellKind, drawTextCell } from "@glideapps/glide-data-grid"
import { CalendarDays } from "lucide-react"

import { useEidosFileUI } from "../context"
import { Button, Calendar } from "../ui/primitives"
import { Popover, PopoverTrigger } from "../ui/primitives"

import {
  EIDOS_FILE_GRID_EDITOR_CONTROL_CLASS_NAME,
  EIDOS_FILE_GRID_EDITOR_FOOTER_CLASS_NAME,
  EidosFileGridEditorHeader,
  EidosFileGridEditorPopoverContent,
  EidosFileGridEditorSurface,
  eidosFileGridPopupEditor,
} from "./grid-editor-surface"

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
    date
      ? format === "date"
        ? toDateInputValue(date)
        : toDatetimeLocalValue(date)
      : ""
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
      } else {
        setInputValue("")
      }
    },
    [format]
  )

  const handleSave = React.useCallback(() => {
    setOpen(false)
    onFinishedEditing(selectedDate)
  }, [selectedDate, onFinishedEditing])

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
      <EidosFileGridEditorPopoverContent
        onPointerDownOutside={() => {
          // 点击外部视为 Enter 保存，使用当前选中的值
          handleSave()
        }}
      >
        <EidosFileGridEditorSurface onKeyDown={handleKeyDown}>
          <EidosFileGridEditorHeader
            icon={<CalendarDays />}
            title={
              format === "date" ? t("Choose date") : t("Choose date & time")
            }
          />
          <div className={EIDOS_FILE_GRID_EDITOR_CONTROL_CLASS_NAME}>
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
              className="h-8 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-ring focus:ring-0"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
              className="mx-auto rounded-md border-none p-1 outline-hidden"
              classNames={{
                month: "space-y-2",
                row: "mt-1 flex w-full",
              }}
              navButtonClassName="shadow-none"
            />
          </div>

          <div
            className={`${EIDOS_FILE_GRID_EDITOR_FOOTER_CLASS_NAME} justify-between`}
          >
            <span>{t("Enter saves · Esc cancels")}</span>
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

export const EidosFileDatePickerCellEditor: ProvideEditorComponent<
  DatePickerCell
> = (p) => {
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
  provideEditor: (cell) => {
    if (cell.readonly === true) {
      return undefined
    }
    return eidosFileGridPopupEditor(EidosFileDatePickerCellEditor)
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
    if (d.readonly === true) {
      return undefined
    }
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
