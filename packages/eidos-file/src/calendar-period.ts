import {
  assertEidosFileCalendarZone,
  eidosFileCalendarDateRangeIntervals,
  projectEidosFileCalendarInstant,
  EIDOS_FILE_CALENDAR_MIN_YEAR,
  EIDOS_FILE_CALENDAR_MAX_YEAR,
} from "./calendar-day"
import { EidosFileError } from "./errors"

/** Host-resolved application preferences. Never persisted in a filter leaf. */
export interface EidosFileCalendarContext {
  timeZone: string
  timeZoneData: string
  weekStartsOn: 0 | 1
}

export interface EidosFileCalendarPeriodValue {
  unit: "day" | "week" | "month" | "year"
  offset: -1 | 0 | 1
}

/** Inspect period syntax without treating operand objects as predicates. */
export function hasEidosFileCalendarPeriodQuery(value: unknown): boolean {
  return hasCalendarQuery(value, false)
}

/** Calendar context and root-R requirements apply to periods and windows. */
export function hasEidosFileCalendarQuery(value: unknown): boolean {
  return hasCalendarQuery(value, true)
}

function hasCalendarQuery(value: unknown, windows: boolean): boolean {
  if (!value || typeof value !== "object") return false
  const visit = (value: unknown): boolean => hasCalendarQuery(value, windows)
  if (Array.isArray(value)) return value.some(visit)
  const node = value as Record<string, unknown>
  if (
    node.op === "calendar-period" ||
    (windows && node.op === "calendar-window") ||
    (node.type === "rule" &&
      (node.operator === "is-in-calendar-period" ||
        (windows && node.operator === "is-in-calendar-window")))
  )
    return true
  return (
    (node.filter !== undefined && visit(node.filter)) ||
    (node.op === "not" && visit(node.arg)) ||
    ((node.op === "and" || node.op === "or") &&
      Array.isArray(node.args) &&
      node.args.some(visit)) ||
    (node.type === "group" &&
      Array.isArray(node.children) &&
      node.children.some(visit))
  )
}

export function isEidosFileCalendarPeriodValue(
  value: unknown
): value is EidosFileCalendarPeriodValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    Object.keys(item).every((key) => key === "unit" || key === "offset") &&
    ["day", "week", "month", "year"].includes(item.unit as string) &&
    (item.offset === -1 || item.offset === 0 || item.offset === 1)
  )
}

export function assertEidosFileCalendarContext(
  value: unknown
): asserts value is EidosFileCalendarContext {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new EidosFileError("invalid-query", "Calendar context is required")
  const item = value as Record<string, unknown>
  if (
    Object.keys(item).some(
      (key) => !["timeZone", "timeZoneData", "weekStartsOn"].includes(key)
    ) ||
    typeof item.timeZone !== "string" ||
    typeof item.timeZoneData !== "string" ||
    (item.weekStartsOn !== 0 && item.weekStartsOn !== 1)
  )
    throw new EidosFileError("invalid-query", "Calendar context is invalid")
  assertEidosFileCalendarZone(item.timeZone, item.timeZoneData)
}

export interface EidosFileCalendarPeriodBounds {
  /** Half-open Gregorian dates for Date values, without time-zone conversion. */
  startDate: string
  endDate: string
  /** Full inverse image for Datetime values, including offset transitions. */
  intervals: Array<readonly [string, string]>
}

/** Whole local calendar periods; never rolling durations or UTC projections. */
export function eidosFileCalendarPeriodBounds(
  value: EidosFileCalendarPeriodValue,
  context: EidosFileCalendarContext,
  referenceInstant: string
): EidosFileCalendarPeriodBounds {
  if (!isEidosFileCalendarPeriodValue(value))
    throw new EidosFileError("invalid-query", "Calendar period is invalid")
  assertEidosFileCalendarContext(context)
  const reference = projectEidosFileCalendarInstant(
    referenceInstant,
    context.timeZone,
    context.timeZoneData
  )
  if (!reference)
    throw new EidosFileError(
      "unsupported-feature",
      "Calendar reference is outside profile years 1970–2499"
    )
  let start: number
  let end: number
  const { year, month, day } = reference
  if (value.unit === "year") {
    start = Date.UTC(year + value.offset, 0, 1)
    end = Date.UTC(year + value.offset + 1, 0, 1)
  } else if (value.unit === "month") {
    start = Date.UTC(year, month - 1 + value.offset, 1)
    end = Date.UTC(year, month + value.offset, 1)
  } else {
    const today = Date.UTC(year, month - 1, day)
    const weekOffset =
      (new Date(today).getUTCDay() - context.weekStartsOn + 7) % 7
    const startDay =
      value.unit === "week"
        ? day - weekOffset + value.offset * 7
        : day + value.offset
    start = Date.UTC(year, month - 1, startDay)
    end = Date.UTC(year, month - 1, startDay + (value.unit === "week" ? 7 : 1))
  }
  if (
    new Date(start).getUTCFullYear() < EIDOS_FILE_CALENDAR_MIN_YEAR ||
    end > Date.UTC(EIDOS_FILE_CALENDAR_MAX_YEAR + 1, 0, 1)
  )
    throw new EidosFileError(
      "unsupported-feature",
      "Calendar target is outside profile years 1970–2499"
    )
  const startDate = new Date(start).toISOString().slice(0, 10)
  const endDate = new Date(end).toISOString().slice(0, 10)
  return {
    startDate,
    endDate,
    intervals: eidosFileCalendarDateRangeIntervals(
      startDate,
      endDate,
      context.timeZone,
      context.timeZoneData
    ),
  }
}
