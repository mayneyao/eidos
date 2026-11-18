import { useEffect, useState } from "react"
import {
  eidosFileCalendarPeriodBounds,
  eidosFileCalendarWindowBounds,
  isEidosFileCalendarPeriodValue,
  isEidosFileCalendarWindowValue,
  projectEidosFileCalendarInstant,
  type EidosFileFilterRule,
} from "@eidos.space/eidos-file"
import { EidosFileRelativeDateCalendar } from "./eidos-file-relative-date-calendar"
import { useEidosFileCalendarExecution } from "./eidos-file-calendar-context"

export function RelativeDatePreview({ rule }: { rule: EidosFileFilterRule }) {
  const context = useEidosFileCalendarExecution()
  const [now, setNow] = useState(() => new Date().toISOString())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000)
    return () => clearInterval(timer)
  }, [])
  if (!context) return null
  try {
    const bounds =
      rule.operator === "is-in-calendar-window" &&
      isEidosFileCalendarWindowValue(rule.value)
        ? eidosFileCalendarWindowBounds(rule.value, context, now)
        : isEidosFileCalendarPeriodValue(rule.value)
          ? eidosFileCalendarPeriodBounds(rule.value, context, now)
          : undefined
    const today = projectEidosFileCalendarInstant(
      now,
      context.timeZone,
      context.timeZoneData
    )
    if (!bounds || !today) return null
    const date = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`
    return <EidosFileRelativeDateCalendar bounds={bounds} today={date} />
  } catch (error) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {error instanceof Error ? error.message : "Invalid date range"}
      </p>
    )
  }
}
