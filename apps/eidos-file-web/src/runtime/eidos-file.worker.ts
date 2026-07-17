/// <reference lib="webworker" />

import {
  EidosFileError,
  EidosFileRuntime,
  migrateEidosFileSchema,
  validateEidosFile,
} from "@eidos.space/eidos-file"
import {
  importEidosFileCsv,
  planEidosFileCsvImport,
} from "@eidos.space/eidos-file/csv"
import type {
  EidosFileRowMutationResult,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import sqlite3InitModule from "@sqlite.org/sqlite-wasm"

import type {
  EidosFileWorkerAction,
  EidosFileWorkerRequest,
  EidosFileWorkerResponse,
  EidosFileWorkerStorage,
} from "./protocol"
import { SQLiteWasmEidosFileConnection } from "./sqlite-wasm-connection"

const WORKING_FILE = "/working.eidos"
const workerScope = self as DedicatedWorkerGlobalScope

type Sqlite3Static = Awaited<ReturnType<typeof sqlite3InitModule>>
type SqliteDatabase = InstanceType<Sqlite3Static["oo1"]["DB"]>
type SAHPool = Awaited<ReturnType<Sqlite3Static["installOpfsSAHPoolVfs"]>>

interface OpenEidosFileContext {
  fileName: string
  sqlite: Sqlite3Static
  database: SqliteDatabase
  connection: SQLiteWasmEidosFileConnection
  runtime: EidosFileRuntime
  pool: SAHPool | null
  storage: EidosFileWorkerStorage
}

let sqlitePromise: Promise<Sqlite3Static> | null = null
let context: OpenEidosFileContext | null = null

function getSqlite(): Promise<Sqlite3Static> {
  sqlitePromise ??= sqlite3InitModule({
    print: () => undefined,
    printErr: (message) => {
      const text = String(message)
      // sqlite-wasm probes the classic OPFS VFS during startup. This editor
      // deliberately uses the SAH pool VFS, which does not require SAB or
      // cross-origin isolation, so that failed optional probe is not an error.
      if (
        text.includes("OPFS") &&
        text.includes("Missing SharedArrayBuffer and/or Atomics")
      ) {
        return
      }
      console.warn(`[sqlite-wasm] ${text}`)
    },
  })
  return sqlitePromise
}

function recoveryDirectory(recoveryId: string): string {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(recoveryId)) {
    throw new Error("Recovery identifier is invalid")
  }
  return `/eidos-file-web/${recoveryId}`
}

function closeCurrent(): void {
  if (!context) return
  context.runtime.close()
  context = null
}

function snapshot(): EidosFileSnapshot {
  if (!context) throw new Error("No Eidos File is open")
  const { runtime, fileName } = context
  const metadata = runtime.info()
  return {
    path: fileName,
    metadata,
    tables: runtime.listTables().map((table) => ({
      table,
      fields: runtime.listFields(table.id),
      views: runtime.listViews(table.id),
      rowCount: runtime.countRows(table.id),
    })),
  }
}

async function installPool(
  sqlite: Sqlite3Static,
  recoveryId: string
): Promise<SAHPool | null> {
  if (!navigator.storage?.getDirectory) return null
  try {
    return await sqlite.installOpfsSAHPoolVfs({
      directory: recoveryDirectory(recoveryId),
      initialCapacity: 6,
      name: "eidos-file-web",
    })
  } catch (error) {
    console.warn("Persistent Eidos File recovery is unavailable", error)
    return null
  }
}

function validateAndMigrate(
  connection: SQLiteWasmEidosFileConnection
): boolean {
  const initial = validateEidosFile(connection)
  const migrationAvailable =
    initial.errors.length === 0 &&
    initial.warnings.some(
      (warning) => warning.code === "schema-migration-available"
    )
  if (migrationAvailable) migrateEidosFileSchema(connection)
  const result = validateEidosFile(connection)
  if (!result.valid) {
    throw new EidosFileError(
      "not-eidos-file",
      result.errors.map((issue) => issue.message).join("; ") ||
        "This SQLite file is not an Eidos File"
    )
  }
  return migrationAvailable
}

