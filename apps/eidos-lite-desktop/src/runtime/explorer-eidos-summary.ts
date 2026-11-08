import path from "node:path"
import { statSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { EidosFileRuntime, validateEidosFile } from "@eidos.space/eidos-file"
import {
  hasSqliteHeader,
  NodeSqliteEidosFileConnection,
} from "@eidos.space/eidos-file/node-sqlite"
import type { ExplorerEidosSummary } from "../shared/explorer-summary"
import { loadDeclaredVTabExtensions } from "./eidos-file-runtime"

/** Read canonical metadata and counts in a private worker, without editor sessions or row pages. */
export function inspectExplorerEidosSummary(
  filePath: string
): ExplorerEidosSummary {
  if (
    !path.isAbsolute(filePath) ||
    path.extname(filePath).toLowerCase() !== ".eidos" ||
    !hasSqliteHeader(filePath)
  )
    throw Error("Invalid Eidos File summary path")
  const connection = new NodeSqliteEidosFileConnection(
    new DatabaseSync(filePath, {
      readOnly: true,
      allowExtension: true,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 500,
    })
  )
  try {
    loadDeclaredVTabExtensions(connection.database)
    return connection.transaction(() => {
      const inspected = validateEidosFile(connection, { level: "structural" })
      if (!inspected.valid) throw Error("Invalid Eidos File")
      const runtime = new EidosFileRuntime(connection)
      const tables = runtime.listTables()
      const defaultId = runtime.info().defaultTableId
      const ordered = [...tables].sort(
        (a, b) => Number(b.id === defaultId) - Number(a.id === defaultId)
      )
      // Counts for large files and virtual tables can scan external data. Keep their preview metadata-only.
      let recordCount: number | null = null
      const hasVirtual = tables.some((table) =>
        /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(
          connection.get<{ sql: string }>(
            "SELECT sql FROM sqlite_schema WHERE name = ?",
            [table.physicalName ?? table.rawTableName]
          )?.sql ?? ""
        )
      )
      if (
        statSync(filePath).size <= 16 * 1024 * 1024 &&
        tables.length <= 32 &&
        !hasVirtual
      ) {
        try {
          recordCount = tables.reduce(
            (sum, table) => sum + runtime.countRows(table.id),
            0
          )
        } catch {
          recordCount = null
        }
      }
      return {
        tableNames: ordered
          .slice(0, 3)
          .map((table) => table.name.slice(0, 100)),
        tableCount: tables.length,
        recordCount,
      }
    })
  } finally {
    connection.close()
  }
}
