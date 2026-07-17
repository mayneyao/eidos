import type { EidosFileSqlPrimitive } from "./connection"
import { EidosFileError } from "./errors"
import { quoteIdentifier } from "./identifiers"
import { normalizeEidosFileSorts } from "./query"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowQuery,
} from "./types"

const EIDOS_FILE_ROWID_CURSOR_PREFIX = "rowid:"
const EIDOS_FILE_SORTED_CURSOR_PREFIX = "sort:"
const EIDOS_FILE_SORTED_CURSOR_VERSION = 1
const EIDOS_FILE_SORTED_CURSOR_MAX_LENGTH = 4_096
export const EIDOS_FILE_SORTED_CURSOR_MAX_FIELDS = 8

const EIDOS_FILE_NOCASE_SORT_TYPES = new Set([
  "title",
  "text",
  "url",
  "select",
  "multi-select",
  "file",
])

type EidosFileCursorValue = string | number | null

interface EidosFileSortedCursorPayload {
  version: typeof EIDOS_FILE_SORTED_CURSOR_VERSION
  query: string
  values: EidosFileCursorValue[]
  rowId: number
}

export interface EidosFileCursorSort {
  field: EidosFileFieldInfo
  direction: "asc" | "desc"
}

export interface EidosFileCursorPredicate {
  sql: string
  params: EidosFileSqlPrimitive[]
}

function invalidCursor(): never {
  throw new EidosFileError(
    "invalid-query",
    "Invalid Eidos File row page cursor"
  )
}

function eidosFileFieldUsesNoCaseSort(field: EidosFileFieldInfo): boolean {
  const displayType =
    (field.type === "formula" || field.type === "lookup") &&
    typeof field.property?.displayType === "string"
      ? field.property.displayType
      : field.type
  return EIDOS_FILE_NOCASE_SORT_TYPES.has(displayType)
}

