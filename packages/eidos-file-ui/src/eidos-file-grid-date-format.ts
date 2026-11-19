export type EidosFileGridDateFormat = "date" | "datetime-local"

import { eidosFileDateKey, eidosFileDateTimeText } from "./eidos-file-date-time"

const regionalDateOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
} as const
const regionalDates = {
  "ja-JP": new Intl.DateTimeFormat("ja-JP", regionalDateOptions),
  "ko-KR": new Intl.DateTimeFormat("ko-KR", regionalDateOptions),
}

/** Formats the projected date for display. Grid copy and edits use their canonical values. */
export function formatEidosFileGridDate(
  date: Date,
  format: EidosFileGridDateFormat,
  timeZone?: string,
  calendarTimeZoneData?: string | null,
  locale?: string
): string {
  const display =
    format === "date"
      ? eidosFileDateKey(date)
      : eidosFileDateTimeText(date, timeZone, calendarTimeZoneData)
  if (locale === "ja-JP" || locale === "ko-KR") {
    // The date portion has already been projected into the selected time zone.
    return display.replace(/^\d{4}-\d{2}-\d{2}(?= |$)/, (key) =>
      regionalDates[locale].format(Date.parse(key))
    )
  }
  return locale === "pt-BR"
    ? display.replace(/^(\d{4})-(\d{2})-(\d{2})(?= |$)/, "$3/$2/$1")
    : display
}
