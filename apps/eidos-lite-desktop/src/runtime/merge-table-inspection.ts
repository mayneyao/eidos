import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { validateEidosFile } from "@eidos.space/eidos-file"
import {
  hasSqliteHeader,
  NodeSqliteEidosFileConnection,
} from "@eidos.space/eidos-file/node-sqlite"
import { loadDeclaredVTabExtensions } from "./eidos-file-runtime"

/** Discover policy identifiers through the canonical format validator, without
 * starting an editor Runtime or reading its initial row pages. */
export function inspectEidosMergeTables(
  filePaths: readonly string[]
): string[] {
  const names = new Set<string>()
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
    } finally {
      connection.close()
    }
  }
  return [...names]
}
