import { randomBytes, randomUUID } from "node:crypto"
import { performance } from "node:perf_hooks"
import { parentPort, workerData as rawWorkerData } from "node:worker_threads"
import {
  AdapterTransportServer,
  decodeEidosFileValues,
  encodeEidosFileValues,
  quoteIdentifier,
  Runtime,
  type FileEntry,
  type RuntimeBinding,
} from "@eidos.space/eidos-file"
import { BetterSqlite3ConnectionPort } from "@eidos.space/eidos-file/better-sqlite3"
import type {
  AdapterStructuredCloneCarrier,
  RuntimeHostBridge,
} from "@eidos.space/eidos-file"
import Database from "better-sqlite3"

import type {
  EidosFileRuntimeWorkerControl,
  EidosFileRuntimeWorkerData,
  EidosFileRuntimeWorkerError,
  EidosFileRuntimeWorkerFileEntryInput,
  EidosFileRuntimeWorkerRequest,
  EidosFileRuntimeWorkerResponse,
} from "./eidos-file-runtime-worker-protocol"

if (!parentPort) throw new Error("Eidos File Runtime Worker requires a port")
const port = parentPort
const workerData = rawWorkerData as EidosFileRuntimeWorkerData

let database: Database.Database | null = null
let connection: BetterSqlite3ConnectionPort | null = null
let binding: RuntimeBinding | null = null
let hostBridge: RuntimeHostBridge | null = null
let transport: AdapterTransportServer | null = null
let closed = false

function send(
  response: EidosFileRuntimeWorkerResponse,
  transfers: ArrayBuffer[] = []
): void {
  port.postMessage(response, transfers)
}

function cancellation() {
  return {
    cancelled: () => false,
    onCancel: () => () => undefined,
  }
}

async function openRuntime(): Promise<void> {
  database = new Database(workerData.workingPath, {
    fileMustExist: true,
    readonly: workerData.access === "read",
  })
  database.pragma("foreign_keys = ON")
  database.pragma("trusted_schema = OFF")
  if (workerData.access === "readwrite") {
    database.pragma("journal_mode = DELETE")
    database.pragma("synchronous = FULL")
  }
  connection = new BetterSqlite3ConnectionPort(database)
  const epoch = randomUUID()
  const sessionId = randomUUID()
  transport = new AdapterTransportServer(
    (carrier, transfers) =>
      send(
        { type: "transport", carrier },
        (transfers ?? []).filter(
          (item): item is ArrayBuffer => item instanceof ArrayBuffer
        )
      ),
    {
      epoch,
      sessionID: sessionId,
      workingID: workerData.workingId,
      cancelMode: "terminate",
      allocateReceiptID: () => randomUUID(),
      closeConnection: closeConnection,
    }
  )
  const environment = {
    clock: {
      nowInstant: () => new Date().toISOString(),
      nowMilliseconds: () => performance.now(),
    },
    entropy: {
      randomBytes: (length: number) => new Uint8Array(randomBytes(length)),
    },
    transportCommitBarrier: transport.commitBarrier,
  }
  binding = workerData.create
    ? await Runtime.create(connection, environment, workerData.create, {
        cancellation: cancellation(),
      })
    : await Runtime.open(connection, environment, workerData.access, {
        cancellation: cancellation(),
      })
  hostBridge = binding.hostBridge
  transport.attachRuntime(binding.service)
  const snapshot = await binding.service.getSnapshot(
    {},
    { requestId: randomUUID(), deadlineMilliseconds: 30_000 }
  )
  send({ type: "ready", snapshot })
}

function closeConnection(): void {
  if (closed) return
  closed = true
  connection?.close()
  connection = null
  database = null
}

async function exportCandidate(maxBytes: string): Promise<Uint8Array> {
  if (!binding || !hostBridge) throw new Error("Runtime is not open")
  const validation = await binding.service.validate(
    { level: "full", diagnosticsLimit: 1_000 },
    { requestId: randomUUID(), deadlineMilliseconds: 30_000 }
  )
  if (!validation.valid) {
    throw Object.assign(
      new Error(
        validation.diagnostics.map((item) => item.message).join("; ") ||
          "Eidos File publication validation failed"
      ),
      { code: "invalid-source" }
    )
  }
  const frozen = await hostBridge.createPublicationSnapshot(
    { maxBytes },
    { requestId: randomUUID(), deadlineMilliseconds: 30_000 }
  )
  try {
    const size = Number(frozen.bytes.size)
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error("Publication snapshot size is invalid")
    }
    const result = new Uint8Array(size)
    const chunkSize = 4 * 1024 * 1024
    for (let offset = 0; offset < size; offset += chunkSize) {
      const chunk = await frozen.bytes.read(
        String(offset),
        Math.min(chunkSize, size - offset),
        { cancellation: cancellation(), deadlineMilliseconds: 30_000 }
      )
      result.set(chunk, offset)
    }
    return result
  } finally {
    await frozen.release()
  }
}

