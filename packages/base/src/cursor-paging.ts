import type { BaseSqlPrimitive } from "./connection"
import { BaseError } from "./errors"
import { quoteIdentifier } from "./identifiers"
import { normalizeBaseSorts } from "./query"
import type { BaseFieldInfo, BaseRow, BaseRowQuery } from "./types"

const BASE_ROWID_CURSOR_PREFIX = "rowid:"
const BASE_SORTED_CURSOR_PREFIX = "sort:"
const BASE_SORTED_CURSOR_VERSION = 1
const BASE_SORTED_CURSOR_MAX_LENGTH = 4_096
export const BASE_SORTED_CURSOR_MAX_FIELDS = 8

const BASE_NOCASE_SORT_TYPES = new Set([
  "title",
  "text",
  "url",
  "select",
  "multi-select",
  "file",
])

type BaseCursorValue = string | number | null

interface BaseSortedCursorPayload {
  version: typeof BASE_SORTED_CURSOR_VERSION
  query: string
  values: BaseCursorValue[]
  rowId: number
}

export interface BaseCursorSort {
  field: BaseFieldInfo
  direction: "asc" | "desc"
}

export interface BaseCursorPredicate {
  sql: string
  params: BaseSqlPrimitive[]
}

function invalidCursor(): never {
  throw new BaseError("invalid-query", "Invalid Base row page cursor")
}

function baseFieldUsesNoCaseSort(field: BaseFieldInfo): boolean {
  const displayType =
    (field.type === "formula" || field.type === "lookup") &&
    typeof field.property?.displayType === "string"
      ? field.property.displayType
      : field.type
  return BASE_NOCASE_SORT_TYPES.has(displayType)
}

