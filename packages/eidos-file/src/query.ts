import type { EidosFileSqlParams, EidosFileSqlPrimitive } from "./connection"
import { canonicalizeEidosFileJson } from "./canonical-json"
import { EidosFileError } from "./errors"
import {
  eidosFileFieldQueryCapabilities,
  eidosFileFieldValueType,
} from "./field-query-capabilities"
import { quoteIdentifier } from "./identifiers"
import {
  currentEidosFileInstant,
  normalizeEidosFileDate,
  normalizeEidosFileInstant,
} from "./temporal"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
  EidosFileFilterOperator,
  EidosFileFilterRuleValue,
  EidosFileRelativeDateValue,
  EidosFileFilterRule,
  EidosFileFilterValue,
  EidosFileRowQuery,
  EidosFileSort,
} from "./types"

const FILTER_OPERATORS = new Set<EidosFileFilterRule["operator"]>([
  "equals",
  "not-equals",
  "contains",
  "not-contains",
  "starts-with",
  "ends-with",
  "greater-than",
  "greater-than-or-equal",
  "less-than",
  "less-than-or-equal",
  "is-empty",
  "is-not-empty",
  "is-any-of",
  "is-all-of",
  "is-none-of",
  "is-between",
  "is-relative-to-today",
])

/** Returns whether a persisted compatibility filter operator is executable. */
export function isEidosFileFilterOperator(
  value: unknown
): value is EidosFileFilterRule["operator"] {
  return FILTER_OPERATORS.has(value as EidosFileFilterRule["operator"])
}

const MAX_QUERY_DEPTH = 8
const MAX_QUERY_FILTER_NODES = 100
const MAX_QUERY_SORTS = 32
const MAX_QUERY_SEARCH_LENGTH = 1_000

/** Rejects malformed or over-budget public query documents before normalization. */
export function assertEidosFileRowQuery(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EidosFileError("invalid-query", "Row query must be an object")
  }
  const query = value as Record<string, unknown>
  if (
    query.search !== undefined &&
    (typeof query.search !== "string" ||
      query.search.length > MAX_QUERY_SEARCH_LENGTH)
  ) {
    throw new EidosFileError(
      "query-limit",
      "Search text exceeds the 1000-character limit"
    )
  }
  if (query.sorts !== undefined) {
    if (!Array.isArray(query.sorts) || query.sorts.length > MAX_QUERY_SORTS) {
      throw new EidosFileError(
        "query-limit",
        "A query may contain at most 32 sort keys"
      )
    }
    for (const sort of query.sorts) {
      if (
        !sort ||
        typeof sort !== "object" ||
        Array.isArray(sort) ||
        typeof (sort as { field?: unknown }).field !== "string" ||
        !["asc", "desc"].includes(
          String((sort as { direction?: unknown }).direction ?? "asc")
        ) ||
        ((sort as { nulls?: unknown }).nulls !== undefined &&
          !["first", "last"].includes(
            String((sort as { nulls?: unknown }).nulls)
          ))
      ) {
        throw new EidosFileError("invalid-query", "Invalid sort document")
      }
    }
  }
  let nodeCount = 0
  const visit = (node: unknown, depth: number): void => {
    nodeCount += 1
    if (depth > MAX_QUERY_DEPTH || nodeCount > MAX_QUERY_FILTER_NODES) {
      throw new EidosFileError(
        "query-limit",
        "Filter exceeds the query complexity limit"
      )
    }
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new EidosFileError("invalid-query", "Filter nodes must be objects")
    }
    const filter = node as Record<string, unknown>
    if (filter.type === "group") {
      if (
        !["and", "or"].includes(String(filter.conjunction)) ||
        !Array.isArray(filter.children)
      ) {
        throw new EidosFileError("invalid-query", "Invalid filter group")
      }
      filter.children.forEach((child) => visit(child, depth + 1))
      return
    }
    if (
      filter.type !== "rule" ||
      typeof filter.field !== "string" ||
      !isEidosFileFilterOperator(filter.operator)
    ) {
      throw new EidosFileError("invalid-query", "Invalid filter rule")
    }
    if (filter.operator === "is-relative-to-today") {
      if (!isRelativeDateValue(filter.value)) {
        throw new EidosFileError(
          "invalid-query",
          "Relative date filter value is invalid"
        )
      }
      return
    }
    const values = Array.isArray(filter.value) ? filter.value : [filter.value]
    if (
      values.length > 500 ||
      values.some(
        (entry) =>
          entry !== undefined &&
          entry !== null &&
          typeof entry !== "string" &&
          typeof entry !== "number" &&
          typeof entry !== "boolean"
      )
    ) {
      throw new EidosFileError(
        "query-limit",
        "Filter values exceed the query limit"
      )
    }
    if (filter.operator === "is-between" && values.length !== 2) {
      throw new EidosFileError(
        "invalid-query",
        "Between filter requires exactly two values"
      )
    }
  }
  if (query.filter !== undefined && query.filter !== null)
    visit(query.filter, 0)
}

