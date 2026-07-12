import type { BaseSqlParams, BaseSqlPrimitive } from "./connection"
import { BaseError } from "./errors"
import { quoteIdentifier } from "./identifiers"
import type {
  BaseFieldInfo,
  BaseFilterGroup,
  BaseFilterRule,
  BaseFilterValue,
  BaseRowQuery,
  BaseSort,
} from "./types"

const FILTER_OPERATORS = new Set<BaseFilterRule["operator"]>([
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

export interface CompiledBaseRowQuery {
  whereSql: string
  orderSql: string
  params: BaseSqlParams
}

function filterValue(value: unknown): BaseFilterValue | undefined {
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
): BaseFilterRule | BaseFilterGroup | null {
  if (depth > 8 || typeof value !== "object" || value === null) return null
  const candidate = value as Record<string, unknown>
  if (candidate.type === "rule") {
    if (
      typeof candidate.field !== "string" ||
      !FILTER_OPERATORS.has(candidate.operator as BaseFilterRule["operator"])
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
      operator: candidate.operator as BaseFilterRule["operator"],
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

export function normalizeBaseFilter(value: unknown): BaseFilterGroup | null {
  const normalized = normalizeFilterNode(value, 0)
  return normalized?.type === "group" ? normalized : null
}

export function removeBaseFilterField(
  group: BaseFilterGroup | null,
  field: string
): BaseFilterGroup | null {
  if (!group) return null
  const children: BaseFilterGroup["children"] = []
  for (const child of group.children) {
    if (child.type === "rule") {
      if (child.field !== field) children.push(child)
      continue
    }
    const nested = removeBaseFilterField(child, field)
    if (nested && nested.children.length > 0) children.push(nested)
  }
  return {
    ...group,
    children,
  }
}

export function normalizeBaseSorts(value: unknown): BaseSort[] {
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

export function normalizeBaseRowQuery(value: unknown): BaseRowQuery {
  if (typeof value !== "object" || value === null) return {}
  const candidate = value as Record<string, unknown>
  return {
    ...(typeof candidate.search === "string"
      ? { search: candidate.search.slice(0, 1_000) }
      : {}),
    filter: normalizeBaseFilter(candidate.filter),
    sorts: normalizeBaseSorts(candidate.sorts),
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&")
}

function searchableFields(fields: BaseFieldInfo[]): BaseFieldInfo[] {
  return fields.filter(
    (field) =>
      !field.isHidden &&
      (field.tableColumnName === "title" ||
        field.valueKind === "source" ||
        field.valueKind === "materialized" ||
        field.valueKind === "derived")
  )
}

function requireField(
  fields: Map<string, BaseFieldInfo>,
  columnName: string
): BaseFieldInfo {
  const field = fields.get(columnName)
  if (!field) {
    throw new BaseError(
      "field-not-found",
      `Base field not found: ${columnName}`
    )
  }
  return field
}

function sqlValue(value: BaseFilterValue): BaseSqlPrimitive {
  return typeof value === "boolean" ? (value ? 1 : 0) : value
}

function likeExpression(
  field: BaseFieldInfo,
  operator: BaseFilterRule["operator"],
  value: string,
  params: BaseSqlPrimitive[]
): string {
  const column = quoteIdentifier(field.tableColumnName)
  const escaped = escapeLike(value)
  const pattern =
    operator === "starts-with"
      ? `${escaped}%`
      : operator === "ends-with"
        ? `%${escaped}`
        : field.storageCodec === "csv_ids"
          ? `%,${escaped},%`
          : `%${escaped}%`
  const expression =
    field.storageCodec === "csv_ids"
      ? `(',' || COALESCE(CAST(${column} AS TEXT), '') || ',') LIKE ? ESCAPE '\\' COLLATE NOCASE`
      : `COALESCE(CAST(${column} AS TEXT), '') LIKE ? ESCAPE '\\' COLLATE NOCASE`
  params.push(pattern)
  return operator === "not-contains" ? `NOT (${expression})` : expression
}

function compileRule(
  rule: BaseFilterRule,
  fields: Map<string, BaseFieldInfo>,
  params: BaseSqlPrimitive[]
): string {
  const field = requireField(fields, rule.field)
  const column = quoteIdentifier(field.tableColumnName)

  if (rule.operator === "is-empty") {
    return `(${column} IS NULL OR CAST(${column} AS TEXT) = '')`
  }
  if (rule.operator === "is-not-empty") {
    return `(${column} IS NOT NULL AND CAST(${column} AS TEXT) <> '')`
  }

  if (rule.operator === "is-any-of" || rule.operator === "is-none-of") {
    const values = Array.isArray(rule.value) ? rule.value : []
    if (values.length === 0) return rule.operator === "is-any-of" ? "0" : "1"
    if (field.storageCodec === "csv_ids") {
      const expressions = values.map((entry) => {
        params.push(`%,${escapeLike(String(entry))},%`)
        return `(',' || COALESCE(CAST(${column} AS TEXT), '') || ',') LIKE ? ESCAPE '\\' COLLATE NOCASE`
      })
      const expression = `(${expressions.join(" OR ")})`
      return rule.operator === "is-none-of" ? `NOT (${expression})` : expression
    }
    if (
      field.storageCodec === "relation" ||
      field.storageCodec === "json_array"
    ) {
      const expressions = values.map((entry) => {
        params.push(sqlValue(entry), `%,${escapeLike(String(entry))},%`)
        return `(CASE
          WHEN json_valid(${column})
          THEN EXISTS (
            SELECT 1 FROM json_each(${column})
             WHERE CAST(value AS TEXT) = CAST(? AS TEXT)
          )
          ELSE (',' || COALESCE(CAST(${column} AS TEXT), '') || ',')
               LIKE ? ESCAPE '\\'
        END)`
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
  group: BaseFilterGroup,
  fields: Map<string, BaseFieldInfo>,
  params: BaseSqlPrimitive[]
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
  sorts: BaseSort[] | undefined,
  fields: Map<string, BaseFieldInfo>
): string {
  const seen = new Set<string>()
  const clauses: string[] = []
  for (const sort of sorts ?? []) {
    if (seen.has(sort.field)) continue
    const field = requireField(fields, sort.field)
    seen.add(sort.field)
    const column = quoteIdentifier(field.tableColumnName)
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
      `${column}${textLike ? " COLLATE NOCASE" : ""} ${
        sort.direction === "desc" ? "DESC" : "ASC"
      }`
    )
  }
  clauses.push('"__base_rowid" ASC')
  return `ORDER BY ${clauses.join(", ")}`
}

export function compileBaseRowQuery(
  fields: BaseFieldInfo[],
  query: BaseRowQuery = {}
): CompiledBaseRowQuery {
  query = normalizeBaseRowQuery(query)
  const byColumn = new Map(
    fields.map((field) => [field.tableColumnName, field])
  )
  const params: BaseSqlPrimitive[] = []
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
