import path from "node:path"

import Database, {
  type SqliteDatabase,
} from "../data-space/worker/sqlite-server/better-sqlite3"
import { createGraftDbUri } from "../data-space/worker/sqlite-server/graft-uri"
import { assertGraftRuntimeVersion } from "./graft-runtime-version"
import { graftSqlitePragmaStatement } from "./graft-sqlite-pragma"
import type {
  GraftWorkerInitData,
  GraftWorkerRequest,
  GraftWorkerResponse,
} from "./graft-worker-protocol"

let init: GraftWorkerInitData | null = null
let connection: SqliteDatabase | null = null

function getConnection(): SqliteDatabase {
  if (connection?.open) return connection
  if (!init) throw new Error("Graft process has not been initialized")

  const registration = new Database(":memory:")
  try {
    registration.loadExtension(init.extensionPath)
  } finally {
    registration.close()
  }

  const workspaceSessionPath = path.join(init.repositoryPath, ".graft")
  const workspaceConnection = new Database(
    createGraftDbUri(workspaceSessionPath)
  )
  try {
    assertGraftRuntimeVersion(
      workspaceConnection.pragma("graft_version", { simple: true }),
      "SQLite extension"
    )
  } catch (error) {
    workspaceConnection.close()
    throw error
  }
  connection = workspaceConnection
  return connection
}

function closeConnection(): void {
  connection?.close()
  connection = null
}

function errorResponse(id: number, error: unknown): GraftWorkerResponse {
  return {
    type: "error",
    id,
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  }
}

function send(response: GraftWorkerResponse): void {
  process.send?.(response)
}

process.on("message", (request: GraftWorkerRequest) => {
  if (request.type === "init") {
    if (
      !request.data.repositoryPath ||
      !request.data.extensionPath ||
      init !== null
    ) {
      throw new Error("Graft process received invalid initialization data")
    }
    init = request.data
    return
  }
  if (request.type === "close") {
    closeConnection()
    send({ type: "closed" })
    process.disconnect?.()
    return
  }

  try {
    const raw = getConnection().pragma(
      graftSqlitePragmaStatement(request.pragma, request.argument),
      { simple: true }
    )
    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error(`Graft ${request.pragma} returned an empty JSON response`)
    }
    if (Buffer.byteLength(raw, "utf8") > request.maxBufferBytes) {
      throw new Error(
        `Graft ${request.pragma} response exceeded ${request.maxBufferBytes} bytes`
      )
    }
    let value: unknown
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      throw new Error(`Graft ${request.pragma} returned malformed JSON`)
    }
    send({
      type: "result",
      id: request.id,
      value,
    })
  } catch (error) {
    send(errorResponse(request.id, error))
  }
})

process.once("exit", closeConnection)
process.once("SIGTERM", () => {
  closeConnection()
  process.exit(0)
})
