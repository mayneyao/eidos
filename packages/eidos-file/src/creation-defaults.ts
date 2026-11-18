import type { EidosFileConnection, EidosFileSqlPrimitive } from "./connection"
import { quoteIdentifier } from "./identifiers"
import { compileEidosFileRowQuery, assertEidosFileRowQuery } from "./query"
import {
  eidosFileCalendarPeriodBounds,
  isEidosFileCalendarPeriodValue,
} from "./calendar-period"
import {
  eidosFileCalendarWindowBounds,
  isEidosFileCalendarWindowValue,
} from "./calendar-window"
import { parseEidosFileSelectOptions } from "./select-options"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
  EidosFileFilterRule,
  EidosFileRow,
  EidosFileRowQuery,
} from "./types"

type Branch = EidosFileFilterRule[]
const MAX_BRANCHES = 32

// Bounded expansion. Negation is executable but deliberately has no positive seed.
function branches(
  node: EidosFileFilterGroup | EidosFileFilterRule
): Branch[] | null {
  if (node.type === "rule") return [[node]]
  if (node.negated) return null
  let result: Branch[] = node.conjunction === "and" ? [[]] : []
  for (const child of node.children) {
    const next = branches(child)
    if (!next) return null
    if (node.conjunction === "or") result.push(...next)
    else
      result = result.flatMap((left) =>
        next.map((right) => [...left, ...right])
      )
    if (result.length > MAX_BRANCHES) return null
  }
  return result
}

function step(
  value: string | number,
  field: EidosFileFieldInfo,
  direction: number
): EidosFileSqlPrimitive | undefined {
  if (field.type === "rating") return Number(value) + direction
  if (field.type === "integer") {
    try {
      return BigInt(value) + BigInt(direction)
    } catch {
      return undefined
    }
  }
  if (field.type === "number") {
    const number = Number(value)
    // Prefer a readable unit step; the adjacent binary64 value covers narrow ranges.
    return number + direction
  }
  if (field.type === "date" || field.type === "datetime") {
    const instant = Date.parse(
      String(value) + (field.type === "date" ? "T00:00:00.000Z" : "")
    )
    if (!Number.isFinite(instant)) return undefined
    const date = new Date(
      instant + direction * (field.type === "date" ? 86400000 : 1)
    )
    if (!Number.isFinite(date.getTime())) return undefined
    return field.type === "date"
      ? date.toISOString().slice(0, 10)
      : date.toISOString()
  }
  return undefined
}

function adjacent(value: number, direction: number): number {
  if (value === 0) return direction * Number.MIN_VALUE
  const buffer = new ArrayBuffer(8),
    view = new DataView(buffer)
  view.setFloat64(0, value)
  view.setBigUint64(
    0,
    view.getBigUint64(0) + (Math.sign(value) === direction ? 1n : -1n)
  )
  return view.getFloat64(0)
}

function seeds(
  field: EidosFileFieldInfo,
  rules: Branch,
  query: EidosFileRowQuery,
  instant: string
): EidosFileSqlPrimitive[] {
  const result: EidosFileSqlPrimitive[] = []
  const members: string[] = [],
    fragments: string[] = [],
    prefixes: string[] = [],
    suffixes: string[] = []
  const options = parseEidosFileSelectOptions(
    field.settings ?? field.property
  ).map((option) => option.name)
  for (const rule of rules) {
    const value = rule.value
    if (rule.operator === "is-empty")
      result.push(
        field.storageCodec === "json_array" || field.storageCodec === "relation"
          ? "[]"
          : null
      )
    if (rule.operator === "equals") {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      )
        result.push(typeof value === "boolean" ? Number(value) : value)
    }
    if (field.type === "multi-select") {
      if (rule.operator === "contains" && typeof value === "string")
        members.push(value)
      if (
        rule.operator === "is-all-of" &&
        Array.isArray(value) &&
        value.every((entry) => typeof entry === "string")
      )
        members.push(...(value as string[]))
      if (
        rule.operator === "is-any-of" &&
        Array.isArray(value) &&
        value.length === 1 &&
        typeof value[0] === "string"
      )
        members.push(value[0])
    }
    if (["text", "url"].includes(field.type) && typeof value === "string") {
      if (rule.operator === "contains") fragments.push(value)
      if (rule.operator === "starts-with") prefixes.push(value)
      if (rule.operator === "ends-with") suffixes.push(value)
    }
    if (
      ["number", "integer", "rating", "date", "datetime"].includes(field.type)
    ) {
      if (rule.operator === "is-between" && Array.isArray(value)) {
        for (const entry of value)
          if (typeof entry === "string" || typeof entry === "number")
            result.push(entry)
      }
      if (typeof value === "string" || typeof value === "number") {
        if (
          rule.operator === "greater-than-or-equal" ||
          rule.operator === "less-than-or-equal"
        )
          result.push(value)
        if (rule.operator === "greater-than" || rule.operator === "less-than") {
          const direction = rule.operator === "greater-than" ? 1 : -1
          const next = step(value, field, direction)
          if (next !== undefined) result.push(next)
          if (field.type === "number")
            result.push(adjacent(Number(value), direction))
        }
      }
      if (query.calendar) {
        const bounds =
          rule.operator === "is-in-calendar-period" &&
          isEidosFileCalendarPeriodValue(value)
            ? eidosFileCalendarPeriodBounds(value, query.calendar, instant)
            : rule.operator === "is-in-calendar-window" &&
                isEidosFileCalendarWindowValue(value)
              ? eidosFileCalendarWindowBounds(value, query.calendar, instant)
              : null
        if (bounds) {
          if (field.type === "date") result.push(bounds.startDate)
          else for (const [start] of bounds.intervals) result.push(start)
        }
      }
    }
  }
  if (members.length && members.every((member) => options.includes(member)))
    result.push(JSON.stringify([...new Set(members)]))
  if (fragments.length || prefixes.length || suffixes.length) {
    const prefix = prefixes.sort((a, b) => b.length - a.length)[0] ?? ""
    let text = prefix
    for (const fragment of fragments)
      if (!text.toLowerCase().includes(fragment.toLowerCase())) text += fragment
    const suffix = suffixes.sort((a, b) => b.length - a.length)[0] ?? ""
    if (!text.toLowerCase().endsWith(suffix.toLowerCase())) text += suffix
    result.push(text)
  }
  // A Select fragment may identify a unique existing option; never create options.
  if (
    field.type === "checkbox" &&
    rules.some(
      (rule) => rule.operator === "equals" || rule.operator === "not-equals"
    )
  )
    result.push(0, 1)
  if (field.type === "select")
    return [
      ...new Set([
        ...result,
        ...(rules.some((rule) =>
          ["equals", "contains", "starts-with", "ends-with"].includes(
            rule.operator
          )
        )
          ? options
          : []),
      ]),
    ].filter((value) => value === null || options.includes(String(value)))
  // Never invent references, attachments, or computed values.
  if (["relation", "file"].includes(field.type))
    return result.filter((value) => value === "[]" || value === null)
  if (field.type === "integer" || field.type === "rating")
    return [
      ...new Set(
        result.flatMap((value) => {
          if (typeof value !== "string") return [value]
          try {
            return [field.type === "rating" ? Number(value) : BigInt(value)]
          } catch {
            return []
          }
        })
      ),
    ]
  return [...new Set(result)]
}