export interface CompiledEidosFileRowQuery {
  whereSql: string
  orderSql: string
  params: EidosFileSqlParams
}

function filterValue(value: unknown): EidosFileFilterValue | undefined {
  return value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : undefined
}

function isRelativeDateValue(
  value: unknown
): value is EidosFileRelativeDateValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    ["past", "next", "this"].includes(String(candidate.direction)) &&
    ["day", "week", "month", "year"].includes(String(candidate.unit))
  )
}

function normalizeFilterNode(
  value: unknown,
  depth: number
): EidosFileFilterRule | EidosFileFilterGroup | null {
  if (depth > MAX_QUERY_DEPTH || typeof value !== "object" || value === null)
    return null
  const candidate = value as Record<string, unknown>
  if (candidate.type === "rule") {
    if (
      typeof candidate.field !== "string" ||
      !isEidosFileFilterOperator(candidate.operator)
    ) {
      return null
    }
    const values: EidosFileFilterRuleValue | undefined =
      candidate.operator === "is-relative-to-today" &&
      isRelativeDateValue(candidate.value)
        ? {
            direction: candidate.value.direction,
            unit: candidate.value.unit,
          }
        : Array.isArray(candidate.value)
          ? candidate.value.flatMap((entry) => {
              const normalized = filterValue(entry)
              return normalized === undefined ? [] : [normalized]
            })
          : filterValue(candidate.value)
    return {
      type: "rule",
      field: candidate.field,
      operator: candidate.operator as EidosFileFilterRule["operator"],
      ...(values === undefined ? {} : { value: values }),
    }
  }
  if (candidate.type !== "group" || !Array.isArray(candidate.children)) {
    return null
  }
  return {
    type: "group",
    conjunction: candidate.conjunction === "or" ? "or" : "and",
    ...(candidate.negated === true ? { negated: true } : {}),
    children: candidate.children.flatMap((child) => {
      const normalized = normalizeFilterNode(child, depth + 1)
      return normalized ? [normalized] : []
    }),
  }
}

export function normalizeEidosFileFilter(
  value: unknown
): EidosFileFilterGroup | null {
  const normalized = normalizeFilterNode(value, 0)
  return normalized?.type === "group" ? normalized : null
}

export function removeEidosFileFilterField(
  group: EidosFileFilterGroup | null,
  field: string
): EidosFileFilterGroup | null {
  if (!group) return null
  const children: EidosFileFilterGroup["children"] = []
  for (const child of group.children) {
    if (child.type === "rule") {
      if (child.field !== field) children.push(child)
      continue
    }
    const nested = removeEidosFileFilterField(child, field)
    if (nested && nested.children.length > 0) children.push(nested)
  }
  return {
    ...group,
    children,
  }
}

