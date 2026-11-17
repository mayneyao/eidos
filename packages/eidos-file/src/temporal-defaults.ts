import {
  assertEidosFileCalendarZone,
  EIDOS_FILE_CALENDAR_TIME_ZONE_DATA,
  projectEidosFileCalendarInstant,
} from "./calendar-day"
import type { EidosFileConnection } from "./connection"
import { EidosFileError } from "./errors"
import { isCanonicalEidosFileInstant } from "./temporal"

/** Application calendar preferences for one ordinary creation operation. */
export interface EidosFileCreationContext {
  timeZone: string
  timeZoneData: string
}

export const EIDOS_FILE_TEMPORAL_DEFAULTS_FEATURE = "eidos:temporal-defaults"

/** Absence/null disables the rule; only writable stored Date/Datetime support it. */
export function assertEidosFileTemporalDefault(
  type: string,
  settings: Record<string, unknown> | null | undefined,
  writable = true
): "now" | null {
  const value = settings?.defaultValue
  if (value === undefined || value === null) return null
  if (
    value !== "now" ||
    !writable ||
    (type !== "date" && type !== "datetime")
  ) {
    throw new EidosFileError(
      "invalid-schema",
      "defaultValue must be now on a writable stored Date or Datetime Field"
    )
  }
  return value
}

export function assertEidosFileCreationContext(
  context: EidosFileCreationContext
): void {
  if (
    !context ||
    typeof context !== "object" ||
    Array.isArray(context) ||
    Object.keys(context).some(
      (key) => key !== "timeZone" && key !== "timeZoneData"
    ) ||
    typeof context.timeZone !== "string" ||
    typeof context.timeZoneData !== "string"
  ) {
    throw new EidosFileError(
      "invalid-value",
      "Invalid creation calendar context"
    )
  }
  assertEidosFileCalendarZone(context.timeZone, context.timeZoneData)
}

/** Shared by Runtime creation and unsaved UI previews. Never reads a host clock. */
export function eidosFileTemporalDefaultValue(
  type: string,
  settings: Record<string, unknown> | null | undefined,
  referenceInstant: string,
  context?: EidosFileCreationContext
): string | null {
  if (assertEidosFileTemporalDefault(type, settings) === null) return null
  if (!isCanonicalEidosFileInstant(referenceInstant)) {
    throw new EidosFileError(
      "invalid-value",
      "Creation instant must be canonical UTC"
    )
  }
  if (context !== undefined) assertEidosFileCreationContext(context)
  if (type === "datetime") return referenceInstant
  const parts = projectEidosFileCalendarInstant(
    referenceInstant,
    context?.timeZone ?? "UTC",
    context?.timeZoneData ?? EIDOS_FILE_CALENDAR_TIME_ZONE_DATA
  )
  if (!parts)
    throw new EidosFileError(
      "invalid-value",
      "Creation date is outside the calendar profile"
    )
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

export function hasTemporalDefaultsFeature(
  connection: EidosFileConnection
): boolean {
  const row = connection.get<{
    version: string
    required: number
    config_json: string
  }>(
    "SELECT version, required, config_json FROM eidos__features WHERE name = ?",
    [EIDOS_FILE_TEMPORAL_DEFAULTS_FEATURE]
  )
  if (!row) return false
  if (row.version !== "1" || row.required !== 1 || row.config_json !== "{}") {
    throw new EidosFileError(
      "unsupported-feature",
      "Unsupported temporal defaults feature declaration"
    )
  }
  return true
}

/** Called within the schema transaction. Kept required after disabling defaults. */
export function enableTemporalDefaultsFeature(
  connection: EidosFileConnection
): void {
  if (hasTemporalDefaultsFeature(connection)) return
  connection.run(
    "INSERT INTO eidos__features (name, version, required, config_json) VALUES (?, '1', 1, '{}')",
    [EIDOS_FILE_TEMPORAL_DEFAULTS_FEATURE]
  )
}