/** Internal ordinary-create policy. Candidate acceptance uses the query compiler and adapter SQL. */
export function inferEidosFileCreationDefaults(
  connection: EidosFileConnection,
  fields: EidosFileFieldInfo[],
  query: EidosFileRowQuery,
  explicit: EidosFileRow,
  defaults: EidosFileRow,
  instant: string,
  normalize: (
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => EidosFileSqlPrimitive
): EidosFileRow {
  assertEidosFileRowQuery(query)
  if (!query.filter) return {}
  // Compile the complete filter first: invalid/retired fields never silently disappear.
  compileEidosFileRowQuery(
    fields,
    { filter: query.filter, calendar: query.calendar },
    { referenceInstant: instant }
  )
  const alternatives = branches(query.filter)
  if (!alternatives?.length) return {}
  const plans: EidosFileRow[] = []
  let evaluations = 0
  for (const branch of alternatives) {
    const plan: EidosFileRow = {}
    let excluded = false
    for (const field of fields) {
      const rules = branch.filter(
        (rule) => rule.field === field.tableColumnName
      )
      if (!rules.length) continue
      const key = field.tableColumnName
      const compiled = compileEidosFileRowQuery(
        [field],
        {
          filter: { type: "group", conjunction: "and", children: rules },
          calendar: query.calendar,
        },
        { referenceInstant: instant }
      )
      const affinity = ["number"].includes(field.type)
        ? "REAL"
        : ["integer", "rating", "checkbox"].includes(field.type)
          ? "INTEGER"
          : "TEXT"
      const accepts = (value: EidosFileRow[string]) => {
        if (++evaluations > 2048) return false
        return Boolean(
          connection.get<{ matched: number }>(
            `SELECT 1 AS matched FROM (SELECT CAST(? AS ${affinity}) AS ${quoteIdentifier(key)}) ${compiled.whereSql}`,
            [
              typeof value === "boolean" ? Number(value) : value,
              ...compiled.params,
            ]
          )
        )
      }
      if (Object.hasOwn(explicit, key)) {
        if (!accepts(explicit[key] ?? null)) excluded = true
        continue
      }
      if (
        field.systemRole ||
        field.isDerived ||
        !["source", "relation"].includes(field.valueKind) ||
        field.writable === false ||
        field.settings?.writable === false ||
        field.settings?.readOnly === true ||
        field.settings?.isSystem === true
      )
        continue
      const base = defaults[key] ?? null
      if ((base !== null || field.nullable !== false) && accepts(base)) {
        plan[key] = base
        continue
      }
      const candidates = seeds(field, rules, query, instant).flatMap(
        (value) => {
          let normalized: EidosFileSqlPrimitive
          try {
            normalized = normalize(field, value)
          } catch {
            return []
          }
          if (normalized === null && field.nullable === false) return []
          return accepts(normalized) ? [normalized] : []
        }
      )
      // Select fragments with multiple valid options are ambiguous.
      if (field.type === "select" && new Set(candidates).size > 1) continue
      if (candidates.length) plan[key] = candidates[0]!
    }
    if (evaluations > 2048) return {}
    if (!excluded) plans.push(plan)
  }
  if (!plans.length) return {}
  return Object.fromEntries(
    Object.entries(plans[0]!).filter(([key, value]) =>
      plans.every((plan) => Object.hasOwn(plan, key) && plan[key] === value)
    )
  )
}