export function normalizeEidosFileSorts(value: unknown): EidosFileSort[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { field?: unknown }).field !== "string"
    ) {
      return []
    }
    return [
      {
        field: (entry as { field: string }).field,
        direction:
          (entry as { direction?: unknown }).direction === "desc"
            ? ("desc" as const)
            : ("asc" as const),
        nulls:
          (entry as { nulls?: unknown }).nulls === "first"
            ? ("first" as const)
            : ("last" as const),
      },
    ]
  })
}

export function normalizeEidosFileRowQuery(value: unknown): EidosFileRowQuery {
  if (typeof value !== "object" || value === null) return {}
  const candidate = value as Record<string, unknown>
  return {
    ...(typeof candidate.search === "string"
      ? { search: candidate.search }
      : {}),
    ...(Array.isArray(candidate.searchFields) &&
    candidate.searchFields.every((field) => typeof field === "string")
      ? { searchFields: [...candidate.searchFields] as string[] }
      : {}),
    filter: normalizeEidosFileFilter(candidate.filter),
    sorts: normalizeEidosFileSorts(candidate.sorts),
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&")
}

function requiresUnicodeCasefold(value: string): boolean {
  const nonAscii = value.replace(/[\x00-\x7f]/g, "")
  return nonAscii.toUpperCase() !== nonAscii.toLowerCase()
}

function caseInsensitiveLike(
  expression: string,
  pattern: string,
  searchText: string,
  params: EidosFileSqlPrimitive[]
): string {
  params.push(pattern)
  return requiresUnicodeCasefold(searchText)
    ? `eidos_casefold(COALESCE(CAST(${expression} AS TEXT), ''))
         LIKE eidos_casefold(?) ESCAPE '\\'`
    : `COALESCE(CAST(${expression} AS TEXT), '')
         LIKE ? COLLATE NOCASE ESCAPE '\\'`
}

function searchExpression(
  field: EidosFileFieldInfo,
  pattern: string,
  searchText: string,
  params: EidosFileSqlPrimitive[]
): string {
  const column = quoteIdentifier(field.tableColumnName)
  const type = eidosFileFieldValueType(field)
  if (field.isRecordLabel && typeof type === "string") {
    const expression =
      type === "checkbox"
        ? `CASE ${column} WHEN 1 THEN 'true' WHEN 0 THEN 'false' ELSE NULL END`
        : type === "number"
          ? `eidos_canonical_number(${column})`
          : column
    return caseInsensitiveLike(expression, pattern, searchText, params)
  }
  const contextualRowIdLookup =
    field.type === "lookup" &&
    typeof type === "object" &&
    type.element === "row-id" &&
    typeof field.property?.relationField === "string"
  if (type === "relation" || contextualRowIdLookup) {
    const fragments = quoteIdentifier(`${field.tableColumnName}__search`)
    return `EXISTS (
      SELECT 1
        FROM json_each(
          CASE
            WHEN json_valid(${fragments}) AND json_type(${fragments}) = 'array'
              THEN ${fragments}
            ELSE '[]'
          END
        ) item
       WHERE ${caseInsensitiveLike("item.value", pattern, searchText, params)}
    )`
  }
  const listElement =
    typeof type === "object"
      ? type.element
      : type === "multi-select"
        ? "select"
        : type === "file"
          ? "file-entry"
          : null
  const fileEntryPredicate = (entry: string): string => {
    const name = `json_extract(${entry}, '$.name')`
    const mediaType = `json_extract(${entry}, '$.mediaType')`
    const uri = `json_extract(${entry}, '$.uri')`
    return `(
      ${caseInsensitiveLike(name, pattern, searchText, params)}
      OR ${caseInsensitiveLike(mediaType, pattern, searchText, params)}
      OR (
        lower(COALESCE(CAST(${uri} AS TEXT), '')) NOT LIKE 'data:%'
        AND ${caseInsensitiveLike(uri, pattern, searchText, params)}
      )
    )`
  }
  if (type === "file-entry") {
    const entry = `CASE WHEN json_valid(${column}) THEN ${column} ELSE '{}' END`
    return fileEntryPredicate(entry)
  }
  if (listElement === null) {
    return caseInsensitiveLike(column, pattern, searchText, params)
  }
  return `EXISTS (
    SELECT 1
      FROM json_each(
        CASE
          WHEN json_valid(${column}) AND json_type(${column}) = 'array'
            THEN ${column}
          ELSE '[]'
        END
      ) item
     WHERE ${
       listElement === "file-entry"
         ? fileEntryPredicate(
             "CASE WHEN item.type = 'object' THEN item.value ELSE '{}' END"
           )
         : caseInsensitiveLike("item.value", pattern, searchText, params)
     }
  )`
}

function searchableFields(
  fields: EidosFileFieldInfo[],
  selected?: readonly string[]
): EidosFileFieldInfo[] {
  const selection = selected ? new Set(selected) : null
  return fields.filter(
    (field) =>
      (!selection || (!!field.id && selection.has(field.id))) &&
      (!field.isHidden || selection !== null) &&
      eidosFileFieldQueryCapabilities(field).searchable &&
      (field.isRecordLabel ||
        field.valueKind === "source" ||
        field.valueKind === "materialized" ||
        field.valueKind === "derived" ||
        field.valueKind === "relation" ||
        (selection !== null && field.valueKind === "system"))
  )
}

export function eidosFileRowQuerySearchFields(
  fields: EidosFileFieldInfo[],
  query: EidosFileRowQuery
): EidosFileFieldInfo[] {
  const normalized = normalizeEidosFileRowQuery(query)
  return normalized.search === undefined || normalized.search === ""
    ? []
    : searchableFields(fields, normalized.searchFields)
}

function collectFilterFields(
  filter: EidosFileFilterGroup | null | undefined,
  target: Set<string>
): void {
  if (!filter) return
  for (const child of filter.children) {
    if (child.type === "group") {
      collectFilterFields(child, target)
    } else {
      target.add(child.field)
    }
  }
}

/**
 * Returns the columns whose values can affect whether a row matches a query.
 * Sort-only fields are intentionally excluded because counts do not depend on
 * row order. Consumers can add projected/grouped columns before building a
 * pruned derived-field source.
 */
export function eidosFileRowQueryPredicateColumns(
  fields: EidosFileFieldInfo[],
  query: EidosFileRowQuery
): Set<string> {
  const normalized = normalizeEidosFileRowQuery(query)
  const columns = new Set<string>()
  if (normalized.search !== undefined && normalized.search !== "") {
    for (const field of searchableFields(fields, normalized.searchFields)) {
      columns.add(field.tableColumnName)
    }
  }
  collectFilterFields(normalized.filter, columns)
  return columns
}

/**
 * Returns whether changing the supplied columns can alter the rows or ordering
 * produced by a query. Derived-field dependencies are followed transitively so
 * renderers do not need to duplicate Eidos File query semantics.
 */
export function eidosFileRowQueryAffectedByFieldChanges(
  fields: EidosFileFieldInfo[],
  query: EidosFileRowQuery,
  changedColumns: Iterable<string>
): boolean {
  const changed = new Set(changedColumns)
  if (changed.size === 0) return false

  const normalized = normalizeEidosFileRowQuery(query)
  const queriedColumns = eidosFileRowQueryPredicateColumns(fields, normalized)
  for (const sort of normalized.sorts ?? []) queriedColumns.add(sort.field)
  if (queriedColumns.size === 0) return false

  const fieldsByColumn = new Map(
    fields.map((field) => [field.tableColumnName, field])
  )
  const affected = (columnName: string, visiting: Set<string>): boolean => {
    if (changed.has(columnName)) return true
    if (visiting.has(columnName)) return false
    const field = fieldsByColumn.get(columnName)
    if (!field) return false

    const dependencies = new Set<string>()
    if (typeof field.sourceTableColumnName === "string") {
      dependencies.add(field.sourceTableColumnName)
    }
    if (Array.isArray(field.dependsOn)) {
      for (const dependency of field.dependsOn) {
        if (typeof dependency === "string") dependencies.add(dependency)
      }
    }
    if (dependencies.size === 0) return false

    const nextVisiting = new Set(visiting)
    nextVisiting.add(columnName)
    for (const dependency of dependencies) {
      if (affected(dependency, nextVisiting)) return true
    }
    return false
  }

  for (const columnName of queriedColumns) {
    if (affected(columnName, new Set())) return true
  }
  return false
}

function requireField(
  fields: Map<string, EidosFileFieldInfo>,
  columnName: string
): EidosFileFieldInfo {
  const field = fields.get(columnName)
  if (!field) {
    throw new EidosFileError(
      "field-not-found",
      `Eidos File field not found: ${columnName}`
    )
  }
  return field
}

function sqlValue(value: EidosFileFilterValue): EidosFileSqlPrimitive {
  return typeof value === "boolean" ? (value ? 1 : 0) : value
}

function sqlFieldValue(
  field: EidosFileFieldInfo,
  value: EidosFileFilterValue
): EidosFileSqlPrimitive {
  if (value === null) return null
  const type =
    (field.type === "formula" || field.type === "lookup") &&
    typeof field.property?.displayType === "string"
      ? field.property.displayType
      : field.type
  if (type === "date") {
    if (typeof value !== "string") {
      throw new EidosFileError(
        "invalid-query",
        `${field.name} filter values must use canonical YYYY-MM-DD text`
      )
    }
    return normalizeEidosFileDate(value, `${field.name} filter`)
  }
  if (
    type === "datetime" ||
    type === "created-time" ||
    type === "last-edited-time"
  ) {
    if (typeof value !== "string") {
      throw new EidosFileError(
        "invalid-query",
        `${field.name} filter values must be RFC 3339 text`
      )
    }
    return normalizeEidosFileInstant(value, `${field.name} filter`)
  }
  if (type === "integer") {
    if (
      typeof value !== "string" ||
      !/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/u.test(value) ||
      value === "-0"
    ) {
      throw new EidosFileError(
        "invalid-query",
        `${field.name} filter values must be canonical signed int64 decimal text`
      )
    }
    const integer = BigInt(value)
    if (
      integer < -9_223_372_036_854_775_808n ||
      integer > 9_223_372_036_854_775_807n
    ) {
      throw new EidosFileError(
        "invalid-query",
        `${field.name} filter value is outside signed int64`
      )
    }
    return integer
  }
  return sqlValue(value)
}

function temporalFieldType(
  field: EidosFileFieldInfo
): "date" | "datetime" | null {
  const type =
    (field.type === "formula" || field.type === "lookup") &&
    typeof field.property?.displayType === "string"
      ? field.property.displayType
      : field.type
  if (type === "date") return "date"
  if (
    type === "datetime" ||
    type === "created-time" ||
    type === "last-edited-time"
  ) {
    return "datetime"
  }
  return null
}

function shiftUtcMonth(instant: Date, amount: -1 | 1): Date {
  const result = new Date(instant.getTime())
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + amount)
  const endOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(day, endOfTargetMonth))
  return result
}

