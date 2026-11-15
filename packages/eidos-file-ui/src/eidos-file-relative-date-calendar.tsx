import { useEffect, useState } from "react"
import type { EidosFileCalendarPeriodBounds } from "@eidos.space/eidos-file"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEidosFileUI } from "./context"

const DAY = 86_400_000
const dateKey = (value: number) => new Date(value).toISOString().slice(0, 10)

/** Calendar dates supplied by the Runtime helper; this view never computes filter semantics. */
export function EidosFileRelativeDateCalendar({
  bounds,
  today,
}: {
  bounds: Pick<EidosFileCalendarPeriodBounds, "startDate" | "endDate">
  today: string
}) {
  const { locale, weekStartsOnMonday, translate: t } = useEidosFileUI()
  const [month, setMonth] = useState(bounds.startDate.slice(0, 7))
  useEffect(
    () => setMonth(bounds.startDate.slice(0, 7)),
    [bounds.startDate, bounds.endDate]
  )
  const start = Date.parse(`${month}-01T00:00:00.000Z`)
  const firstWeekday = weekStartsOnMonday === false ? 0 : 1
  const gridStart =
    start - ((new Date(start).getUTCDay() - firstWeekday + 7) % 7) * DAY
  const lastDate = dateKey(Date.parse(`${bounds.endDate}T00:00:00.000Z`) - DAY)
  const moveMonth = (amount: number) => {
    const date = new Date(start)
    date.setUTCMonth(date.getUTCMonth() + amount)
    if (date.getUTCFullYear() >= 1970 && date.getUTCFullYear() <= 2499)
      setMonth(date.toISOString().slice(0, 7))
  }
  const language = locale === "zh" ? "zh-CN" : "en-US"
  const title = new Intl.DateTimeFormat(language, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(start)
  return (
    <div
      className="eidos-relative-date-calendar"
      data-eidos-file-relative-calendar
    >
      <div className="eidos-relative-date-month">
        <span aria-live="polite">{title}</span>
        <div>
          <button
            type="button"
            aria-label={t("Previous month")}
            onClick={() => moveMonth(-1)}
            disabled={month === "1970-01"}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t("Next month")}
            onClick={() => moveMonth(1)}
            disabled={month === "2499-12"}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
      <table
        aria-label={`${t("Filter date range")}: ${bounds.startDate} – ${lastDate}`}
      >
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, index) => {
              const day = (firstWeekday + index) % 7
              const label =
                locale === "zh"
                  ? ["日", "一", "二", "三", "四", "五", "六"][day]
                  : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][day]
              return (
                <th key={day} scope="col">
                  {label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, week) => (
            <tr key={week}>
              {Array.from({ length: 7 }, (_, column) => {
                const instant = gridStart + (week * 7 + column) * DAY
                const day = dateKey(instant)
                const selected = day >= bounds.startDate && day < bounds.endDate
                return (
                  <td
                    key={day}
                    data-date={day}
                    data-selected={selected || undefined}
                    data-range-start={
                      (selected &&
                        (day === bounds.startDate || column === 0)) ||
                      undefined
                    }
                    data-range-end={
                      (selected && (day === lastDate || column === 6)) ||
                      undefined
                    }
                    data-boundary={
                      day === bounds.startDate
                        ? "start"
                        : day === lastDate
                          ? "end"
                          : undefined
                    }
                    data-outside={day.slice(0, 7) !== month || undefined}
                    data-future={day > today || undefined}
                    aria-current={day === today ? "date" : undefined}
                    aria-label={day}
                  >
                    <span>{new Date(instant).getUTCDate()}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="eidos-relative-date-hint">
        {t("Filter will update with the current date")}
      </p>
    </div>
  )
}
