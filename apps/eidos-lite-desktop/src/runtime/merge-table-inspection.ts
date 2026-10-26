import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
  validateEidosFile,
  EIDOS_SYSTEM_METADATA_TABLES,
} from "@eidos.space/eidos-file"
import {
  hasSqliteHeader,
  NodeSqliteEidosFileConnection,
} from "@eidos.space/eidos-file/node-sqlite"
import { loadDeclaredVTabExtensions } from "./eidos-file-runtime"

/** Discover policy identifiers through the canonical format validator, without
 * starting an editor Runtime or reading its initial row pages. */
export function inspectEidosMergeTables(filePaths: readonly string[]): string[]
export function inspectEidosMergeTables(
  filePaths: readonly string[],
  includeColumns: true
): Record<string, string[]>
export function inspectEidosMergeTables(
  filePaths: readonly string[],
  includeColumns = false
): string[] | Record<string, string[]> {
  if (includeColumns && filePaths.length !== 1)
    throw new Error("Column inspection requires exactly one file")
  const names = new Set<string>()
  const columns: Record<string, string[]> = Object.create(null)
  for (const filePath of filePaths) {
    if (
      !path.isAbsolute(filePath) ||
      path.extname(filePath).toLowerCase() !== ".eidos"
    )
      throw new Error(
        "Merge table inspection requires absolute Eidos File paths"
      )
    if (!hasSqliteHeader(filePath))
      throw new Error("Invalid Eidos File: Not a SQLite file")
    const connection = new NodeSqliteEidosFileConnection(
      new DatabaseSync(filePath, {
        readOnly: true,
        allowExtension: true,
        defensive: true,
        enableDoubleQuotedStringLiterals: false,
        enableForeignKeyConstraints: true,
        timeout: 5_000,
      })
    )
    try {
      loadDeclaredVTabExtensions(connection.database)
      const inspected = connection.transaction(() =>
        validateEidosFile(connection, { level: "structural" })
      )
      if (!inspected.valid)
        throw new Error(
          `Invalid Eidos File: ${inspected.errors.map((issue) => issue.message).join("; ")}`
        )
      for (const table of inspected.tables)
        names.add(table.physicalName ?? table.rawTableName)
      if (includeColumns) {
        for (const name of [...EIDOS_SYSTEM_METADATA_TABLES, ...names]) {
          columns[name] = connection
            .query<{ name: string }>(
              "SELECT name FROM pragma_table_info(?) ORDER BY cid",
              [name]
            )
            .map((column) => column.name)
        }
      }
    } finally {
      connection.close()
    }
  }
  return includeColumns ? columns : [...names]
}