function shiftUtcYear(instant: Date, amount: -1 | 1): Date {
  const result = new Date(instant.getTime())
  const month = result.getUTCMonth()
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCFullYear(result.getUTCFullYear() + amount)
  result.setUTCMonth(month)
  const endOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), month + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(day, endOfTargetMonth))
  return result
}

function shiftUtcUnit(
  instant: Date,
  unit: EidosFileRelativeDateValue["unit"],
  amount: -1 | 1
): Date {
  if (unit === "day" || unit === "week") {
    const days = unit === "day" ? 1 : 7
    return new Date(instant.getTime() + amount * days * 86_400_000)
  }
  return unit === "month"
    ? shiftUtcMonth(instant, amount)
    : shiftUtcYear(instant, amount)
}

function utcPeriodStart(
  instant: Date,
  unit: EidosFileRelativeDateValue["unit"]
): Date {
  const year = instant.getUTCFullYear()
  const month = instant.getUTCMonth()
  const day = instant.getUTCDate()
  if (unit === "year") return new Date(Date.UTC(year, 0, 1))
  if (unit === "month") return new Date(Date.UTC(year, month, 1))
  const start = new Date(Date.UTC(year, month, day))
  if (unit === "week") {
    const daysSinceMonday = (start.getUTCDay() + 6) % 7
    start.setUTCDate(start.getUTCDate() - daysSinceMonday)
  }
  return start
}

