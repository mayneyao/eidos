import type { EidosFileConnection } from "./connection"
import { EidosFileError } from "./errors"

export const EIDOS_CALENDAR_QUERY_FEATURE = "eidos:calendar-query"

export function hasCalendarQueryFeature(
  connection: EidosFileConnection
): boolean {
  const row = connection.query<{
    version: string
    required: number
    config_json: string
  }>(
    "SELECT version, required, config_json FROM eidos__features WHERE name = ?",
    [EIDOS_CALENDAR_QUERY_FEATURE]
  )[0]
  if (!row) return false
  if (row.version !== "2" || row.required !== 1 || row.config_json !== "{}")
    throw new EidosFileError(
      "unsupported-feature",
      "Unsupported calendar query feature declaration"
    )
  return true
}

export function requireCalendarQueryFeature(
  connection: EidosFileConnection
): void {
  if (!hasCalendarQueryFeature(connection))
    throw new EidosFileError(
      "invalid-schema",
      "Calendar period Views require the calendar query feature"
    )
}

/** Call only inside the transaction that persists the first new query. */
export function enableCalendarQueryFeature(
  connection: EidosFileConnection
): void {
  if (hasCalendarQueryFeature(connection)) return
  connection.run(
    "INSERT INTO eidos__features (name, version, required, config_json) VALUES (?, '2', 1, '{}')",
    [EIDOS_CALENDAR_QUERY_FEATURE]
  )
}
