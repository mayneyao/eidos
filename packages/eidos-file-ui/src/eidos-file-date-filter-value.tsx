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
  const chooseDay = (date: Date | undefined) => {
    if (!date) return
    const day = `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    const clock = draft[active]?.split("T")[1] || "00:00:00"
    update(active, datetime ? `${day}T${clock}` : day)
    if (range && active === 0) setActive(1)
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
  const endpoints = range ? (
    <div
      className="eidos-date-filter-endpoints"
      role="group"
      aria-label={t("Date range")}
    >
      {[0, 1].map((index) => (
        <Button
          key={index}
          type="button"
          variant={active === index ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={active === index}
          onClick={() => setActive(index)}
        >
          {t(index === 0 ? "Starting date" : "Ending date")}
        </Button>
      ))}
    </div>
  ) : null
  const calendar = (
    <div className="eidos-date-filter-calendar">
      {endpoints}
      <Calendar
        mode="single"
        selected={selected}
        month={month}
        onMonthChange={setMonth}
        onSelect={chooseDay}
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
        modifiers={
          range
            ? {
                rangeStart: wallDate(draft[0] ?? "") ?? [],
                rangeEnd: wallDate(draft[1] ?? "") ?? [],
                rangeMiddle: (date) => {
                  const from = wallDate(draft[0] ?? ""),
                    to = wallDate(draft[1] ?? "")
                  return !!from && !!to && date > from && date < to
                },
              }
            : undefined
        }
        modifiersClassNames={{
          rangeStart: "eidos-date-filter-range-endpoint",
          rangeEnd: "eidos-date-filter-range-endpoint",
          rangeMiddle: "eidos-date-filter-range-middle",
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
  return (
    <div className="eidos-date-filter-value" data-inline={inline}>
      <div className="eidos-date-filter-input-row">
        <div className="eidos-date-filter-inputs" data-range={range}>
          {draft.map((text, index) => (
            <Input
              key={index}
              ref={(input) => {
                inputs.current[index] = input
                input?.setCustomValidity(
                  !canonical(text) ||
                    (range &&
                      draft.every((value) => !!canonical(value)) &&
                      error)
                    ? (error ?? t("Choose date"))
                    : ""
                )
              }}
              required
              type={datetime ? "datetime-local" : "date"}
              step={datetime ? 0.001 : undefined}
              aria-label={t(
                range
                  ? index === 0
                    ? "Starting date"
                    : "Ending date"
                  : "Value"
              )}
              aria-invalid={(touched && !!error) || undefined}
              value={text}
              onFocus={() => setActive(index)}
              onChange={(event) => update(index, event.target.value)}
            />
          ))}
        </div>
        {!inline && (
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
                variant="ghost"
                size="icon"
                aria-label={t(datetime ? "Choose date & time" : "Choose date")}
              >
                <CalendarDays className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="eidos-date-filter-popover" align="start">
              {calendar}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {inline && calendar}
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
    </div>
  )
}

export function focusInvalidDateFilter(root: HTMLElement | null): boolean {
  const input = root?.querySelector<HTMLInputElement>(
    ".eidos-date-filter-value input:invalid"
  )
  if (!input) return false
  input.focus()
  input.reportValidity()
  return true
}
