import type {
  ColumnSchema,
  DatabaseSnapshot,
  ForeignKeySchema,
  IndexColumn,
  IndexSchema,
  RelationDetails,
  RelationPage,
  RelationSummary,
} from "../types"
import {
  chooseRowidAlias,
  quoteIdentifier,
  stableRelationOrder,
} from "./identifier"
import { decodeViewerCell, encodedColumnExpression } from "./value-mapping"

export type SQLiteBindValue = null | string | number | bigint | Uint8Array

export interface SQLiteReadonlyDatabase {
  selectArrays(sql: string, bind?: readonly SQLiteBindValue[]): unknown[][]
  selectObjects(
    sql: string,
    bind?: readonly SQLiteBindValue[]
  ): Record<string, unknown>[]
  selectValue(sql: string, bind?: readonly SQLiteBindValue[]): unknown
}

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "")
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value)
}

function integer(value: unknown): number {
  if (typeof value === "bigint") {
    const converted = Number(value)
    if (!Number.isSafeInteger(converted)) {
      throw new Error(
        "SQLite returned an integer larger than this browser can display"
      )
    }
    return converted
  }
  const converted = Number(value)
  return Number.isFinite(converted) ? Math.trunc(converted) : 0
}

function rowCount(value: unknown): number {
  const count = integer(value)
  if (count < 0 || !Number.isSafeInteger(count)) {
    throw new Error("SQLite returned an unsupported row count")
  }
  return count
}

function isWithoutRowid(sql: unknown): boolean {
  return typeof sql === "string" && /\bWITHOUT\s+ROWID\b/i.test(sql)
}

export function introspectDatabase(
  database: SQLiteReadonlyDatabase,
  fileName: string,
  fileBytes: number
): DatabaseSnapshot {
  const relations = database
    .selectObjects(
      `SELECT type, name, rootpage, sql
       FROM sqlite_schema
       WHERE type IN ('table', 'view')
         AND substr(name, 1, 7) <> 'sqlite_'
       ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name COLLATE NOCASE, name`
    )
    .map<RelationSummary>((row) => ({
      kind: text(row.type) === "view" ? "view" : "table",
      name: text(row.name),
      rootPage: integer(row.rootpage),
      sql: nullableText(row.sql),
      withoutRowid: isWithoutRowid(row.sql),
    }))

  return {
    fileName,
    readOnly: true,
    relations,
    overview: {
      applicationId: integer(database.selectValue("PRAGMA application_id")),
      encoding: text(database.selectValue("PRAGMA encoding")) || "Unknown",
      fileBytes,
      freePages: integer(database.selectValue("PRAGMA freelist_count")),
      pageCount: integer(database.selectValue("PRAGMA page_count")),
      pageSize: integer(database.selectValue("PRAGMA page_size")),
      schemaVersion: integer(database.selectValue("PRAGMA schema_version")),
      tableCount: relations.filter((relation) => relation.kind === "table")
        .length,
      userVersion: integer(database.selectValue("PRAGMA user_version")),
      viewCount: relations.filter((relation) => relation.kind === "view")
        .length,
    },
  }
}

export function introspectRelation(
  database: SQLiteReadonlyDatabase,
  relation: RelationSummary
): RelationDetails {
  const columns = database
    .selectObjects(
      `SELECT cid, name, type, "notnull", dflt_value, pk, hidden
       FROM pragma_table_xinfo(?)
       ORDER BY cid`,
      [relation.name]
    )
    .map<ColumnSchema>((row) => ({
      cid: integer(row.cid),
      declaredType: text(row.type),
      defaultValue: nullableText(row.dflt_value),
      hidden: Math.min(3, Math.max(0, integer(row.hidden))) as 0 | 1 | 2 | 3,
      name: text(row.name),
      notNull: integer(row.notnull) === 1,
      primaryKeyOrder: integer(row.pk),
    }))

  const indexes = database
    .selectObjects(
      `SELECT name, "unique", origin, partial
       FROM pragma_index_list(?)
       ORDER BY seq`,
      [relation.name]
    )
    .map<IndexSchema>((row) => {
      const name = text(row.name)
      const columns = database
        .selectObjects(
          `SELECT seqno, name, desc, key
           FROM pragma_index_xinfo(?)
           ORDER BY seqno`,
          [name]
        )
        .map<IndexColumn>((column) => ({
          name: nullableText(column.name),
          order: integer(column.seqno),
          descending: integer(column.desc) === 1,
          key: integer(column.key) === 1,
        }))
      return {
        columns,
        name,
        origin: text(row.origin),
        partial: integer(row.partial) === 1,
        unique: integer(row.unique) === 1,
      }
    })

  const foreignKeys = database
    .selectObjects(
      `SELECT id, seq, "table", "from", "to", on_update, on_delete, "match"
       FROM pragma_foreign_key_list(?)
       ORDER BY id, seq`,
      [relation.name]
    )
    .map<ForeignKeySchema>((row) => ({
      from: text(row.from),
      id: integer(row.id),
      match: text(row.match),
      onDelete: text(row.on_delete),
      onUpdate: text(row.on_update),
      sequence: integer(row.seq),
      table: text(row.table),
      to: nullableText(row.to),
    }))

  const rowidAlias = chooseRowidAlias(
    columns,
    relation.kind,
    relation.withoutRowid
  )
  const order = stableRelationOrder(columns, rowidAlias)
  return {
    columns,
    foreignKeys,
    indexes,
    relation,
    rowCount: rowCount(
      database.selectValue(
        `SELECT count(*) FROM ${quoteIdentifier(relation.name)}`
      )
    ),
    rowidAlias,
    stableOrder: order.label,
  }
}

export function buildRelationPageQuery(
  details: RelationDetails,
  offset: number,
  limit: number
): { bind: [number, number]; sql: string } {
  const visibleColumns = details.columns.filter((column) => column.hidden !== 1)
  const selected = [
    ...(details.rowidAlias ? [details.rowidAlias] : []),
    ...visibleColumns.map((column) => column.name),
  ]
  const expressions = selected.map(encodedColumnExpression)
  if (expressions.length === 0) expressions.push("'n:'")
  const order = stableRelationOrder(details.columns, details.rowidAlias)
  return {
    sql: `SELECT ${expressions.join(", ")}
          FROM ${quoteIdentifier(details.relation.name)}
          ORDER BY ${order.sql}
          LIMIT ? OFFSET ?`,
    bind: [limit, offset],
  }
}

export function readRelationPage(
  database: SQLiteReadonlyDatabase,
  details: RelationDetails,
  offset: number,
  limit: number
): RelationPage {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Page offset is invalid")
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Page size must be between 1 and 500 rows")
  }
  const query = buildRelationPageQuery(details, offset, limit)
  return {
    offset,
    rows: database
      .selectArrays(query.sql, query.bind)
      .map((row) => row.map(decodeViewerCell)),
  }
}
