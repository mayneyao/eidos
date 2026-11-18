import {
  useEffect,
  useRef,
  useLayoutEffect,
  useState,
  type MutableRefObject,
} from "react"
import { projectEidosFileCalendarInstant } from "@eidos.space/eidos-file"
import type { EidosFileSqlPrimitive } from "@eidos.space/eidos-file"
import { useEidosFileUI } from "./context"
import { Calendar } from "./ui/primitives"
import {
  eidosFileDateKey,
  eidosFileDateTimeInputValue,
  eidosFileInstantFromInputValue,
  eidosFileResolvedTimeZone,
  eidosFileWallDateFromInputValue,
} from "./eidos-file-date-time"

/** Calendar content for the mobile sheet, with no nested picker or trigger. */
export function MobileDateEditor({
  value,
  datetime,
  disabled,
  commitRef,
  onChange,
}: {
  value: unknown
  datetime: boolean
  disabled: boolean
  commitRef: MutableRefObject<(() => boolean) | null>
  onChange(value: EidosFileSqlPrimitive): Promise<void>
}) {
  const {
    locale,
    timeZone,
    translate: t,
    calendarTimeZoneData,
  } = useEidosFileUI()
  const initial =
    typeof value === "string" && value
      ? datetime && !Number.isNaN(new Date(value).getTime())
        ? eidosFileDateTimeInputValue(
            new Date(value),
            timeZone,
            true,
            calendarTimeZoneData
          )
        : value
      : ""
  const [draft, setDraft] = useState(initial)
  const origin = useRef({ value, initial, timeZone, calendarTimeZoneData })
  useEffect(() => {
    if (draft !== origin.current.initial && value === origin.current.value)
      return
    origin.current = { value, initial, timeZone, calendarTimeZoneData }
    setDraft(initial)
  }, [value, initial, timeZone, calendarTimeZoneData])
  const [month, setMonth] = useState(
    () => eidosFileWallDateFromInputValue(initial) ?? new Date()
  )
  const [error, setError] = useState<string | null>(null)
  const selected = eidosFileWallDateFromInputValue(draft)
  const update = (next: string) => {
    setDraft(next)
    setError(null)
    const date = eidosFileWallDateFromInputValue(next)
    if (date) setMonth(date)
  }
  const chooseDate = (date: Date | undefined) =>
    update(
      date
        ? eidosFileDateKey(date) +
            (datetime ? "T" + (draft.split("T")[1] || "00:00:00") : "")
        : ""
    )
  useLayoutEffect(() => {
    commitRef.current = () => {
      if (draft === origin.current.initial) return true
      if (!draft) {
        void onChange(null)
        return true
      }
      const date = datetime
        ? eidosFileInstantFromInputValue(
            draft,
            origin.current.timeZone,
            origin.current.calendarTimeZoneData
          )
        : eidosFileWallDateFromInputValue(draft)
      if (!date) {
        setError(
          datetime
            ? t(
                "This time is ambiguous or unavailable in {timeZone}. Choose another time.",
                { timeZone: eidosFileResolvedTimeZone(timeZone) }
              )
            : t("Enter a valid date.")
        )
        return false
      }
      void onChange(datetime ? date.toISOString() : eidosFileDateKey(date))
      return true
    }
    return () => {
      commitRef.current = null
    }
  })
  if (
    datetime &&
    calendarTimeZoneData &&
    typeof value === "string" &&
    value &&
    !projectEidosFileCalendarInstant(
      value,
      eidosFileResolvedTimeZone(timeZone),
      calendarTimeZoneData
    )
  )
    return (
      <div className="text-xs">
        {value}
        <p>
          {t(
            "Dates outside 1970–2499 are read-only here. Your saved value is unchanged."
          )}
        </p>
      </div>
    )
  return (
    <div className="eidos-mobile-date-editor">
      <div className="flex gap-3">
        <label className="min-w-0 flex-1 text-sm text-muted-foreground">
          {t("Date")}
          <input
            type="text"
            inputMode="text"
            aria-label={t("Date")}
            placeholder="YYYY-MM-DD"
            className="mt-1 w-full rounded-md border bg-background px-3 text-foreground"
            value={draft.split("T")[0]}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            onChange={(event) =>
              update(
                event.target.value +
                  (datetime && event.target.value
                    ? "T" + (draft.split("T")[1] || "00:00:00")
                    : "")
              )
            }
          />
        </label>
        {datetime && (
          <label className="min-w-0 flex-1 text-sm text-muted-foreground">
            {t("Time")}
            <input
              type="text"
              inputMode="text"
              aria-label={t("Time")}
              placeholder="HH:mm:ss"
              className="mt-1 w-full rounded-md border bg-background px-3 text-foreground"
              value={draft.split("T")[1] ?? ""}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              onChange={(event) =>
                update(
                  (draft.split("T")[0] ||
                    eidosFileDateKey(
                      new Date(),
                      timeZone,
                      calendarTimeZoneData
                    )) +
                    "T" +
                    event.target.value
                )
              }
            />
          </label>
        )}
      </div>
      <Calendar
        mode="single"
        selected={selected}
        month={month}
        onMonthChange={setMonth}
        onSelect={chooseDate}
        disabled={disabled}
        fixedWeeks
        formatters={
          locale === "zh"
            ? {
                formatCaption: (date) =>
                  `${date.getFullYear()}年${date.getMonth() + 1}月`,
                formatWeekdayName: (date) =>
                  "日一二三四五六"[date.getDay()] ?? "",
              }
            : undefined
        }
        className="w-full px-0 py-3"
        classNames={{
          month: "space-y-2",
          caption: "relative flex h-12 items-center justify-center",
          head_row: "grid grid-cols-7",
          head_cell: "text-center text-sm text-muted-foreground",
          row: "grid grid-cols-7",
          cell: "min-w-0 text-center",
          day: "mx-auto flex h-12 w-full items-center justify-center rounded-md text-base hover:bg-accent",
          nav_button: "h-12 w-12 opacity-100",
        }}
      />
      <div className="flex justify-between">
        <button
          disabled={disabled}
          className="px-3 text-sm"
          onClick={() =>
            chooseDate(
              eidosFileWallDateFromInputValue(
                eidosFileDateKey(new Date(), timeZone, calendarTimeZoneData)
              )
            )
          }
        >
          {t("Today")}
        </button>
        <button
          disabled={disabled || !draft}
          className="px-3 text-sm text-muted-foreground"
          onClick={() => update("")}
        >
          {t("Clear")}
        </button>
      </div>
      {datetime && (
        <p className="text-xs text-muted-foreground">
          {t("Time zone: {timeZone}", {
            timeZone: eidosFileResolvedTimeZone(timeZone),
          })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
