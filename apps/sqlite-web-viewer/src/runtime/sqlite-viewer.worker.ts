/// <reference lib="webworker" />

import sqlite3InitModule from "@sqlite.org/sqlite-wasm"

import { assertSQLiteHeader } from "../files/file-validation"
import type {
  DatabaseSnapshot,
  RelationDetails,
  RelationSummary,
} from "../types"
import {
  introspectDatabase,
  introspectRelation,
  readRelationPage,
  type SQLiteReadonlyDatabase,
} from "./introspection"
import type {
  SQLiteViewerAction,
  SQLiteViewerRequest,
  SQLiteViewerResponse,
  SQLiteViewerResult,
} from "./protocol"
import {
  assertQueryOnly,
  READ_ONLY_BOOTSTRAP_SQL,
  READ_ONLY_OPEN_FLAGS,
  readonlyAuthorizerResult,
} from "./read-only-policy"

const DATABASE_PATH = "/sqlite-web-viewer.db"
const workerScope = self as DedicatedWorkerGlobalScope

type SQLiteStatic = Awaited<ReturnType<typeof sqlite3InitModule>>
type SQLiteDatabase = InstanceType<SQLiteStatic["oo1"]["DB"]>

interface OpenContext {
  database: SQLiteDatabase
  details: Map<string, RelationDetails>
  snapshot: DatabaseSnapshot
}

let sqlitePromise: Promise<SQLiteStatic> | null = null
let context: OpenContext | null = null

function getSQLite(): Promise<SQLiteStatic> {
  sqlitePromise ??= sqlite3InitModule({
    print: () => undefined,
    printErr: (message) => {
      const text = String(message)
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

function closeCurrent(): void {
  context?.database.close()
  context = null
}

function relationNamed(
  snapshot: DatabaseSnapshot,
  name: string
): RelationSummary {
  const relation = snapshot.relations.find(
    (candidate) => candidate.name === name
  )
  if (!relation)
    throw new Error(`SQLite object “${name}” is no longer available`)
  return relation
}

function detailsFor(name: string): RelationDetails {
  if (!context) throw new Error("No SQLite database is open")
  const cached = context.details.get(name)
  if (cached) return cached
  const details = introspectRelation(
    context.database as SQLiteReadonlyDatabase,
    relationNamed(context.snapshot, name)
  )
  context.details.set(name, details)
  return details
}

async function openDatabase(
  action: Extract<SQLiteViewerAction, { type: "open" }>
): Promise<DatabaseSnapshot> {
  assertSQLiteHeader(action.bytes)
  closeCurrent()
  const sqlite = await getSQLite()
  sqlite.capi.sqlite3_js_posix_create_file(DATABASE_PATH, action.bytes)
  const database = new sqlite.oo1.DB(DATABASE_PATH, READ_ONLY_OPEN_FLAGS)
  try {
    database.exec(READ_ONLY_BOOTSTRAP_SQL)
    assertQueryOnly(database.selectValue("PRAGMA query_only"))
    const authorizerResult = sqlite.capi.sqlite3_set_authorizer(
      database,
      (_context, actionCode, argument1, argument2) =>
        readonlyAuthorizerResult(actionCode, argument1, argument2),
      0
    )
    if (authorizerResult !== 0) {
      throw new Error("SQLite read-only authorizer could not be installed")
    }
    const snapshot = introspectDatabase(
      database as SQLiteReadonlyDatabase,
      action.fileName,
      action.bytes.byteLength
    )
    context = { database, details: new Map(), snapshot }
    return snapshot
  } catch (error) {
    database.close()
    throw error
  }
}

async function handleAction(
  action: SQLiteViewerAction
): Promise<SQLiteViewerResult> {
  if (action.type === "open") return openDatabase(action)
  if (action.type === "close") {
    closeCurrent()
    return { closed: true }
  }
  if (!context) throw new Error("No SQLite database is open")
  if (action.type === "details") return detailsFor(action.name)
  return readRelationPage(
    context.database as SQLiteReadonlyDatabase,
    detailsFor(action.name),
    action.offset,
    action.limit
  )
}

workerScope.addEventListener(
  "message",
  async (event: MessageEvent<SQLiteViewerRequest>) => {
    const { id, action } = event.data
    let response: SQLiteViewerResponse
    try {
      response = { id, ok: true, result: await handleAction(action) }
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error))
      response = {
        id,
        ok: false,
        error: {
          message: normalized.message,
          name: normalized.name,
          ...(normalized.stack ? { stack: normalized.stack } : {}),
        },
      }
    }
    workerScope.postMessage(response)
  }
)
