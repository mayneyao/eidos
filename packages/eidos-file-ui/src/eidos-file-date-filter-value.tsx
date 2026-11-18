import { useEffect, useRef, useState } from "react"
import { CalendarDays } from "lucide-react"
import type { EidosFileFilterRuleValue } from "@eidos.space/eidos-file"
import { useEidosFileUI } from "./context"
import {
  eidosFileDateTimeInputValue,
  eidosFileInstantFromInputValue,
  eidosFileResolvedTimeZone,
  eidosFileWallDate,
  eidosFileWallDateFromInputValue,
} from "./eidos-file-date-time"
import {
  Button,
  Calendar,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/adaptive-popover"

function operands(
  value: EidosFileFilterRuleValue | undefined,
  range: boolean
): string[] {
  const values = range
    ? Array.isArray(value)
      ? value
      : ["", ""]
    : [Array.isArray(value) ? value[0] : value]
  return values.map((item) => (typeof item === "string" ? item : ""))
}

export function EidosFileDateFilterValue({
  type,
  value,
  range,
  inline,
  onChange,
}: {
  type: "date" | "datetime"
  value: EidosFileFilterRuleValue | undefined
  range: boolean
  inline: boolean
  onChange(value: EidosFileFilterRuleValue): void
}) {
  const {
    locale,
    translate: t,
    timeZone,
    calendarTimeZoneData,
    weekStartsOnMonday,
  } = useEidosFileUI()
  const datetime = type === "datetime"
  const format = (operand: string) => {
    if (!datetime || !operand) return operand
    const date = new Date(operand)
    if (Number.isNaN(date.getTime())) return ""
    const wall = eidosFileDateTimeInputValue(
      date,
      timeZone,
      true,
      calendarTimeZoneData
    )
    const milliseconds = date.getUTCMilliseconds()
    return wall && milliseconds
      ? `${wall}.${String(milliseconds).padStart(3, "0")}`
      : wall
  }
  const incoming = operands(value, range).map(format)
  const incomingKey = JSON.stringify(incoming)
  const [draft, setDraft] = useState(incoming)
  const [active, setActive] = useState(0)
  const [touched, setTouched] = useState(false)
  const [open, setOpen] = useState(false)
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  useEffect(() => {
    setDraft(JSON.parse(incomingKey) as string[])
    setTouched(false)
  }, [incomingKey, timeZone, calendarTimeZoneData])
  const canonical = (text: string): string | undefined => {
    if (!text) return undefined
    if (datetime)
      return eidosFileInstantFromInputValue(
        text,
        timeZone,
        calendarTimeZoneData
      )?.toISOString()
    return /^\d{4}-\d{2}-\d{2}$/u.test(text) &&
      eidosFileWallDateFromInputValue(text)
      ? text
      : undefined
  }
  const errorFor = (values: string[]): string | null => {
    const parsed = values.map(canonical)
    if (values.some((item) => !item)) return t("Choose date")
    if (parsed.some((item) => !item))
      return datetime
        ? t(
            "This time is ambiguous or unavailable in {timeZone}. Choose another time.",
            { timeZone: eidosFileResolvedTimeZone(timeZone) }
          )
        : t("Choose date")
    if (range && parsed[0]! > parsed[1]!)
      return t("The ending date must be on or after the starting date.")
    return null
  }
  const error = errorFor(draft)
  const update = (index: number, text: string) => {
    const next = draft.map((item, position) =>
      position === index ? text : item
    )
    setDraft(next)
    setTouched(true)
    const date = eidosFileWallDateFromInputValue(text.slice(0, 10))
    if (date) setMonth(date)
    if (!errorFor(next)) {
      const parsed = next.map((item) => canonical(item)!)
      onChange(range ? parsed : parsed[0]!)
    }
  }
  const wallDate = (text: string) =>
    eidosFileWallDateFromInputValue(text.slice(0, 10))
  const [month, setMonth] = useState(
    () =>
      wallDate(incoming[0] ?? "") ??
      eidosFileWallDate(new Date(), timeZone, calendarTimeZoneData)
  )
  const selected = wallDate(draft[active] ?? "")
  const rangeStart = wallDate(draft[0] ?? "")
  const rangeEnd = wallDate(draft[1] ?? "")
  const chooseDay = (date: Date | undefined) => {
    if (!date) return
    const day = `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    const clock = draft[active]?.split("T")[1] || "00:00:00"
    update(active, datetime ? `${day}T${clock}` : day)
    if (range && active === 0) {
      setActive(1)
      inputs.current[1]?.focus({ preventScroll: true })
    }
  }
  const clockPart = (index: number) =>
    draft[active]?.split("T")[1]?.split(":")[index] ?? "00"
  const chooseTime = (index: number, next: string) => {
    const current = draft[active] ?? ""
    if (!wallDate(current)) return
    const [day, clock = "00:00:00"] = current.split("T")
    const parts = clock.split(":")
    parts[index] = next
    update(active, `${day}T${parts.join(":")}`)
  }
  const selection = range
    ? {
        mode: "range" as const,
        selected: rangeStart
          ? {
              from: rangeStart,
              to: rangeEnd && rangeEnd >= rangeStart ? rangeEnd : undefined,
            }
          : undefined,
        onDayClick: chooseDay,
      }
    : { mode: "single" as const, selected, onSelect: chooseDay }
  const calendar = (
    <div className="eidos-date-filter-calendar" data-range={range}>
      <Calendar
        {...selection}
        month={month}
        onMonthChange={setMonth}
        today={eidosFileWallDate(new Date(), timeZone, calendarTimeZoneData)}
        weekStartsOn={weekStartsOnMonday ? 1 : 0}
        formatters={{
          formatCaption: (date) =>
            new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
              year: "numeric",
              month: "long",
            }).format(date),
          formatWeekdayName: (date) =>
            new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
              weekday: "narrow",
            }).format(date),
        }}
        classNames={{
          month: "eidos-date-filter-month",
          caption: "eidos-date-filter-caption",
          caption_label: "eidos-date-filter-caption-label",
          nav: "eidos-date-filter-nav",
          nav_button_previous: "",
          nav_button_next: "",
          row: "eidos-date-filter-week",
          day_selected: range
            ? "eidos-date-filter-range-middle"
            : "eidos-date-filter-selected",
          day_range_start: "eidos-date-filter-range-endpoint",
          day_range_end: "eidos-date-filter-range-endpoint",
          day_today: "eidos-date-filter-today",
        }}
      />
      {datetime && (
        <div
          className="eidos-date-filter-time"
          role="group"
          aria-label={t("Time")}
        >
          {(["Hour", "Minute"] as const).map((label, index) => (
            <Select
              key={label}
              value={clockPart(index)}
              disabled={!selected}
              onValueChange={(next) => chooseTime(index, next)}
            >
              <SelectTrigger aria-label={t(label)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: index === 0 ? 24 : 60 }, (_, n) =>
                  String(n).padStart(2, "0")
                ).map((part) => (
                  <SelectItem key={part} value={part}>
                    {part}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      )}
    </div>
  )
  const editor = (
    <>
      <div
        className="eidos-date-filter-inputs"
        data-range={range}
        data-type={type}
        role={range ? "group" : undefined}
        aria-label={range ? t("Date range") : undefined}
      >
        {draft.map((text, index) => (
          <Input
            key={index}
            ref={(input) => {
              inputs.current[index] = input
              input?.setCustomValidity(
                !canonical(text) ||
                  (range && draft.every((value) => !!canonical(value)) && error)
                  ? (error ?? t("Choose date"))
                  : ""
              )
            }}
            required
            type={datetime ? "datetime-local" : "date"}
            step={datetime ? 0.001 : undefined}
            aria-label={t(
              range ? (index === 0 ? "Starting date" : "Ending date") : "Value"
            )}
            aria-invalid={(touched && !!error) || undefined}
            data-active={(range && active === index) || undefined}
            value={text}
            onFocus={() => setActive(index)}
            onInvalid={() => setTouched(true)}
            onChange={(event) => update(index, event.target.value)}
          />
        ))}
      </div>
      {calendar}
      {(datetime || (touched && error)) && (
        <p
          className={
            error && touched
              ? "eidos-date-filter-error"
              : "eidos-date-filter-zone"
          }
          role={error && touched ? "alert" : undefined}
        >
          {(touched && error) ||
            t("Time zone: {timeZone}", {
              timeZone: eidosFileResolvedTimeZone(timeZone),
            })}
        </p>
      )}
    </>
  )
  const label = (text: string, index: number) => {
    if (!text)
      return t(
        range ? (index === 0 ? "Starting date" : "Ending date") : "Choose date"
      )
    const [day, clock] = text.split("T")
    return datetime && clock
      ? `${day!.slice(5).replaceAll("-", "/")} ${clock.slice(0, 5)}`
      : day!.replaceAll("-", "/")
  }
  const compactLabel = (text: string, index: number) => {
    if (!text) return label(text, index)
    const year = eidosFileWallDate(
      new Date(),
      timeZone,
      calendarTimeZoneData
    ).getFullYear()
    return text.startsWith(`${year}-`)
      ? text.slice(5, 10).replaceAll("-", "/")
      : label(text, index)
  }
  const description = draft.some(Boolean)
    ? draft.join(" – ") +
      (datetime ? ` · ${eidosFileResolvedTimeZone(timeZone)}` : "")
    : undefined
  return (
    <div
      className="eidos-date-filter-value"
      data-inline={inline}
      data-type={type}
      data-invalid={!!error || undefined}
    >
      {inline ? (
        editor
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) {
              setDraft(incoming)
              setTouched(false)
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="eidos-date-filter-trigger"
              aria-label={t(datetime ? "Choose date & time" : "Choose date")}
              aria-description={description}
              aria-invalid={(touched && !!error) || undefined}
              title={description}
            >
              <CalendarDays className="h-4 w-4" />
              <span className="eidos-date-filter-summary" data-range={range}>
                {draft.map((text, index) => (
                  <span
                    key={index}
                    className="eidos-date-filter-summary-endpoint"
                  >
                    {index > 0 && <span aria-hidden="true">–</span>}
                    <span>
                      <span className="eidos-date-filter-label-full">
                        {label(text, index)}
                      </span>
                      <span
                        className="eidos-date-filter-label-compact"
                        aria-hidden="true"
                      >
                        {compactLabel(text, index)}
                      </span>
                    </span>
                  </span>
                ))}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="eidos-date-filter-popover"
            align="start"
            data-type={type}
          >
            {editor}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

export function focusInvalidDateFilter(root: HTMLElement | null): boolean {
  const invalid = root?.querySelector<HTMLElement>(
    '.eidos-date-filter-value[data-invalid="true"]'
  )
  const trigger = invalid?.querySelector<HTMLButtonElement>(
    ".eidos-date-filter-trigger"
  )
  if (trigger) {
    if (trigger.getAttribute("aria-expanded") !== "true") trigger.click()
    const focus = () => {
      const content = document.getElementById(
        trigger.getAttribute("aria-controls") ?? ""
      )
      const input = content?.querySelector<HTMLInputElement>("input:invalid")
      input?.focus()
      input?.reportValidity()
    }
    requestAnimationFrame(focus)
    return true
  }
  const input = root?.querySelector<HTMLInputElement>(
    ".eidos-date-filter-value input:invalid"
  )
  if (!input) return false
  input.focus()
  input.reportValidity()
  return true
}