async function allocateFileEntry(
  entry: EidosFileRuntimeWorkerFileEntryInput
): Promise<FileEntry> {
  if (!hostBridge) throw new Error("Runtime is not open")
  return hostBridge.allocateFileEntry(entry, {
    requestId: randomUUID(),
    deadlineMilliseconds: 30_000,
  })
}

function findFileEntry(entryId: string): FileEntry {
  if (!database) throw new Error("Runtime is not open")
  const fields = database
    .prepare(
      `SELECT t.physical_name AS table_name, f.physical_name AS column_name
         FROM eidos__fields f
         JOIN eidos__tables t ON t.id = f.table_id
        WHERE f.type = 'file' AND f.physical_name IS NOT NULL
        ORDER BY f.table_id COLLATE BINARY, f.id COLLATE BINARY`
    )
    .all() as Array<{ table_name: string; column_name: string }>
  let matched: FileEntry | null = null
  for (const field of fields) {
    const column = quoteIdentifier(field.column_name)
    const table = quoteIdentifier(field.table_name)
    const values = database
      .prepare(
        `SELECT ${column} AS value
           FROM ${table}
          WHERE ${column} IS NOT NULL
            AND (json_valid(${column}) = 0 OR EXISTS (
              SELECT 1 FROM json_each(${column}) item
               WHERE json_extract(item.value, '$.id') = ?
            ))`
      )
      .all(entryId) as Array<{ value: unknown }>
    for (const row of values) {
      if (typeof row.value !== "string") {
        throw Object.assign(new Error("Stored File value is not TEXT"), {
          code: "invalid-source",
        })
      }
      const entry = decodeEidosFileValues(row.value).find(
        (candidate) => candidate.id === entryId
      )
      if (!entry) continue
      if (
        matched &&
        encodeEidosFileValues([matched]) !== encodeEidosFileValues([entry])
      ) {
        throw Object.assign(
          new Error("File entry ID resolves to conflicting metadata"),
          { code: "invalid-source" }
        )
      }
      matched = entry
    }
  }
  if (!matched) {
    throw Object.assign(new Error("File entry is unavailable"), {
      code: "asset-unavailable",
    })
  }
  return matched
}

async function handleControl(
  control: EidosFileRuntimeWorkerControl
): Promise<void> {
  try {
    if (control.operation === "export") {
      const bytes = await exportCandidate(control.maxBytes)
      send(
        {
          type: "control",
          id: control.id,
          ok: true,
          result: { operation: "export", bytes, integrity: "ok" },
        },
        [bytes.buffer as ArrayBuffer]
      )
      return
    }
    if (control.operation === "allocate-file-entry") {
      const entry = await allocateFileEntry(control.entry)
      send({
        type: "control",
        id: control.id,
        ok: true,
        result: { operation: "allocate-file-entry", entry },
      })
      return
    }
    if (control.operation === "find-file-entry") {
      const entry = findFileEntry(control.entryId)
      send({
        type: "control",
        id: control.id,
        ok: true,
        result: { operation: "find-file-entry", entry },
      })
      return
    }
    try {
      await binding?.service.close({
        requestId: randomUUID(),
        deadlineMilliseconds: 30_000,
      })
    } finally {
      closeConnection()
    }
    send({
      type: "control",
      id: control.id,
      ok: true,
      result: { operation: "close", closed: true },
    })
  } catch (error) {
    send({
      type: "control",
      id: control.id,
      ok: false,
      error: serializeError(error),
    })
  }
}

port.on("message", (message: EidosFileRuntimeWorkerRequest) => {
  if ("transport" in message) {
    transport?.receive(message.transport)
    return
  }
  void handleControl(message.control)
})

port.once("close", closeConnection)
process.once("exit", closeConnection)

void openRuntime().catch((error: unknown) => {
  send({ type: "fatal", error: serializeError(error) })
  closeConnection()
})

function serializeError(error: unknown): EidosFileRuntimeWorkerError {
  const value =
    error instanceof Error ? error : new Error(String(error ?? "Unknown error"))
  const details = value as Error & {
    code?: unknown
    retryable?: unknown
    fatal?: unknown
  }
  return {
    name: value.name,
    message: value.message,
    ...(value.stack ? { stack: value.stack } : {}),
    ...(typeof details.code === "string" ? { code: details.code } : {}),
    ...(typeof details.retryable === "boolean"
      ? { retryable: details.retryable }
      : {}),
    ...(typeof details.fatal === "boolean" ? { fatal: details.fatal } : {}),
  }
}
