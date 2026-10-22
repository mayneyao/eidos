import type { DatabaseSync } from "node:sqlite"
import { NodeSqliteConnectionPort } from "@eidos.space/eidos-file/node-sqlite"
import {
  canonicalizeEidosFileJson,
  decodeEidosFileValues,
  type QueryResult,
  type SqlValue,
} from "@eidos.space/eidos-file"

/** Adapt the native catalog's database-relative URIs to its Space asset root.
 * Only fs_meta's system File column is adapted. Ordinary File values continue
 * through the canonical Runtime's unchanged containment validation.
 */
export class SpaceMetadataConnectionPort extends NodeSqliteConnectionPort {
  private readonly fileColumns: Set<string>

  constructor(database: DatabaseSync, readOnly: boolean) {
    super(database, { readOnly })
    this.fileColumns = new Set(
      (
        database
          .prepare(`
      SELECT t.physical_name AS table_name, f.physical_name AS column_name
      FROM eidos__tables t JOIN eidos__fields f ON f.table_id = t.id
      WHERE json_extract(t.settings_json, '$.vtabModule') = 'fs_meta'
        AND json_extract(t.settings_json, '$.vtabConfig.root') = '..'
        AND f.type = 'file' AND json_extract(f.settings_json, '$.isSystem') = 1
    `)
          .all() as Array<{ table_name: string; column_name: string }>
      ).map((field) => `${field.table_name}\0${field.column_name}`)
    )
  }

  private adapt(sql: string, result: QueryResult): QueryResult {
    const origins = this.database.prepare(sql).columns()
    const indexes = origins.flatMap((column, index) =>
      column.database === "main" &&
      this.fileColumns.has(`${column.table}\0${column.column}`)
        ? [index]
        : []
    )
    for (const row of result.rows)
      for (const index of indexes) {
        const cell = row[index]
        if (cell?.tag !== "text") continue
        const entries: unknown = JSON.parse(cell.value)
        if (!Array.isArray(entries))
          throw new Error("Invalid native metadata File value")
        const mapped = entries.map((entry: unknown) => {
          if (
            !entry ||
            typeof entry !== "object" ||
            !("uri" in entry) ||
            typeof entry.uri !== "string" ||
            !entry.uri.startsWith("../")
          )
            throw new Error("Invalid native metadata attachment path")
          return { ...entry, uri: entry.uri.slice(3) }
        })
        const encoded = canonicalizeEidosFileJson(mapped)
        decodeEidosFileValues(encoded)
        row[index] = { tag: "text", value: encoded }
      }
    return result
  }

  override query(sql: string, bindings: readonly SqlValue[] = []): QueryResult {
    return this.adapt(sql, super.query(sql, bindings))
  }

  override get(sql: string, bindings: readonly SqlValue[] = []) {
    const result = super.get(sql, bindings)
    if (result.row)
      this.adapt(sql, { columns: result.columns, rows: [result.row] })
    return result
  }
}