function eidosFileCursorValue(
  value: EidosFileRow[string]
): EidosFileCursorValue | undefined {
  if (value === null) return null
  if (typeof value === "string") return value
  if (typeof value === "boolean") return value ? 1 : 0
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function eidosFileCursorColumn(sort: EidosFileCursorSort): string {
  return `${quoteIdentifier(sort.field.tableColumnName)}${
    eidosFileFieldUsesNoCaseSort(sort.field) ? " COLLATE NOCASE" : ""
  }`
}

function eidosFileCursorEquality(
  sort: EidosFileCursorSort,
  value: EidosFileCursorValue
): EidosFileCursorPredicate {
  const column = eidosFileCursorColumn(sort)
  return value === null
    ? { sql: `${column} IS NULL`, params: [] }
    : { sql: `${column} = ?`, params: [value] }
}

function eidosFileCursorAfter(
  sort: EidosFileCursorSort,
  value: EidosFileCursorValue
): EidosFileCursorPredicate[] {
  const column = eidosFileCursorColumn(sort)
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

function combineEidosFileCursorPredicates(
  predicates: EidosFileCursorPredicate[]
): EidosFileCursorPredicate {
  return {
    sql: predicates.map((predicate) => predicate.sql).join(" AND "),
    params: predicates.flatMap((predicate) => predicate.params),
  }
}

export function decodeEidosFileRowCursor(cursor: string): number {
  const rowId = cursor.startsWith(EIDOS_FILE_ROWID_CURSOR_PREFIX)
    ? cursor.slice(EIDOS_FILE_ROWID_CURSOR_PREFIX.length)
    : ""
  const parsed = /^-?\d{1,16}$/.test(rowId) ? Number(rowId) : Number.NaN
  return Number.isSafeInteger(parsed) ? parsed : invalidCursor()
}

export function encodeEidosFileRowCursor(rowId: unknown): string | undefined {
  const parsed =
    typeof rowId === "number"
      ? rowId
      : typeof rowId === "string" && /^-?\d{1,16}$/.test(rowId)
        ? Number(rowId)
        : Number.NaN
  return Number.isSafeInteger(parsed)
    ? `${EIDOS_FILE_ROWID_CURSOR_PREFIX}${String(parsed)}`
    : undefined
}

export function eidosFileCursorQuerySignature(
  query: EidosFileRowQuery
): string {
  const source = JSON.stringify(query)
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function eidosFileCursorSorts(
  fields: EidosFileFieldInfo[],
  query: EidosFileRowQuery
): EidosFileCursorSort[] {
  const fieldsByColumn = new Map(
    fields.map((field) => [field.tableColumnName, field])
  )
  const seen = new Set<string>()
  return normalizeEidosFileSorts(query.sorts).flatMap((sort) => {
    if (seen.has(sort.field)) return []
    const field = fieldsByColumn.get(sort.field)
    if (!field) {
      throw new EidosFileError(
        "field-not-found",
        `Eidos File field not found: ${sort.field}`
      )
    }
    seen.add(sort.field)
    return [{ field, direction: sort.direction }]
  })
}

export function encodeEidosFileSortedCursor(
  row: EidosFileRow | undefined,
  sorts: EidosFileCursorSort[],
  querySignature: string
): string | undefined {
  if (!row) return undefined
  const rowId = eidosFileCursorValue(row.__base_rowid)
  if (typeof rowId !== "number" || !Number.isSafeInteger(rowId)) {
    return undefined
  }
  const values: EidosFileCursorValue[] = []
  for (const sort of sorts) {
    const value = eidosFileCursorValue(row[sort.field.tableColumnName])
    if (value === undefined) return undefined
    values.push(value)
  }
  const cursor = `${EIDOS_FILE_SORTED_CURSOR_PREFIX}${JSON.stringify({
    version: EIDOS_FILE_SORTED_CURSOR_VERSION,
    query: querySignature,
    values,
    rowId,
  } satisfies EidosFileSortedCursorPayload)}`
  return cursor.length <= EIDOS_FILE_SORTED_CURSOR_MAX_LENGTH
    ? cursor
    : undefined
}

export function decodeEidosFileSortedCursor(
  cursor: string,
  expectedQuerySignature: string,
  expectedValueCount: number
): EidosFileSortedCursorPayload {
  if (
    !cursor.startsWith(EIDOS_FILE_SORTED_CURSOR_PREFIX) ||
    cursor.length > EIDOS_FILE_SORTED_CURSOR_MAX_LENGTH
  ) {
    return invalidCursor()
  }
  let value: unknown
  try {
    value = JSON.parse(cursor.slice(EIDOS_FILE_SORTED_CURSOR_PREFIX.length))
  } catch {
    return invalidCursor()
  }
  if (typeof value !== "object" || value === null) return invalidCursor()
  const payload = value as Partial<EidosFileSortedCursorPayload>
  if (
    payload.version !== EIDOS_FILE_SORTED_CURSOR_VERSION ||
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
  return payload as EidosFileSortedCursorPayload
}

export function eidosFileSortedCursorBranches(
  sorts: EidosFileCursorSort[],
  cursor: EidosFileSortedCursorPayload
): EidosFileCursorPredicate[] {
  const equalities = sorts.map((sort, index) =>
    eidosFileCursorEquality(sort, cursor.values[index] ?? null)
  )
  const branches: EidosFileCursorPredicate[] = [
    combineEidosFileCursorPredicates([
      ...equalities,
      { sql: '"__base_rowid" > ?', params: [cursor.rowId] },
    ]),
  ]
  for (let index = sorts.length - 1; index >= 0; index -= 1) {
    const prefix = equalities.slice(0, index)
    for (const after of eidosFileCursorAfter(
      sorts[index],
      cursor.values[index] ?? null
    )) {
      branches.push(combineEidosFileCursorPredicates([...prefix, after]))
    }
  }
  return branches
}

export function appendEidosFileCursorWhere(
  whereSql: string,
  predicate: string
): string {
  return `${whereSql}${whereSql ? " AND " : "WHERE "}${predicate}`
}