function baseCursorValue(value: BaseRow[string]): BaseCursorValue | undefined {
  if (value === null) return null
  if (typeof value === "string") return value
  if (typeof value === "boolean") return value ? 1 : 0
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function baseCursorColumn(sort: BaseCursorSort): string {
  return `${quoteIdentifier(sort.field.tableColumnName)}${
    baseFieldUsesNoCaseSort(sort.field) ? " COLLATE NOCASE" : ""
  }`
}

function baseCursorEquality(
  sort: BaseCursorSort,
  value: BaseCursorValue
): BaseCursorPredicate {
  const column = baseCursorColumn(sort)
  return value === null
    ? { sql: `${column} IS NULL`, params: [] }
    : { sql: `${column} = ?`, params: [value] }
}

function baseCursorAfter(
  sort: BaseCursorSort,
  value: BaseCursorValue
): BaseCursorPredicate[] {
  const column = baseCursorColumn(sort)
  if (sort.direction === "asc") {
    return value === null
      ? [{ sql: `${column} IS NOT NULL`, params: [] }]
      : [{ sql: `${column} > ?`, params: [value] }]
  }
  if (value === null) return []
  return [
    { sql: `${column} < ?`, params: [value] },
    { sql: `${column} IS NULL`, params: [] },
  ]
}

function combineBaseCursorPredicates(
  predicates: BaseCursorPredicate[]
): BaseCursorPredicate {
  return {
    sql: predicates.map((predicate) => predicate.sql).join(" AND "),
    params: predicates.flatMap((predicate) => predicate.params),
  }
}

export function decodeBaseRowCursor(cursor: string): number {
  const rowId = cursor.startsWith(BASE_ROWID_CURSOR_PREFIX)
    ? cursor.slice(BASE_ROWID_CURSOR_PREFIX.length)
    : ""
  const parsed = /^-?\d{1,16}$/.test(rowId) ? Number(rowId) : Number.NaN
  return Number.isSafeInteger(parsed) ? parsed : invalidCursor()
}

export function encodeBaseRowCursor(rowId: unknown): string | undefined {
  const parsed =
    typeof rowId === "number"
      ? rowId
      : typeof rowId === "string" && /^-?\d{1,16}$/.test(rowId)
        ? Number(rowId)
        : Number.NaN
  return Number.isSafeInteger(parsed)
    ? `${BASE_ROWID_CURSOR_PREFIX}${String(parsed)}`
    : undefined
}

export function baseCursorQuerySignature(query: BaseRowQuery): string {
  const source = JSON.stringify(query)
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function baseCursorSorts(
  fields: BaseFieldInfo[],
  query: BaseRowQuery
): BaseCursorSort[] {
  const fieldsByColumn = new Map(
    fields.map((field) => [field.tableColumnName, field])
  )
  const seen = new Set<string>()
  return normalizeBaseSorts(query.sorts).flatMap((sort) => {
    if (seen.has(sort.field)) return []
    const field = fieldsByColumn.get(sort.field)
    if (!field) {
      throw new BaseError(
        "field-not-found",
        `Base field not found: ${sort.field}`
      )
    }
    seen.add(sort.field)
    return [{ field, direction: sort.direction }]
  })
}

export function encodeBaseSortedCursor(
  row: BaseRow | undefined,
  sorts: BaseCursorSort[],
  querySignature: string
): string | undefined {
  if (!row) return undefined
  const rowId = baseCursorValue(row.__base_rowid)
  if (typeof rowId !== "number" || !Number.isSafeInteger(rowId)) {
    return undefined
  }
  const values: BaseCursorValue[] = []
  for (const sort of sorts) {
    const value = baseCursorValue(row[sort.field.tableColumnName])
    if (value === undefined) return undefined
    values.push(value)
  }
  const cursor = `${BASE_SORTED_CURSOR_PREFIX}${JSON.stringify({
    version: BASE_SORTED_CURSOR_VERSION,
    query: querySignature,
    values,
    rowId,
  } satisfies BaseSortedCursorPayload)}`
  return cursor.length <= BASE_SORTED_CURSOR_MAX_LENGTH ? cursor : undefined
}

export function decodeBaseSortedCursor(
  cursor: string,
  expectedQuerySignature: string,
  expectedValueCount: number
): BaseSortedCursorPayload {
  if (
    !cursor.startsWith(BASE_SORTED_CURSOR_PREFIX) ||
    cursor.length > BASE_SORTED_CURSOR_MAX_LENGTH
  ) {
    return invalidCursor()
  }
  let value: unknown
  try {
    value = JSON.parse(cursor.slice(BASE_SORTED_CURSOR_PREFIX.length))
  } catch {
    return invalidCursor()
  }
  if (typeof value !== "object" || value === null) return invalidCursor()
  const payload = value as Partial<BaseSortedCursorPayload>
  if (
    payload.version !== BASE_SORTED_CURSOR_VERSION ||
    payload.query !== expectedQuerySignature ||
    !Array.isArray(payload.values) ||
    payload.values.length !== expectedValueCount ||
    !payload.values.every(
      (entry) =>
        entry === null ||
        typeof entry === "string" ||
        (typeof entry === "number" && Number.isFinite(entry))
    ) ||
    typeof payload.rowId !== "number" ||
    !Number.isSafeInteger(payload.rowId)
  ) {
    return invalidCursor()
  }
  return payload as BaseSortedCursorPayload
}

export function baseSortedCursorBranches(
  sorts: BaseCursorSort[],
  cursor: BaseSortedCursorPayload
): BaseCursorPredicate[] {
  const equalities = sorts.map((sort, index) =>
    baseCursorEquality(sort, cursor.values[index] ?? null)
  )
  const branches: BaseCursorPredicate[] = [
    combineBaseCursorPredicates([
      ...equalities,
      { sql: '"__base_rowid" > ?', params: [cursor.rowId] },
    ]),
  ]
  for (let index = sorts.length - 1; index >= 0; index -= 1) {
    const prefix = equalities.slice(0, index)
    for (const after of baseCursorAfter(
      sorts[index],
      cursor.values[index] ?? null
    )) {
      branches.push(combineBaseCursorPredicates([...prefix, after]))
    }
  }
  return branches
}

export function appendBaseCursorWhere(
  whereSql: string,
  predicate: string
): string {
  return `${whereSql}${whereSql ? " AND " : "WHERE "}${predicate}`
}
