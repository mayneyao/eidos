import moment from "moment-timezone"
import { EidosFileError } from "./errors"
import { isCanonicalEidosFileInstant, normalizeEidosFileDate } from "./temporal"

/** Default portable calendar profile; selection never depends on array order. */
export const EIDOS_FILE_CALENDAR_TIME_ZONE_DATA = "2026f"
export const EIDOS_FILE_CALENDAR_MIN_YEAR = 1970
export const EIDOS_FILE_CALENDAR_MAX_YEAR = 2499

export interface EidosFileCalendarDayValue {
  day: "yesterday" | "today" | "tomorrow"
  timeZone: string
  timeZoneData: string
}

export interface EidosFileCalendarParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

const names = new Set(moment.tz.names())
const DAY_MS = 86_400_000

export function isEidosFileCalendarDayValue(
  value: unknown
): value is EidosFileCalendarDayValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    Object.keys(item).every((key) =>
      ["day", "timeZone", "timeZoneData"].includes(key)
    ) &&
    (item.day === "yesterday" ||
      item.day === "today" ||
      item.day === "tomorrow") &&
    typeof item.timeZone === "string" &&
    item.timeZone.length > 0 &&
    typeof item.timeZoneData === "string" &&
    item.timeZoneData.length > 0
  )
}

/** Exact names and aliases in this profile, including UTC. */
export function eidosFileCalendarTimeZones(timeZoneData: string): string[] {
  assertProfile(timeZoneData)
  return [...names]
}

export function supportsEidosFileCalendarProfile(
  timeZoneData: string
): boolean {
  return (
    timeZoneData === EIDOS_FILE_CALENDAR_TIME_ZONE_DATA &&
    moment.tz.dataVersion === timeZoneData
  )
}

function assertProfile(timeZoneData: string): void {
  if (!supportsEidosFileCalendarProfile(timeZoneData)) {
    throw new EidosFileError(
      "unsupported-feature",
      `Calendar time-zone data ${timeZoneData} is unavailable`
    )
  }
}

function zoneFor(timeZone: string, timeZoneData: string) {
  assertProfile(timeZoneData)
  if (!names.has(timeZone)) {
    throw new EidosFileError(
      "invalid-query",
      `Unknown calendar time zone: ${timeZone}`
    )
  }
  return moment.tz.zone(timeZone)!
}

/** Validates profile/name without evaluating a reference instant. */
export function assertEidosFileCalendarZone(
  timeZone: string,
  timeZoneData: string
): void {
  zoneFor(timeZone, timeZoneData)
}

/**
 * Project using portable rules only. Values outside the profile's local year
 * range return null: an ordinary stored value cannot fail an entire row page.
 */
export function projectEidosFileCalendarInstant(
  instant: string,
  timeZone: string,
  timeZoneData: string
): EidosFileCalendarParts | null {
  const zone = zoneFor(timeZone, timeZoneData)
  if (!isCanonicalEidosFileInstant(instant)) return null
  const epoch = Date.parse(instant)
  const wall = new Date(epoch - zone.utcOffset(epoch) * 60_000)
  const year = wall.getUTCFullYear()
  if (
    year < EIDOS_FILE_CALENDAR_MIN_YEAR ||
    year > EIDOS_FILE_CALENDAR_MAX_YEAR
  )
    return null
  return {
    year,
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
    second: wall.getUTCSeconds(),
    millisecond: wall.getUTCMilliseconds(),
  }
}

/** Reject gaps, folds, invalid calendar parts and range overflow. */
export function resolveEidosFileCalendarInstant(
  parts: EidosFileCalendarParts,
  timeZone: string,
  timeZoneData: string
): string | null {
  const zone = zoneFor(timeZone, timeZoneData)
  if (
    ![
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ].every(Number.isInteger) ||
    parts.year < EIDOS_FILE_CALENDAR_MIN_YEAR ||
    parts.year > EIDOS_FILE_CALENDAR_MAX_YEAR ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59 ||
    parts.millisecond < 0 ||
    parts.millisecond > 999
  )
    return null
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  )
  const matches = [...new Set(zone.offsets)].flatMap((offset) => {
    const candidate = new Date(wall + offset * 60_000).toISOString()
    const projected = projectEidosFileCalendarInstant(
      candidate,
      timeZone,
      timeZoneData
    )
    return projected &&
      (Object.keys(parts) as Array<keyof EidosFileCalendarParts>).every(
        (key) => projected[key] === parts[key]
      )
      ? [candidate]
      : []
  })
  return matches.length === 1 ? matches[0]! : null
}

export interface EidosFileCalendarDayBounds {
  date: string
  /** Coalesced, disjoint half-open canonical UTC intervals; a skipped date has none. */
  intervals: Array<readonly [string, string]>
}

/** The inverse image of one Gregorian date under piecewise-constant IANA offsets. */
export function eidosFileCalendarDayBounds(
  value: EidosFileCalendarDayValue,
  referenceInstant: string
): EidosFileCalendarDayBounds {
  const reference = projectEidosFileCalendarInstant(
    referenceInstant,
    value.timeZone,
    value.timeZoneData
  )
  if (!reference)
    throw new EidosFileError(
      "unsupported-feature",
      "Calendar reference is outside profile years 1970–2499"
    )
  const delta =
    value.day === "yesterday" ? -1 : value.day === "tomorrow" ? 1 : 0
  const start =
    Date.UTC(reference.year, reference.month - 1, reference.day) +
    delta * DAY_MS
  const target = new Date(start)
  if (
    target.getUTCFullYear() < EIDOS_FILE_CALENDAR_MIN_YEAR ||
    target.getUTCFullYear() > EIDOS_FILE_CALENDAR_MAX_YEAR
  ) {
    throw new EidosFileError(
      "unsupported-feature",
      "Calendar target is outside profile years 1970–2499"
    )
  }
  const date = target.toISOString().slice(0, 10)
  return {
    date,
    intervals: eidosFileCalendarDateRangeIntervals(
      date,
      new Date(start + DAY_MS).toISOString().slice(0, 10),
      value.timeZone,
      value.timeZoneData
    ),
  }
}

/** Half-open local calendar range, suitable for Calendar's generated queries. */
export function eidosFileCalendarDateRangeIntervals(
  startDate: string,
  endDate: string,
  timeZone: string,
  timeZoneData: string
): Array<readonly [string, string]> {
  const zone = zoneFor(timeZone, timeZoneData)
  const start = Date.parse(`${normalizeEidosFileDate(startDate)}T00:00:00.000Z`)
  const end = Date.parse(`${normalizeEidosFileDate(endDate)}T00:00:00.000Z`)
  if (start >= end)
    throw new EidosFileError(
      "invalid-query",
      "Calendar range must be increasing"
    )
  if (startDate < "1970-01-01" || endDate > "2500-01-01")
    throw new EidosFileError(
      "unsupported-feature",
      "Calendar range is outside profile years 1970–2499"
    )
  const spans: Array<[number, number]> = []
  for (let index = 0; index < zone.untils.length; index++) {
    const lower = Math.max(
      start + zone.offsets[index]! * 60_000,
      index === 0 ? -Infinity : zone.untils[index - 1]!
    )
    const upper = Math.min(
      end + zone.offsets[index]! * 60_000,
      zone.untils[index]!
    )
    if (lower >= upper) continue
    const previous = spans.at(-1)
    if (previous && previous[1] === lower) previous[1] = upper
    else spans.push([lower, upper])
  }
  return spans.map(([lower, upper]) => [
    new Date(lower).toISOString(),
    new Date(upper).toISOString(),
  ])
}
