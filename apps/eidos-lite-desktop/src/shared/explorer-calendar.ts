import {
  assertEidosFileCalendarContext,
  isCanonicalEidosFileInstant,
  type EidosFileCalendarContext,
  type EidosFileFieldInfo,
  type EidosFileSnapshot,
} from "@eidos.space/eidos-file"

/** Explicit intent from the Explorer UI, forwarded per request. Never saved in a filter. */
export interface ExplorerCalendarExecution {
  calendarQueryVersion: 2
  calendar: EidosFileCalendarContext
  referenceInstant?: string
}

export interface ExplorerFilterFieldsResult {
  fields: EidosFileFieldInfo[]
  queryCapabilities?: EidosFileSnapshot["queryCapabilities"]
}

export function normalizeExplorerCalendarExecution(
  value: unknown
): ExplorerCalendarExecution | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Explorer calendar execution")
  const item = value as Record<string, unknown>
  if (
    item.calendarQueryVersion !== 2 ||
    Object.keys(item).some(
      (key) =>
        !["calendarQueryVersion", "calendar", "referenceInstant"].includes(key)
    )
  )
    throw new Error("Invalid Explorer calendar consumer")
  assertEidosFileCalendarContext(item.calendar)
  if (
    item.referenceInstant !== undefined &&
    !isCanonicalEidosFileInstant(item.referenceInstant)
  )
    throw new Error("Invalid Explorer reference instant")
  return {
    calendarQueryVersion: 2,
    calendar: { ...item.calendar },
    ...(typeof item.referenceInstant === "string"
      ? { referenceInstant: item.referenceInstant }
      : {}),
  }
}
