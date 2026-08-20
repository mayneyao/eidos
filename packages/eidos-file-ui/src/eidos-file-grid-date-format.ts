export type EidosFileGridDateFormat = "date" | "datetime-local"

import { eidosFileDateKey, eidosFileDateTimeText } from "./eidos-file-date-time"

/** Formats a date with a stable, fixed-width representation for the Grid. */
export function formatEidosFileGridDate(
  date: Date,
  format: EidosFileGridDateFormat,
  timeZone?: string
): string {
  return format === "date"
    ? eidosFileDateKey(date)
    : eidosFileDateTimeText(date, timeZone)
}
