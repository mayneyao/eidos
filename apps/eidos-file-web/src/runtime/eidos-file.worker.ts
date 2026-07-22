/// <reference lib="webworker" />

import {
  AdapterTransportServer,
  ConnectionPortEidosFileConnection,
  EidosFileError,
  hasEidosFileSqliteHeader,
  Runtime,
  SQLiteWasmConnectionPort,
  validateEidosFile,
} from "@eidos.space/eidos-file"
import type {
  AdapterStructuredCloneCarrier,
  RuntimeHostBridge,
  RuntimeService,
} from "@eidos.space/eidos-file"
import sqlite3InitModule from "@sqlite.org/sqlite-wasm"

import type {
  EidosFileWorkerAction,
  EidosFileWorkerRequest,
  EidosFileWorkerResponse,
  EidosFileWorkerStorage,
  EidosFileWorkerTransportMessage,
} from "./protocol"

const WORKING_FILE = "/working.eidos"
const workerScope = self as DedicatedWorkerGlobalScope

type Sqlite3Static = Awaited<ReturnType<typeof sqlite3InitModule>>
type SqliteDatabase = InstanceType<Sqlite3Static["oo1"]["DB"]>
type SAHPool = Awaited<ReturnType<Sqlite3Static["installOpfsSAHPoolVfs"]>>