async function openEidosFile(
  action: Extract<
    EidosFileWorkerAction,
    { type: "open-source" | "open-recovery" }
  >
) {
  closeCurrent()
  const sqlite = await getSqlite()
  const pool = await installPool(sqlite, action.recoveryId)
  let database: SqliteDatabase
  let storage: EidosFileWorkerStorage

  if (pool) {
    if (action.type === "open-source") {
      await pool.importDb(WORKING_FILE, action.bytes)
    } else if (!pool.getFileNames().includes(WORKING_FILE)) {
      throw new Error("The recoverable working copy is no longer available")
    }
    database = new pool.OpfsSAHPoolDb(WORKING_FILE)
    storage = "opfs-sahpool"
  } else {
    if (action.type === "open-recovery") {
      throw new Error(
        "This browser cannot reopen the persistent recovery copy. Open the original file instead."
      )
    }
    sqlite.capi.sqlite3_js_posix_create_file(WORKING_FILE, action.bytes)
    database = new sqlite.oo1.DB(WORKING_FILE, "w")
    storage = "memory"
  }

  const connection = new SQLiteWasmEidosFileConnection(database)
  try {
    connection.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;"
    )
    const migrated = validateAndMigrate(connection)
    const runtime = new EidosFileRuntime(connection, true)
    runtime.optimizeViewQueries()
    context = {
      fileName: action.fileName,
      sqlite,
      database,
      connection,
      runtime,
      pool,
      storage,
    }
    return {
      snapshot: snapshot(),
      migrated,
      recovered: action.type === "open-recovery",
      storage,
    }
  } catch (error) {
    connection.close()
    throw error
  }
}

function mutationResult(
  tableId: string,
  row: ReturnType<EidosFileRuntime["updateRow"]>
): EidosFileRowMutationResult {
  if (!context) throw new Error("No Eidos File is open")
  return {
    tableId,
    row,
    rowCount: context.runtime.countRows(tableId),
    revision: context.runtime.info().updatedAt,
  }
}

function csvSource(fileName: string, bytes: ArrayBuffer) {
  return { name: fileName, content: new TextDecoder().decode(bytes) }
}

async function handleAction(action: EidosFileWorkerAction) {
  if (action.type === "open-source" || action.type === "open-recovery") {
    return openEidosFile(action)
  }
  if (action.type === "discard-recovery") {
    closeCurrent()
    const sqlite = await getSqlite()
    const pool = await installPool(sqlite, action.recoveryId)
    if (pool) await pool.wipeFiles()
    return { discarded: true as const }
  }
  if (action.type === "close") {
    closeCurrent()
    return { closed: true as const }
  }
  if (!context) throw new Error("No Eidos File is open")

  const { runtime } = context
  switch (action.type) {
    case "snapshot":
      return snapshot()
    case "page":
      return runtime.getRowPage(
        action.tableId,
        action.offset,
        action.limit,
        action.query,
        action.totalHint,
        action.cursor,
        action.projection
      )
    case "row":
      return runtime.getRow(action.tableId, action.rowId)
    case "group-counts":
      return runtime.countRowsByField(
        action.tableId,
        action.columnName,
        action.query
      )
    case "column-stats":
      return runtime.calculateColumnStats(
        action.tableId,
        action.configs,
        action.query
      )
    case "insert-row":
      return mutationResult(
        action.tableId,
        runtime.insertRow(action.tableId, action.row)
      )
    case "update-row":
      return mutationResult(
        action.tableId,
        runtime.updateRow(action.tableId, action.rowId, action.changes)
      )
    case "update-field":
      runtime.updateField(action.tableId, action.columnName, action.changes)
      return snapshot()
    case "add-field":
      runtime.addField(action.tableId, action.field, action.placement)
      return snapshot()
    case "delete-field":
      runtime.deleteField(action.tableId, action.columnName)
      return snapshot()
    case "update-view":
      runtime.updateView(action.viewId, action.changes)
      return snapshot()
    case "csv-preview":
      return planEidosFileCsvImport(
        csvSource(action.fileName, action.bytes),
        action.options
      )
    case "csv-import": {
      const result = importEidosFileCsv(
        runtime,
        csvSource(action.fileName, action.bytes),
        action.options
      )
      return { snapshot: snapshot(), result }
    }
    case "export": {
      const check = context.connection.get<{ integrity_check: string }>(
        "PRAGMA integrity_check"
      )?.integrity_check
      if (check !== "ok") {
        throw new Error(`SQLite integrity check failed: ${check ?? "unknown"}`)
      }
      const bytes = context.pool
        ? await context.pool.exportFile(WORKING_FILE)
        : context.sqlite.capi.sqlite3_js_db_export(context.database)
      return { bytes, integrity: "ok" as const }
    }
  }
}

workerScope.onmessage = (event: MessageEvent<EidosFileWorkerRequest>) => {
  const { id, action } = event.data
  void handleAction(action)
    .then((result) => {
      const response: EidosFileWorkerResponse = { id, ok: true, result }
      const exportedBytes =
        action.type === "export" &&
        typeof result === "object" &&
        result !== null &&
        "bytes" in result &&
        result.bytes instanceof Uint8Array
          ? result.bytes
          : null
      const transfers = exportedBytes ? [exportedBytes.buffer] : []
      workerScope.postMessage(response, transfers)
    })
    .catch((error: unknown) => {
      const normalized =
        error instanceof Error ? error : new Error(String(error))
      const response: EidosFileWorkerResponse = {
        id,
        ok: false,
        error: {
          name: normalized.name,
          message: normalized.message,
          stack: normalized.stack,
        },
      }
      workerScope.postMessage(response)
    })
}
