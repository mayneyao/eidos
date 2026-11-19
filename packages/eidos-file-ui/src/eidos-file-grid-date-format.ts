export type EidosFileGridDateFormat = "date" | "datetime-local"

import { eidosFileDateKey, eidosFileDateTimeText } from "./eidos-file-date-time"

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
  return locale === "pt-BR"
    ? display.replace(/^(\d{4})-(\d{2})-(\d{2})(?= |$)/, "$3/$2/$1")
    : display
}
