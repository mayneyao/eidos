import {
  EIDOS_FILE_CALENDAR_MAX_YEAR,
  EIDOS_FILE_CALENDAR_MIN_YEAR,
  eidosFileCalendarDateRangeIntervals,
  eidosFileCalendarPeriodBounds,
  eidosFileCalendarWindowBounds,
  isEidosFileCalendarPeriodValue,
  isEidosFileCalendarWindowValue,
  type EidosFileCalendarContext,
  type EidosFileFilterOperator,
  type EidosFileFilterRule,
} from "@eidos.space/eidos-file"
import type { SpaceTreeEntry } from "../../shared/contracts"
import type { ExplorerCalendarExecution } from "../../shared/explorer-calendar"
import {
  isExplorerRuleActive,
  toExplorerFilterGroup,
  type ExplorerFileFilter,
  type ExplorerFileSystemFilterRule,
  type ExplorerFilterGroup,
} from "../../shared/explorer-file-filter"

const PROFILE_START = `${EIDOS_FILE_CALENDAR_MIN_YEAR}-01-01`
const PROFILE_END = `${EIDOS_FILE_CALENDAR_MAX_YEAR + 1}-01-01`

function nextDate(date: string): string {
  const midnight = new Date(`${date}T00:00:00.000Z`)
  midnight.setUTCDate(midnight.getUTCDate() + 1)
  return midnight.toISOString().slice(0, 10)
}

function compareSize(
  operator: EidosFileFilterOperator,
  size: number,
  lower: number,
  upper: number
): boolean {
  switch (operator) {
    case "equals":
      return size === lower
    case "greater-than":
      return size > lower
    case "greater-than-or-equal":
      return size >= lower
    case "less-than":
      return size < lower
    case "less-than-or-equal":
      return size <= lower
    case "is-between":
      return size >= lower && size <= upper
    default:
      throw new Error("Invalid file size condition")
  }
}

function absoluteDateIntervals(
  rule: EidosFileFilterRule,
  calendar: EidosFileCalendarContext
): Array<readonly [string, string]> {
  const { operator, value } = rule
  // Draft validation in isExplorerRuleActive already checked both endpoints.
  const first = String(Array.isArray(value) ? value[0] : value)
  const last = String(Array.isArray(value) ? value[1] : value)
  let start = first
  let end = nextDate(last)
  if (operator === "less-than" || operator === "less-than-or-equal") {
    start = PROFILE_START
    if (operator === "less-than") end = first
  } else if (
    operator === "greater-than" ||
    operator === "greater-than-or-equal"
  ) {
    if (operator === "greater-than") start = end
    end = PROFILE_END
  }
  if (
    (start === PROFILE_END && end === PROFILE_END) ||
    (start === PROFILE_START && end === PROFILE_START)
  )
    return []
  return eidosFileCalendarDateRangeIntervals(
    start,
    end,
    calendar.timeZone,
    calendar.timeZoneData
  )
}

/** Bind each rule once. A tree walk only compares numeric stat values. */
export function compileExplorerFileSystemFilter(
  filter: ExplorerFileFilter,
  execution?: ExplorerCalendarExecution
): {
  predicates: Map<
    ExplorerFileSystemFilterRule,
    (entry: SpaceTreeEntry) => boolean
  >
  referenceInstant?: string
} {
  const predicates = new Map<
    ExplorerFileSystemFilterRule,
    (entry: SpaceTreeEntry) => boolean
  >()
  let referenceInstant: string | undefined
  const visit = (group: ExplorerFilterGroup): void => {
    for (const child of group.children) {
      if (child.type === "group") {
        visit(child)
        continue
      }
      if (child.field !== "file-system" || !isExplorerRuleActive(child))
        continue
      const { field, operator, value } = child.value
      if (field === "explorer:size") {
        const lower = Number(Array.isArray(value) ? value[0] : value)
        const upper = Number(Array.isArray(value) ? value[1] : value)
        predicates.set(child, (entry) =>
          compareSize(operator, entry.size, lower, upper)
        )
        continue
      }
      if (!execution)
        throw new Error(
          "Date filters require the application's calendar settings."
        )
      const calendar = execution.calendar
      let intervals: Array<readonly [string, string]>
      if (operator === "is-in-calendar-window") {
        if (
          execution.calendarWindowVersion !== 1 ||
          !isEidosFileCalendarWindowValue(value)
        )
          throw new Error("Invalid file date window")
        referenceInstant ??=
          execution.referenceInstant ?? new Date().toISOString()
        intervals = eidosFileCalendarWindowBounds(
          value,
          calendar,
          referenceInstant
        ).intervals
      } else if (operator === "is-in-calendar-period") {
        if (!isEidosFileCalendarPeriodValue(value))
          throw new Error("Invalid file date period")
        referenceInstant ??=
          execution.referenceInstant ?? new Date().toISOString()
        intervals = eidosFileCalendarPeriodBounds(
          value,
          calendar,
          referenceInstant
        ).intervals
      } else {
        intervals = absoluteDateIntervals(child.value, calendar)
      }
      const ranges = intervals.map(
        ([start, end]) => [Date.parse(start), Date.parse(end)] as const
      )
      const key =
        field === "explorer:createdAt" ? "createdAtMs" : "modifiedAtMs"
      predicates.set(child, (entry) => {
        const timestamp = entry[key]
        return (
          timestamp !== undefined &&
          ranges.some(([start, end]) => start <= timestamp && timestamp < end)
        )
      })
    }
  }
  visit(toExplorerFilterGroup(filter))
  return {
    predicates,
    ...(referenceInstant ? { referenceInstant } : {}),
  }
}
