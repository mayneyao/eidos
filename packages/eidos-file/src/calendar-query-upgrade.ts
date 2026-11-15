import { canonicalizeEidosFileJson } from "./canonical-json"
import {
  isEidosFileCalendarDayValue,
  assertEidosFileCalendarZone,
} from "./calendar-day"
import { isEidosFileCalendarPeriodValue } from "./calendar-period"
import { isEidosFileCalendarWindowValue } from "./calendar-window"
import { EidosFileError } from "./errors"
import type { JsonObject, SavedViewQuery } from "./runtime-contract"

export const EIDOS_FILE_DATE_QUERY_UPGRADE_RECEIPT =
  "space.eidos/date-query-upgrade"
export const EIDOS_FILE_DATE_QUERY_UPGRADE_RECEIPT_MAX_BYTES = 65_536

export interface EidosFileDateQueryUpgrade {
  query: SavedViewQuery
  changes: Array<{
    fieldId: string
    from: string
    unit: "day" | "week" | "month" | "year"
    offset: -1 | 0 | 1
  }>
}

export function hasRetiredEidosFileDateQuery(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some(hasRetiredEidosFileDateQuery)
  const node = value as Record<string, unknown>
  if (
    [
      "relative-date",
      "calendar-day",
      "is-relative-to-today",
      "is-on-calendar-day",
    ].includes(node.op as string)
  )
    return true
  if (
    node.type === "rule" &&
    ["is-relative-to-today", "is-on-calendar-day"].includes(
      node.operator as string
    )
  )
    return true
  return (
    (node.filter !== undefined && hasRetiredEidosFileDateQuery(node.filter)) ||
    (node.op === "not" && hasRetiredEidosFileDateQuery(node.arg)) ||
    ((node.op === "and" || node.op === "or") &&
      Array.isArray(node.args) &&
      node.args.some(hasRetiredEidosFileDateQuery)) ||
    (node.type === "group" &&
      Array.isArray(node.children) &&
      node.children.some(hasRetiredEidosFileDateQuery))
  )
}

