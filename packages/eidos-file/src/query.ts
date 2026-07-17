import type { EidosFileSqlParams, EidosFileSqlPrimitive } from "./connection"
import { EidosFileError } from "./errors"
import { quoteIdentifier } from "./identifiers"
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
  "is-none-of",
])

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
  if (depth > 8 || typeof value !== "object" || value === null) return null
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
    children: candidate.children.slice(0, 100).flatMap((child) => {
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
  return value.slice(0, 32).flatMap((entry) => {
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
      },
    ]
  })
}

export function normalizeEidosFileRowQuery(value: unknown): EidosFileRowQuery {
  if (typeof value !== "object" || value === null) return {}
  const candidate = value as Record<string, unknown>
  return {
    ...(typeof candidate.search === "string"
      ? { search: candidate.search.slice(0, 1_000) }
      : {}),
    filter: normalizeEidosFileFilter(candidate.filter),
    sorts: normalizeEidosFileSorts(candidate.sorts),
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&")
}

function searchableFields(fields: EidosFileFieldInfo[]): EidosFileFieldInfo[] {
  return fields.filter(
    (field) =>
      !field.isHidden &&
      (field.tableColumnName === "title" ||
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
  if (normalized.search?.trim()) {
    for (const field of searchableFields(fields)) {
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
          WHERE COALESCE(CAST(value AS TEXT), '') LIKE ? ESCAPE '\\' COLLATE NOCASE
       )`
    : `COALESCE(CAST(${column} AS TEXT), '') LIKE ? ESCAPE '\\' COLLATE NOCASE`
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
    ? `(${column} IS NULL OR CAST(${column} AS TEXT) = '' OR (json_valid(${column}) AND json_type(${column}) = 'array' AND json_array_length(${column}) = 0))`
    : `(${column} IS NULL OR CAST(${column} AS TEXT) = '')`

  if (rule.operator === "is-empty") {
    return empty
  }
  if (rule.operator === "is-not-empty") {
    return `NOT ${empty}`
  }

  if (rule.operator === "is-any-of" || rule.operator === "is-none-of") {
    const values = Array.isArray(rule.value) ? rule.value : []
    if (values.length === 0) return rule.operator === "is-any-of" ? "0" : "1"
    if (
      field.storageCodec === "relation" ||
      field.storageCodec === "json_array"
    ) {
      const expressions = values.map((entry) => {
        params.push(sqlValue(entry))
        return `EXISTS (
          SELECT 1
            FROM json_each(
              CASE
                WHEN json_valid(${column}) AND json_type(${column}) = 'array'
                  THEN ${column}
                ELSE '[]'
              END
            )
           WHERE CAST(value AS TEXT) = CAST(? AS TEXT)
        )`
      })
      const expression = `(${expressions.join(" OR ")})`
      return rule.operator === "is-none-of" ? `NOT (${expression})` : expression
    }
    params.push(...values.map(sqlValue))
    const expression = `${column} IN (${values.map(() => "?").join(", ")})`
    return rule.operator === "is-none-of"
      ? `(${column} IS NULL OR NOT (${expression}))`
      : expression
  }

  const value = Array.isArray(rule.value) ? rule.value[0] : rule.value
  if (rule.operator === "equals" || rule.operator === "not-equals") {
    if (value === null || value === undefined) {
      return `${column} IS ${rule.operator === "not-equals" ? "NOT " : ""}NULL`
    }
    params.push(sqlValue(value))
    return rule.operator === "not-equals"
      ? `(${column} IS NULL OR ${column} <> ?)`
      : `${column} = ?`
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
  params.push(sqlValue(value))
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
  if (children.length === 0) return "1"
  return `(${children.join(group.conjunction === "or" ? " OR " : " AND ")})`
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
    const column = quoteIdentifier(field.tableColumnName)
    const expression =
      field.storageCodec === "json_array" || field.storageCodec === "relation"
        ? `json_extract(${column}, '$[0]')`
        : column
    const displayType =
      (field.type === "formula" || field.type === "lookup") &&
      typeof field.property?.displayType === "string"
        ? field.property.displayType
        : field.type
    const textLike = new Set([
      "title",
      "text",
      "url",
      "select",
      "multi-select",
      "file",
    ]).has(displayType)
    clauses.push(
      `${expression}${textLike ? " COLLATE NOCASE" : ""} ${
        sort.direction === "desc" ? "DESC" : "ASC"
      }`
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
  const search = query.search?.trim()
  if (search) {
    const pattern = `%${escapeLike(search)}%`
    const searchClauses = searchableFields(fields).map((field) => {
      params.push(pattern)
      return `COALESCE(CAST(${quoteIdentifier(field.tableColumnName)} AS TEXT), '') LIKE ? ESCAPE '\\' COLLATE NOCASE`
    })
    if (searchClauses.length > 0) where.push(`(${searchClauses.join(" OR ")})`)
  }
  if (query.filter) where.push(compileGroup(query.filter, byColumn, params))
  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    orderSql: compileSorts(query.sorts, byColumn),
    params,
  }
}
