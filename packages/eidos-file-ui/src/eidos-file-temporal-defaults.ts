import { useMemo } from "react"
import {
  EIDOS_FILE_CALENDAR_TIME_ZONE_DATA,
  eidosFileTemporalDefaultValue,
  type EidosFileCreationContext,
  type EidosFileFieldInfo,
  type EidosFileRow,
} from "@eidos.space/eidos-file"
import { useEidosFileUI } from "./context"
import { eidosFileResolvedTimeZone } from "./eidos-file-date-time"

export function useEidosFileCreationContext(): EidosFileCreationContext {
  const { timeZone, calendarTimeZoneData } = useEidosFileUI()
  const zone = eidosFileResolvedTimeZone(timeZone)
  return useMemo(
    () => ({
      timeZone: zone,
      timeZoneData: calendarTimeZoneData ?? EIDOS_FILE_CALENDAR_TIME_ZONE_DATA,
    }),
    [zone, calendarTimeZoneData]
  )
}

/** One draft reference; explicit keys (including null) always win. */
export function eidosFileNewRecordDateDefaults(
  fields: readonly EidosFileFieldInfo[],
  row: EidosFileRow,
  referenceInstant: string,
  context: EidosFileCreationContext
): EidosFileRow {
  const result: EidosFileRow = {}
  for (const field of fields) {
    if (
      (field.type !== "date" && field.type !== "datetime") ||
      field.systemRole ||
      field.valueKind !== "source" ||
      field.writable === false ||
      field.settings?.writable === false ||
      field.settings?.readOnly === true ||
      field.settings?.isSystem === true ||
      Object.hasOwn(row, field.tableColumnName)
    )
      continue
    const value = eidosFileTemporalDefaultValue(
      field.type,
      field.property ?? field.settings,
      referenceInstant,
      context
    )
    if (value !== null) result[field.tableColumnName] = value
  }
  return result
}