interface OpenEidosFileContext {
  fileName: string
  sqlite: Sqlite3Static
  database: SqliteDatabase
  port: SQLiteWasmConnectionPort
  runtimeService: RuntimeService
  hostBridge: RuntimeHostBridge
  transport: AdapterTransportServer
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

async function closeCurrent(): Promise<void> {
  if (!context) return
  const current = context
  context = null
  try {
    await current.runtimeService.close({ requestId: "host-close" })
  } finally {
    current.port.close()
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
  connection: ConnectionPortEidosFileConnection
): boolean {
  const result = validateEidosFile(connection)
  if (!result.valid) {
    throw new EidosFileError(
      "not-eidos-file",
      result.errors.map((issue) => issue.message).join("; ") ||
        "This SQLite file is not an Eidos File"
    )
  }
  return false
}

async function openEidosFile(
  action: Extract<
    EidosFileWorkerAction,
    { type: "open-source" | "open-recovery" }
  >
) {
  await closeCurrent()
  if (
    action.type === "open-source" &&
    !hasEidosFileSqliteHeader(action.bytes)
  ) {
    throw new EidosFileError(
      "not-eidos-file",
      "Input does not have a SQLite 3 header"
    )
  }
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

  const port = new SQLiteWasmConnectionPort(database, sqlite)
  const connection = new ConnectionPortEidosFileConnection(port)
  try {
    connection.exec(
      "PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;"
    )
    const migrated = validateAndMigrate(connection)
    const epoch = crypto.randomUUID()
    const sessionID = crypto.randomUUID()
    const transport = new AdapterTransportServer(
      (carrier, transfers) => {
        const message: EidosFileWorkerTransportMessage = { transport: carrier }
        workerScope.postMessage(message, transfers ?? [])
      },
      {
        epoch,
        sessionID,
        workingID: action.recoveryId,
        cancelMode: "interrupt",
        allocateReceiptID: () => crypto.randomUUID(),
        closeConnection: () => port.close(),
      }
    )
    const runtimeBinding = await Runtime.open(
      port,
      {
        clock: {
          nowInstant: () => new Date().toISOString(),
          nowMilliseconds: () => performance.now(),
        },
        entropy: {
          randomBytes: (length) =>
            crypto.getRandomValues(new Uint8Array(length)),
        },
        transportCommitBarrier: transport.commitBarrier,
      },
      action.access ?? "readwrite",
      {
        cancellation: {
          cancelled: () => false,
          onCancel: () => () => undefined,
        },
      }
    )
    transport.attachRuntime(runtimeBinding.service)
    const runtimeSnapshot = await runtimeBinding.service.getSnapshot(
      {},
      {
        requestId: crypto.randomUUID(),
        deadlineMilliseconds: 30_000,
      }
    )
    context = {
      fileName: action.fileName,
      sqlite,
      database,
      port,
      runtimeService: runtimeBinding.service,
      hostBridge: runtimeBinding.hostBridge,
      transport,
      pool,
      storage,
    }
    return {
      snapshot: runtimeSnapshot,
      migrated,
      recovered: action.type === "open-recovery",
      storage,
    }
  } catch (error) {
    connection.close()
    throw error
  }
}

async function handleAction(action: EidosFileWorkerAction) {
  if (action.type === "open-source" || action.type === "open-recovery") {
    return openEidosFile(action)
  }
  if (action.type === "discard-recovery") {
    await closeCurrent()
    const sqlite = await getSqlite()
    const pool = await installPool(sqlite, action.recoveryId)
    if (pool) await pool.wipeFiles()
    return { discarded: true as const }
  }
  if (action.type === "close") {
    await closeCurrent()
    return { closed: true as const }
  }
  if (!context) throw new Error("No Eidos File is open")

  switch (action.type) {
    case "export": {
      const frozen = await context.hostBridge.createPublicationSnapshot(
        { maxBytes: action.maxBytes },
        {
          requestId: crypto.randomUUID(),
          deadlineMilliseconds: 30_000,
        }
      )
      try {
        const length = Number(frozen.bytes.size)
        const bytes = await frozen.bytes.read("0", length, {
          cancellation: {
            cancelled: () => false,
            onCancel: () => () => undefined,
          },
        })
        validatePublicationCandidate(context.sqlite, bytes)
        return { bytes, integrity: "ok" as const }
      } finally {
        await frozen.release()
      }
    }
  }
}

function validatePublicationCandidate(
  sqlite: Sqlite3Static,
  bytes: Uint8Array
): void {
  const database = new sqlite.oo1.DB(":memory:", "c")
  const pointer = sqlite.wasm.allocFromTypedArray(bytes)
  let ownedByDatabase = false
  let port: SQLiteWasmConnectionPort | undefined
  try {
    database.checkRc(
      sqlite.capi.sqlite3_deserialize(
        database.pointer!,
        "main",
        pointer,
        bytes.byteLength,
        bytes.byteLength,
        sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
          sqlite.capi.SQLITE_DESERIALIZE_READONLY
      )
    )
    ownedByDatabase = true
    port = new SQLiteWasmConnectionPort(database, sqlite)
    const validation = validateEidosFile(
      new ConnectionPortEidosFileConnection(port),
      { level: "full" }
    )
    if (!validation.valid) {
      throw new EidosFileError(
        "not-eidos-file",
        validation.errors.map((issue) => issue.message).join("; ") ||
          "Publication candidate failed Eidos File validation"
      )
    }
  } finally {
    if (port) port.close()
    else if (ownedByDatabase) database.close()
    else {
      sqlite.wasm.dealloc(pointer)
      database.close()
    }
  }
}

workerScope.onmessage = (
  event: MessageEvent<EidosFileWorkerRequest | EidosFileWorkerTransportMessage>
) => {
  if ("transport" in event.data) {
    context?.transport.receive(event.data.transport)
    return
  }
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
      const normalized = normalizeWorkerError(error)
      const response: EidosFileWorkerResponse = {
        id,
        ok: false,
        error: {
          name: normalized.name,
          message: normalized.message,
          stack: normalized.stack,
          ...("code" in normalized && typeof normalized.code === "string"
            ? { code: normalized.code }
            : {}),
          ...("retryable" in normalized &&
          typeof normalized.retryable === "boolean"
            ? { retryable: normalized.retryable }
            : {}),
          ...("fatal" in normalized && typeof normalized.fatal === "boolean"
            ? { fatal: normalized.fatal }
            : {}),
        },
      }
      workerScope.postMessage(response)
    })
}

function normalizeWorkerError(error: unknown): Error & Record<string, unknown> {
  if (error instanceof Error) return error as Error & Record<string, unknown>
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return Object.assign(new Error(error.message), error, {
      name:
        "name" in error && typeof error.name === "string"
          ? error.name
          : "Error",
    }) as Error & Record<string, unknown>
  }
  return new Error(String(error)) as Error & Record<string, unknown>
}
