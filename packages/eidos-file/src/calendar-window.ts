import { EidosFileError } from "./errors"
import {
  eidosFileCalendarDateRangeIntervals,
  projectEidosFileCalendarInstant,
} from "./calendar-day"
import {
  assertEidosFileCalendarContext,
  type EidosFileCalendarContext,
  type EidosFileCalendarPeriodBounds,
} from "./calendar-period"

export interface EidosFileCalendarWindowValue {
  direction: "past" | "next"
  count: number
  unit: "day" | "week" | "month" | "year"
}

/** Covers every possible date span within the advertised 1970–2499 profile. */
export const EIDOS_FILE_CALENDAR_WINDOW_COUNT_MAX = 1_000_000

export function isEidosFileCalendarWindowValue(
  value: unknown
): value is EidosFileCalendarWindowValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    Object.keys(item).every((key) =>
      ["direction", "count", "unit"].includes(key)
    ) &&
    (item.direction === "past" || item.direction === "next") &&
    typeof item.count === "number" &&
    Number.isSafeInteger(item.count) &&
    item.count >= 1 &&
    item.count <= EIDOS_FILE_CALENDAR_WINDOW_COUNT_MAX &&
    ["day", "week", "month", "year"].includes(item.unit as string)
  )
}

export function hasEidosFileCalendarWindowQuery(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some(hasEidosFileCalendarWindowQuery)
  const node = value as Record<string, unknown>
  if (
    node.op === "calendar-window" ||
    (node.type === "rule" && node.operator === "is-in-calendar-window")
  )
    return true
  return (
    (node.filter !== undefined &&
      hasEidosFileCalendarWindowQuery(node.filter)) ||
    (node.op === "not" && hasEidosFileCalendarWindowQuery(node.arg)) ||
    ((node.op === "and" || node.op === "or") &&
      Array.isArray(node.args) &&
      node.args.some(hasEidosFileCalendarWindowQuery)) ||
    (node.type === "group" &&
      Array.isArray(node.children) &&
      node.children.some(hasEidosFileCalendarWindowQuery))
  )
}

/** A relative-to-today date window includes both the shifted date and today. */
export function eidosFileCalendarWindowBounds(
  value: EidosFileCalendarWindowValue,
  context: EidosFileCalendarContext,
  referenceInstant: string
): EidosFileCalendarPeriodBounds {
  if (!isEidosFileCalendarWindowValue(value))
    throw new EidosFileError("invalid-query", "Calendar window is invalid")
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
  const today = Date.UTC(reference.year, reference.month - 1, reference.day)
  const amount = value.count * (value.direction === "past" ? -1 : 1)
  let target: number
  if (value.unit === "day" || value.unit === "week") {
    target = today + amount * (value.unit === "week" ? 7 : 1) * 86_400_000
  } else {
    const monthIndex =
      reference.year * 12 +
      reference.month -
      1 +
      amount * (value.unit === "year" ? 12 : 1)
    const year = Math.floor(monthIndex / 12)
    // Reject outside the profile before Date.UTC can reinterpret years 0..99.
    if (year < 1970 || year > 2499)
      throw new EidosFileError(
        "unsupported-feature",
        "Calendar window is outside profile years 1970–2499"
      )
    const first = new Date(Date.UTC(year, monthIndex % 12, 1))
    const last = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
    ).getUTCDate()
    target = Date.UTC(
      first.getUTCFullYear(),
      first.getUTCMonth(),
      Math.min(reference.day, last)
    )
  }
  const start = value.direction === "past" ? target : today
  const end = (value.direction === "past" ? today : target) + 86_400_000
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    new Date(start).getUTCFullYear() < 1970 ||
    end > Date.UTC(2500, 0, 1)
  )
    throw new EidosFileError(
      "unsupported-feature",
      "Calendar window is outside profile years 1970–2499"
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
