import type { EidosFileSqlParams, EidosFileSqlPrimitive } from "./connection"
import { EidosFileError } from "./errors"
import { quoteIdentifier } from "./identifiers"
import { normalizeEidosFileDate, normalizeEidosFileInstant } from "./temporal"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
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
])

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
      !FILTER_OPERATORS.has(filter.operator as EidosFileFilterRule["operator"])
    ) {
      throw new EidosFileError("invalid-query", "Invalid filter rule")
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
      !FILTER_OPERATORS.has(
        candidate.operator as EidosFileFilterRule["operator"]
      )
    ) {
      return null
    }
    const values = Array.isArray(candidate.value)
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

function searchableFields(
  fields: EidosFileFieldInfo[],
  selected?: readonly string[]
): EidosFileFieldInfo[] {
  const selection = selected ? new Set(selected) : null
  return fields.filter(
    (field) =>
      (!selection || (!!field.id && selection.has(field.id))) &&
      !field.isHidden &&
      (field.isRecordLabel ||
        field.valueKind === "source" ||
        field.valueKind === "materialized" ||
        field.valueKind === "derived")
  )
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
          WHERE eidos_casefold(COALESCE(CAST(value AS TEXT), ''))
                LIKE eidos_casefold(?) ESCAPE '\\'
       )`
    : `eidos_casefold(COALESCE(CAST(${column} AS TEXT), ''))
         LIKE eidos_casefold(?) ESCAPE '\\'`
  params.push(pattern)
  return operator === "not-contains" ? `NOT (${expression})` : expression
}

function compileRule(
  rule: EidosFileFilterRule,
  fields: Map<string, EidosFileFieldInfo>,
  params: EidosFileSqlPrimitive[]
): string {
  const field = requireField(fields, rule.field)
  const column = quoteIdentifier(field.tableColumnName)
  const arrayCodec =
    field.storageCodec === "json_array" || field.storageCodec === "relation"
  const empty = arrayCodec
    ? `(json_valid(${column}) AND json_type(${column}) = 'array' AND json_array_length(${column}) = 0)`
    : `(${column} IS NULL)`

  if (rule.operator === "is-empty") {
    return empty
  }
  if (rule.operator === "is-not-empty") {
    return `NOT ${empty}`
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
    const expression = `${column} IN (${values.map(() => "?").join(", ")})`
    return rule.operator === "is-none-of" ? `NOT (${expression})` : expression
  }

  const value = Array.isArray(rule.value) ? rule.value[0] : rule.value
  if (rule.operator === "equals" || rule.operator === "not-equals") {
    if (arrayCodec && Array.isArray(rule.value)) {
      params.push(JSON.stringify(rule.value.map(sqlValue)))
      return rule.operator === "not-equals" ? `${column} <> ?` : `${column} = ?`
    }
    if (value === null || value === undefined) {
      return `${column} IS ${rule.operator === "not-equals" ? "NOT " : ""}NULL`
    }
    params.push(sqlFieldValue(field, value))
    return rule.operator === "not-equals" ? `${column} <> ?` : `${column} = ?`
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
  const comparison = {
    "greater-than": ">",
    "greater-than-or-equal": ">=",
    "less-than": "<",
    "less-than-or-equal": "<=",
  }[rule.operator]
  if (!comparison) return "0"
  params.push(sqlFieldValue(field, value))
  return `${column} ${comparison} ?`
}

function compileGroup(
  group: EidosFileFilterGroup,
  fields: Map<string, EidosFileFieldInfo>,
  params: EidosFileSqlPrimitive[]
): string {
  const children = group.children.map((child) =>
    child.type === "group"
      ? compileGroup(child, fields, params)
      : compileRule(child, fields, params)
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
  const column = quoteIdentifier(field.tableColumnName)
  return field.storageCodec === "json_array" ||
    field.storageCodec === "relation"
    ? `(SELECT item.value FROM json_each(${column}) item
         WHERE item.value IS NOT NULL ORDER BY CAST(item.key AS INTEGER) LIMIT 1)`
    : column
}

function compileSorts(
  sorts: EidosFileSort[] | undefined,
  fields: Map<string, EidosFileFieldInfo>
): string {
  const seen = new Set<string>()
  const clauses: string[] = []
  for (const sort of sorts ?? []) {
    if (seen.has(sort.field)) continue
    const field = requireField(fields, sort.field)
    seen.add(sort.field)
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
  query: EidosFileRowQuery = {}
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
    const searchClauses = searchableFields(fields, query.searchFields).map(
      (field) => {
        params.push(pattern)
        return `eidos_casefold(COALESCE(CAST(${quoteIdentifier(field.tableColumnName)} AS TEXT), ''))
                LIKE eidos_casefold(?) ESCAPE '\\'`
      }
    )
    if (searchClauses.length > 0) where.push(`(${searchClauses.join(" OR ")})`)
  }
  if (query.filter) where.push(compileGroup(query.filter, byColumn, params))
  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    orderSql: compileSorts(query.sorts, byColumn),
    params,
  }
}
