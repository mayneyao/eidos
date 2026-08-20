import * as React from "react"
import type {
  CustomCell,
  CustomRenderer,
  ProvideEditorComponent,
} from "@glideapps/glide-data-grid"
import { GridCellKind, drawTextCell } from "@glideapps/glide-data-grid"
import { CalendarDays } from "lucide-react"

import { useEidosFileUI } from "../context"
import {
  eidosFileDateTimeInputValue,
  eidosFileDateTimeParts,
  eidosFileInstantFromInputValue,
  eidosFileInstantFromWallDate,
  eidosFileResolvedTimeZone,
  eidosFileWallDate,
  eidosFileWallDateFromInputValue,
} from "../eidos-file-date-time"
import { formatEidosFileGridDate } from "../eidos-file-grid-date-format"
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
  readonly timeZone?: string
}

export type DatePickerCell = CustomCell<DatePickerCellProps>

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

interface DatePickerEditorProps {
  format: "date" | "datetime-local"
  date: Date | undefined
  timeZone?: string
  onFinishedEditing: (date: Date | undefined) => void
  onCancelEditing: () => void
}

function DatePickerEditor(props: DatePickerEditorProps) {
  const { locale, translate: t } = useEidosFileUI()
  const { format, date, timeZone, onFinishedEditing, onCancelEditing } = props

  const defaultDate =
    format === "datetime-local"
      ? eidosFileWallDate(date ?? new Date(), timeZone)
      : (date ?? new Date())
  const [open, setOpen] = React.useState(true)

  const [inputValue, setInputValue] = React.useState(
    date
      ? format === "date"
        ? toDateInputValue(date)
        : eidosFileDateTimeInputValue(date, timeZone)
      : ""
  )
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(date)
  const [month, setMonth] = React.useState<Date>(defaultDate)
  const [inputError, setInputError] = React.useState<string | null>(null)

  const commitDate = React.useCallback(
    (d: Date | undefined) => {
      setSelectedDate(d)
      setInputError(null)
      if (d) {
        setMonth(
          format === "datetime-local" ? eidosFileWallDate(d, timeZone) : d
        )
        setInputValue(
          format === "date"
            ? toDateInputValue(d)
            : eidosFileDateTimeInputValue(d, timeZone)
        )
      } else {
        setInputValue("")
      }
    },
    [format, timeZone]
  )

  const handleSave = React.useCallback(() => {
    if (inputError) return
    setOpen(false)
    onFinishedEditing(selectedDate)
  }, [inputError, selectedDate, onFinishedEditing])

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
                    ? eidosFileWallDateFromInputValue(v)
                    : eidosFileInstantFromInputValue(v, timeZone)
                if (d) {
                  commitDate(d)
                } else {
                  setInputError(
                    t(
                      "This time is ambiguous or unavailable in {timeZone}. Choose another time.",
                      { timeZone: eidosFileResolvedTimeZone(timeZone) }
                    )
                  )
                }
              }}
              className="h-8 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-ring focus:ring-0"
            />
            {format === "datetime-local" ? (
              <p
                className={
                  inputError
                    ? "mt-1 text-[10px] leading-4 text-destructive"
                    : "mt-1 text-[10px] text-muted-foreground"
                }
              >
                {inputError ??
                  t("Time zone: {timeZone}", {
                    timeZone: eidosFileResolvedTimeZone(timeZone),
                  })}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <Calendar
              mode="single"
              selected={
                selectedDate && format === "datetime-local"
                  ? eidosFileWallDate(selectedDate, timeZone)
                  : selectedDate
              }
              month={month}
              onMonthChange={setMonth}
              onSelect={(nextDate) => {
                if (!nextDate || format === "date") {
                  commitDate(nextDate)
                  return
                }
                const current = eidosFileDateTimeParts(
                  selectedDate ?? new Date(),
                  timeZone
                )
                const wallDate = new Date(
                  nextDate.getFullYear(),
                  nextDate.getMonth(),
                  nextDate.getDate(),
                  current.hour,
                  current.minute,
                  current.second
                )
                const instant = eidosFileInstantFromWallDate(wallDate, timeZone)
                if (instant) commitDate(instant)
                else {
                  setInputError(
                    t(
                      "This time is ambiguous or unavailable in {timeZone}. Choose another time.",
                      { timeZone: eidosFileResolvedTimeZone(timeZone) }
                    )
                  )
                }
              }}
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
  const { format, date, timeZone } = cellData

  const handleFinishedEditing = (finalDate: Date | undefined) => {
    const newCell = {
      ...p.value,
      data: {
        ...p.value.data,
        date: finalDate,
        displayDate: finalDate
          ? formatEidosFileGridDate(finalDate, format, timeZone)
          : "",
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
      timeZone={timeZone}
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
        : eidosFileInstantFromInputValue(v, d.timeZone)

    return {
      ...d,
      date: newDate,
      displayDate: newDate
        ? formatEidosFileGridDate(newDate, format, d.timeZone)
        : "",
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