function relativeTemporalBounds(
  relative: EidosFileRelativeDateValue,
  referenceInstant: string,
  type: "date" | "datetime"
): [string, string] {
  const reference = new Date(
    normalizeEidosFileInstant(referenceInstant, "Relative filter reference")
  )
  const ordered = (() => {
    if (relative.direction === "this") {
      const start = utcPeriodStart(reference, relative.unit)
      const nextStart =
        relative.unit === "day" || relative.unit === "week"
          ? new Date(
              start.getTime() + (relative.unit === "day" ? 1 : 7) * 86_400_000
            )
          : shiftUtcUnit(start, relative.unit, 1)
      return [start, new Date(nextStart.getTime() - 1)]
    }
    const past = relative.direction === "past"
    const boundary = shiftUtcUnit(reference, relative.unit, past ? -1 : 1)
    return past ? [boundary, reference] : [reference, boundary]
  })()
  return ordered.map((value) =>
    type === "date" ? value.toISOString().slice(0, 10) : value.toISOString()
  ) as [string, string]
}

function likeExpression(
  field: EidosFileFieldInfo,
  operator: EidosFileFilterRule["operator"],
  value: string,
  params: EidosFileSqlPrimitive[]
): string {
  const column = quoteIdentifier(field.tableColumnName)
  const escaped = escapeLike(value)
  const pattern =
    operator === "starts-with"
      ? `${escaped}%`
      : operator === "ends-with"
        ? `%${escaped}`
        : `%${escaped}%`
  const arrayCodec =
    field.storageCodec === "json_array" || field.storageCodec === "relation"
  if (arrayCodec && (operator === "contains" || operator === "not-contains")) {
    params.push(value)
    const expression = `EXISTS (
      SELECT 1 FROM json_each(${column}) item
       WHERE item.type = 'text' AND item.value = ?
    )`
    return operator === "not-contains" ? `NOT (${expression})` : expression
  }
  const expression = arrayCodec
    ? `EXISTS (
         SELECT 1
           FROM json_each(
             CASE
               WHEN json_valid(${column}) AND json_type(${column}) = 'array'
                 THEN ${column}
               ELSE '[]'
             END
           )
          WHERE ${caseInsensitiveLike("value", pattern, value, params)}
       )`
    : `COALESCE(${caseInsensitiveLike(column, pattern, value, params)}, 0)`
  return operator === "not-contains" ? `NOT (${expression})` : expression
}

