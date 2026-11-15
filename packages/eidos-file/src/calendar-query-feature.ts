import type { EidosFileConnection } from "./connection"
import { EidosFileError } from "./errors"

export const EIDOS_CALENDAR_QUERY_FEATURE = "eidos:calendar-query"
export const EIDOS_CALENDAR_WINDOW_FEATURE = "eidos:calendar-window"

export function hasCalendarWindowFeature(
  connection: EidosFileConnection
): boolean {
  const row = connection.query<{
    version: string
    required: number
    config_json: string
  }>(
    "SELECT version, required, config_json FROM eidos__features WHERE name = ?",
    [EIDOS_CALENDAR_WINDOW_FEATURE]
  )[0]
  if (!row) return false
  if (row.version !== "1" || row.required !== 1 || row.config_json !== "{}")
    throw new EidosFileError(
      "unsupported-feature",
      "Unsupported calendar window feature declaration"
    )
  requireCalendarQueryFeature(connection)
  return true
}

export function requireCalendarWindowFeature(
  connection: EidosFileConnection
): void {
  if (!hasCalendarWindowFeature(connection))
    throw new EidosFileError(
      "invalid-schema",
      "Calendar window Views require the calendar window feature"
    )
}

/** Install both dependencies inside the View's existing revision transaction. */
export function enableCalendarWindowFeature(
  connection: EidosFileConnection
): void {
  enableCalendarQueryFeature(connection)
  if (hasCalendarWindowFeature(connection)) return
  connection.run(
    "INSERT INTO eidos__features (name, version, required, config_json) VALUES (?, '1', 1, '{}')",
    [EIDOS_CALENDAR_WINDOW_FEATURE]
  )
}

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
