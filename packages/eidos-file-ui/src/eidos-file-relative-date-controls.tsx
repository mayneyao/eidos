import { useEffect, useRef, useState } from "react"
import {
  EIDOS_FILE_CALENDAR_WINDOW_COUNT_MAX,
  type EidosFileCalendarPeriodValue,
} from "@eidos.space/eidos-file"
import { useEidosFileUI } from "./context"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/primitives"

export interface RelativeDateSelection {
  direction: "past" | "this" | "next"
  unit: EidosFileCalendarPeriodValue["unit"]
  count: number
}

/** Shared by the advanced rule row and the property-specific date popover. */
export function EidosFileRelativeDateControls({
  value,
  onChange,
  legacyPeriod = false,
}: {
  value: RelativeDateSelection
  onChange(value: RelativeDateSelection): void
  legacyPeriod?: boolean
}) {
  const { translate: t, locale } = useEidosFileUI()
  const [countText, setCountText] = useState(String(value.count))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current && value.direction !== "this")
      setCountText(String(value.count))
  }, [value.count, value.direction])
  const parsed = Number(countText)
  const valid =
    /^\d+$/u.test(countText) &&
    Number.isSafeInteger(parsed) &&
    parsed >= 1 &&
    parsed <= EIDOS_FILE_CALENDAR_WINDOW_COUNT_MAX
  const directions = legacyPeriod
    ? ([
        ["past", "Last (relative date)"],
        ["next", "Next (relative date)"],
        ["this", "This (relative date)"],
      ] as const)
    : ([
        ["past", "Past (relative date)"],
        ["next", "Next (relative date)"],
        ["this", "This (relative date)"],
      ] as const)
  return (
    <div
      className="eidos-relative-date-controls"
      data-eidos-file-calendar-period={
        legacyPeriod || value.direction === "this" ? "" : undefined
      }
      data-eidos-file-relative-date
      data-locale={locale}
      data-direction={value.direction}
      data-whole-period={legacyPeriod || undefined}
    >
      <Select
        value={value.direction}
        onValueChange={(direction: RelativeDateSelection["direction"]) =>
          onChange({
            ...value,
            direction,
            count:
              direction === "this" || value.direction === "this"
                ? 1
                : valid
                  ? parsed
                  : value.count,
          })
        }
      >
        <SelectTrigger
          className="eidos-relative-date-select"
          aria-label={t("Period relation")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          className="eidos-relative-date-menu"
          position="popper"
          sideOffset={4}
        >
          {directions.map(([direction, label]) => (
            <SelectItem key={direction} value={direction}>
              {t(label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.direction !== "this" && !legacyPeriod && (
        <input
          aria-label={t("Number of periods")}
          aria-invalid={!valid || undefined}
          className="eidos-relative-date-count"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={countText}
          onFocus={() => {
            focused.current = true
          }}
          onBlur={() => {
            focused.current = false
            if (!valid) setCountText(String(value.count))
          }}
          onChange={(event) => {
            const text = event.target.value
            setCountText(text)
            const count = Number(text)
            if (
              /^\d+$/u.test(text) &&
              Number.isSafeInteger(count) &&
              count >= 1 &&
              count <= EIDOS_FILE_CALENDAR_WINDOW_COUNT_MAX
            )
              onChange({ ...value, count })
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault()
              const count = Math.max(
                1,
                Math.min(
                  EIDOS_FILE_CALENDAR_WINDOW_COUNT_MAX,
                  (valid ? parsed : value.count) +
                    (event.key === "ArrowUp" ? 1 : -1)
                )
              )
              setCountText(String(count))
              onChange({ ...value, count })
            }
          }}
        />
      )}
      <Select
        value={value.unit}
        onValueChange={(unit: RelativeDateSelection["unit"]) =>
          onChange({ ...value, unit })
        }
      >
        <SelectTrigger
          className="eidos-relative-date-select"
          aria-label={t("Calendar unit")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          className="eidos-relative-date-menu"
          position="popper"
          sideOffset={4}
        >
          {(["day", "week", "month", "year"] as const).map((unit) => (
            <SelectItem key={unit} value={unit}>
              {locale === "zh"
                ? unit === "day"
                  ? "天"
                  : t(unit)
                : value.direction !== "this" && !legacyPeriod && value.count > 1
                  ? `${unit}s`
                  : unit}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