function compileRule(
  rule: EidosFileFilterRule,
  fields: Map<string, EidosFileFieldInfo>,
  params: EidosFileSqlPrimitive[],
  referenceInstant: string
): string {
  const field = requireField(fields, rule.field)
  const column = quoteIdentifier(field.tableColumnName)
  const arrayCodec =
    field.storageCodec === "json_array" || field.storageCodec === "relation"
  const empty = arrayCodec
    ? `(${column} IS NULL OR (json_valid(${column}) AND json_type(${column}) = 'array' AND json_array_length(${column}) = 0))`
    : `(${column} IS NULL)`

  if (rule.operator === "is-empty") {
    return empty
  }
  if (rule.operator === "is-not-empty") {
    return `NOT ${empty}`
  }

  if (rule.operator === "is-relative-to-today") {
    const type = temporalFieldType(field)
    if (!type) {
      throw new EidosFileError(
        "invalid-query",
        `${field.name} does not support relative date filters`
      )
    }
    if (!isRelativeDateValue(rule.value)) {
      throw new EidosFileError(
        "invalid-query",
        `${field.name} relative date filter is invalid`
      )
    }
    const [lower, upper] = relativeTemporalBounds(
      rule.value,
      referenceInstant,
      type
    )
    params.push(lower, upper)
    return `COALESCE(${column} >= ? AND ${column} <= ?, 0)`
  }

  if (rule.operator === "is-between") {
    if (!Array.isArray(rule.value) || rule.value.length !== 2) {
      throw new EidosFileError(
        "invalid-query",
        `${field.name} between filter requires two values`
      )
    }
    const [lower, upper] = rule.value
    if (lower === null || upper === null) {
      throw new EidosFileError(
        "invalid-query",
        `${field.name} between filter values cannot be null`
      )
    }
    params.push(sqlFieldValue(field, lower), sqlFieldValue(field, upper))
    return `COALESCE(${column} >= ? AND ${column} <= ?, 0)`
  }

  if (
    rule.operator === "is-any-of" ||
    rule.operator === "is-all-of" ||
    rule.operator === "is-none-of"
  ) {
    const values = Array.isArray(rule.value) ? rule.value : []
    if (values.length === 0) return rule.operator === "is-any-of" ? "0" : "1"
    if (
      field.storageCodec === "relation" ||
      field.storageCodec === "json_array"
    ) {
      const expressions = values.map((entry) => {
        params.push(sqlValue(entry))
        const typePredicate =
          typeof entry === "boolean"
            ? `type = '${entry ? "true" : "false"}'`
            : typeof entry === "number"
              ? "type IN ('integer', 'real')"
              : entry === null
                ? "type = 'null'"
                : "type = 'text'"
        return `EXISTS (
          SELECT 1
            FROM json_each(
              CASE
                WHEN json_valid(${column}) AND json_type(${column}) = 'array'
                  THEN ${column}
                ELSE '[]'
              END
            )
           WHERE ${typePredicate} AND value IS ?
        )`
      })
      const expression = `(${expressions.join(
        rule.operator === "is-all-of" ? " AND " : " OR "
      )})`
      return rule.operator === "is-none-of" ? `NOT (${expression})` : expression
    }
    params.push(...values.map((entry) => sqlFieldValue(field, entry)))
    if (rule.operator === "is-all-of") return "0"
    const expression = `COALESCE(${column} IN (${values.map(() => "?").join(", ")}), 0)`
    return rule.operator === "is-none-of" ? `NOT (${expression})` : expression
  }

  const value = Array.isArray(rule.value) ? rule.value[0] : rule.value
  if (value !== null && typeof value === "object") {
    throw new EidosFileError(
      "invalid-query",
      `${field.name} filter has an invalid structured operand`
    )
  }
  if (rule.operator === "equals" || rule.operator === "not-equals") {
    if (arrayCodec && Array.isArray(rule.value)) {
      params.push(canonicalizeEidosFileJson(rule.value))
      return rule.operator === "not-equals"
        ? `${column} IS NOT ?`
        : `${column} IS ?`
    }
    if (value === null || value === undefined) {
      return `${column} IS ${rule.operator === "not-equals" ? "NOT " : ""}NULL`
    }
    params.push(sqlFieldValue(field, value))
    return rule.operator === "not-equals"
      ? `${column} IS NOT ?`
      : `${column} IS ?`
  }

  if (
    rule.operator === "contains" ||
    rule.operator === "not-contains" ||
    rule.operator === "starts-with" ||
    rule.operator === "ends-with"
  ) {
    return likeExpression(field, rule.operator, String(value ?? ""), params)
  }

  if (value === null || value === undefined) return "0"
  const comparisons: Partial<Record<EidosFileFilterOperator, string>> = {
    "greater-than": ">",
    "greater-than-or-equal": ">=",
    "less-than": "<",
    "less-than-or-equal": "<=",
  }
  const comparison = comparisons[rule.operator]
  if (!comparison) return "0"
  params.push(sqlFieldValue(field, value))
  return `COALESCE(${column} ${comparison} ?, 0)`
}