/** Preview an explicit semantic upgrade. Unknown nodes fail the whole preview. */
export function upgradeEidosFileDateQuery(
  value: unknown
): EidosFileDateQueryUpgrade {
  const invalid = (message: string): never => {
    throw new EidosFileError("invalid-query", message)
  }
  const object = (entry: unknown): Record<string, unknown> =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : invalid("Date query upgrade requires objects")
  const keys = (entry: Record<string, unknown>, allowed: readonly string[]) => {
    if (Object.keys(entry).some((key) => !allowed.includes(key)))
      invalid("Query members do not match the operator's structure")
  }
  const source = object(value)
  keys(source, ["filter", "sort"])
  const changes: EidosFileDateQueryUpgrade["changes"] = []
  let nodes = 0
  const visit = (entry: unknown, depth: number): Record<string, unknown> => {
    if (++nodes > 100 || depth > 8)
      invalid("Date query upgrade exceeds query limits")
    const node = object(entry)
    if (node.op === "and" || node.op === "or") {
      keys(node, ["op", "args"])
      if (!Array.isArray(node.args)) invalid("Logical query args are invalid")
      return {
        ...node,
        args: (node.args as unknown[]).map((child) => visit(child, depth + 1)),
      }
    }
    if (node.op === "not") {
      keys(node, ["op", "arg"])
      return { ...node, arg: visit(node.arg, depth + 1) }
    }
    if (typeof node.fieldId !== "string" || !node.fieldId)
      invalid("Query Field is required")
    if (node.op === "calendar-day") {
      keys(node, ["op", "fieldId", "day", "timeZone", "timeZoneData"])
      if (
        !isEidosFileCalendarDayValue({
          day: node.day,
          timeZone: node.timeZone,
          timeZoneData: node.timeZoneData,
        })
      )
        invalid("Retired calendar day is invalid")
      assertEidosFileCalendarZone(
        node.timeZone as string,
        node.timeZoneData as string
      )
      const offset =
        node.day === "yesterday" ? -1 : node.day === "tomorrow" ? 1 : 0
      changes.push({
        fieldId: node.fieldId as string,
        from: `calendar-day:${String(node.day)}`,
        unit: "day",
        offset,
      })
      return {
        op: "calendar-period",
        fieldId: node.fieldId,
        unit: "day",
        offset,
      }
    }
    if (node.op === "relative-date") {
      keys(node, ["op", "fieldId", "direction", "unit"])
      const offset =
        node.direction === "past"
          ? -1
          : node.direction === "this"
            ? 0
            : node.direction === "next"
              ? 1
              : null
      const candidate = { unit: node.unit, offset }
      if (!isEidosFileCalendarPeriodValue(candidate))
        invalid("Retired relative date is invalid")
      const period = candidate as {
        unit: "day" | "week" | "month" | "year"
        offset: -1 | 0 | 1
      }
      changes.push({
        fieldId: node.fieldId as string,
        from: `relative-date:${String(node.direction)}:${String(node.unit)}`,
        ...period,
      })
      return { op: "calendar-period", fieldId: node.fieldId, ...period }
    }
    const operands: Record<string, readonly string[]> = {
      "calendar-window": ["direction", "unit", "count"],
      "calendar-period": ["unit", "offset"],
      "is-null": [],
      "is-not-null": [],
      eq: ["value"],
      ne: ["value"],
      lt: ["value"],
      lte: ["value"],
      gt: ["value"],
      gte: ["value"],
      between: ["lower", "upper"],
      in: ["values"],
      contains: ["value"],
      "starts-with": ["value"],
      "ends-with": ["value"],
      "has-any": ["values"],
      "has-all": ["values"],
      "relation-has": ["rowId"],
    }
    const expected = typeof node.op === "string" ? operands[node.op] : undefined
    if (!expected)
      throw new EidosFileError(
        "unsupported-feature",
        "Unknown query nodes cannot be upgraded safely"
      )
    keys(node, ["op", "fieldId", ...expected])
    if (expected.some((key) => !(key in node)))
      invalid("Query operand is missing")
    if (
      ["eq", "ne", "lt", "lte", "gt", "gte"].includes(node.op as string) &&
      node.value === null
    )
      invalid("Query comparison requires a non-null operand")
    if (node.op === "between" && (node.lower === null || node.upper === null))
      invalid("Between requires non-null operands")
    if (
      ["in", "has-any", "has-all"].includes(node.op as string) &&
      (!Array.isArray(node.values) ||
        node.values.length > 500 ||
        node.values.some((item) => item === null))
    )
      invalid("Query list operands are invalid")
    if (
      ["contains", "starts-with", "ends-with"].includes(node.op as string) &&
      typeof node.value !== "string"
    )
      invalid("Query text operand is invalid")
    if (node.op === "relation-has" && typeof node.rowId !== "string")
      invalid("Query Relation operand is invalid")
    if (
      node.op === "calendar-window" &&
      !isEidosFileCalendarWindowValue({
        direction: node.direction,
        unit: node.unit,
        count: node.count,
      })
    )
      invalid("Calendar window is invalid")
    if (
      node.op === "calendar-period" &&
      !isEidosFileCalendarPeriodValue({ unit: node.unit, offset: node.offset })
    )
      invalid("Calendar period is invalid")
    return { ...node }
  }
  const query = {
    ...(source.filter === undefined ? {} : { filter: visit(source.filter, 0) }),
    ...(source.sort === undefined ? {} : { sort: source.sort }),
  }
  if (source.sort !== undefined) {
    if (!Array.isArray(source.sort)) invalid("Query sort is invalid")
    for (const entry of source.sort as unknown[]) {
      const sort = object(entry)
      keys(sort, ["fieldId", "direction", "nulls"])
      if (
        typeof sort.fieldId !== "string" ||
        !["asc", "desc"].includes(sort.direction as string) ||
        (sort.nulls !== undefined &&
          sort.nulls !== "first" &&
          sort.nulls !== "last")
      )
        invalid("Query sort is invalid")
    }
  }
  // Canonical JSON round-trip makes the returned document independently owned.
  return {
    query: JSON.parse(canonicalizeEidosFileJson(query)) as SavedViewQuery,
    changes,
  }
}

export function eidosFileDateQueryUpgradeReceipt(
  originalQuery: unknown,
  upgrade: EidosFileDateQueryUpgrade
): JsonObject {
  const receipt = JSON.parse(
    canonicalizeEidosFileJson({
      version: 2,
      originalQuery,
      changes: upgrade.changes,
    })
  ) as JsonObject
  if (
    new TextEncoder().encode(canonicalizeEidosFileJson(receipt)).byteLength >
    EIDOS_FILE_DATE_QUERY_UPGRADE_RECEIPT_MAX_BYTES
  )
    throw new EidosFileError(
      "query-limit",
      "Date query recovery receipt exceeds 65536 bytes"
    )
  return receipt
}