function compileGroup(
  group: EidosFileFilterGroup,
  fields: Map<string, EidosFileFieldInfo>,
  params: EidosFileSqlPrimitive[],
  referenceInstant: string
): string {
  const children = group.children.map((child) =>
    child.type === "group"
      ? compileGroup(child, fields, params, referenceInstant)
      : compileRule(child, fields, params, referenceInstant)
  )
  const expression =
    children.length === 0
      ? group.conjunction === "or"
        ? "0"
        : "1"
      : `(${children.join(group.conjunction === "or" ? " OR " : " AND ")})`
  return group.negated ? `NOT (${expression})` : expression
}

export function eidosFileSortExpression(field: EidosFileFieldInfo): string {
  if (!eidosFileFieldQueryCapabilities(field).sortable) {
    throw new EidosFileError(
      "invalid-query",
      `${field.name} does not support sorting`
    )
  }
  return quoteIdentifier(field.tableColumnName)
}

function compileSorts(
  sorts: EidosFileSort[] | undefined,
  fields: Map<string, EidosFileFieldInfo>
): string {
  const seen = new Set<string>()
  const clauses: string[] = []
  const uniqueSorts = (sorts ?? []).filter((sort) => {
    if (seen.has(sort.field)) return false
    seen.add(sort.field)
    return true
  })
  for (const [index, sort] of uniqueSorts.entries()) {
    const field = requireField(fields, sort.field)
    const capabilities = eidosFileFieldQueryCapabilities(field)
    if (
      !capabilities.sortable ||
      (capabilities.sortPosition === "last" && index < uniqueSorts.length - 1)
    ) {
      throw new EidosFileError(
        "invalid-query",
        `${field.name} does not support this sort position`
      )
    }
    const expression = eidosFileSortExpression(field)
    clauses.push(
      `${expression} ${
        sort.direction === "desc" ? "DESC" : "ASC"
      } NULLS ${sort.nulls === "first" ? "FIRST" : "LAST"}`
    )
  }
  clauses.push('"__base_rowid" ASC')
  return `ORDER BY ${clauses.join(", ")}`
}

export function compileEidosFileRowQuery(
  fields: EidosFileFieldInfo[],
  query: EidosFileRowQuery = {},
  context: { referenceInstant?: string } = {}
): CompiledEidosFileRowQuery {
  query = normalizeEidosFileRowQuery(query)
  const byColumn = new Map(
    fields.map((field) => [field.tableColumnName, field])
  )
  const params: EidosFileSqlPrimitive[] = []
  const where: string[] = []
  const search = query.search
  if (search !== undefined && search !== "") {
    const pattern = `%${escapeLike(search)}%`
    const searchClauses = eidosFileRowQuerySearchFields(fields, query).map(
      (field) => searchExpression(field, pattern, search, params)
    )
    if (searchClauses.length > 0) where.push(`(${searchClauses.join(" OR ")})`)
  }
  if (query.filter) {
    where.push(
      compileGroup(
        query.filter,
        byColumn,
        params,
        context.referenceInstant ?? currentEidosFileInstant()
      )
    )
  }
  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    orderSql: compileSorts(query.sorts, byColumn),
    params,
  }
}
