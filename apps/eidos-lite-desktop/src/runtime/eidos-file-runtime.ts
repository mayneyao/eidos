import { randomBytes } from "node:crypto"
import path from "node:path"
import {
  Runtime,
  type RequestContext,
  type RuntimeEnvironment,
  type RuntimeFactoryContext,
} from "@eidos.space/eidos-file"
import {
  BetterSqlite3ConnectionPort,
  hasSqliteHeader,
} from "@eidos.space/eidos-file/better-sqlite3"
import { EidosRuntimeEditorDataSource } from "@eidos.space/eidos-file-ui/runtime-editor-data-source"
import Database from "better-sqlite3"

const factoryContext: RuntimeFactoryContext = {
  cancellation: {
    cancelled: () => false,
    onCancel: () => () => undefined,
  },
}

function environment(): RuntimeEnvironment {
  return {
    clock: {
      nowInstant: () => new Date().toISOString(),
      nowMilliseconds: () => performance.now(),
    },
    entropy: {
      randomBytes: (length) => new Uint8Array(randomBytes(length)),
    },
  }
}

function context(requestId: string): RequestContext {
  return { requestId, deadlineMilliseconds: 30_000 }
}

function assertRuntimePath(filePath: string): void {
  if (!path.isAbsolute(filePath)) {
    throw new Error("Runtime file path must be absolute")
  }
  if (path.extname(filePath).toLowerCase() !== ".eidos") {
    throw new Error("Only .eidos files can be opened by Eidos Lite")
  }
}

export interface EidosLiteFileRuntime {
  source: EidosRuntimeEditorDataSource
  close(): Promise<void>
}

async function bindRuntime(
  connection: BetterSqlite3ConnectionPort,
  service: Awaited<ReturnType<typeof Runtime.open>>["service"],
  filePath: string
): Promise<EidosLiteFileRuntime> {
  const source = new EidosRuntimeEditorDataSource(
    service,
    path.basename(filePath)
  )
  let closed = false
  try {
    await source.initialize()
    return {
      source,
      async close() {
        if (closed) return
        closed = true
        try {
          await service.close(context("eidos-lite-runtime-close"))
        } finally {
          connection.close()
        }
      },
    }
  } catch (error) {
    try {
      await service.close(context("eidos-lite-runtime-open-failed"))
    } finally {
      connection.close()
    }
    throw error
  }
}

export async function createEidosLiteFileRuntime(
  filePath: string,
  title: string
): Promise<EidosLiteFileRuntime> {
  assertRuntimePath(filePath)
  const connection = new BetterSqlite3ConnectionPort(new Database(filePath))
  let opened: EidosLiteFileRuntime | null = null
  try {
    const binding = await Runtime.create(
      connection,
      environment(),
      { title },
      factoryContext
    )
    opened = await bindRuntime(connection, binding.service, filePath)
    await opened.source.createTable({ name: "Table 1" })
    return opened
  } catch (error) {
    if (opened) {
      await opened.close().catch(() => undefined)
    } else if (connection.database.open) {
      connection.close()
    }
    throw error
  }
}

export async function openEidosLiteFileRuntime(
  filePath: string
): Promise<EidosLiteFileRuntime> {
  assertRuntimePath(filePath)
  if (!hasSqliteHeader(filePath)) {
    throw new Error(`Not a SQLite file: ${filePath}`)
  }
  const connection = new BetterSqlite3ConnectionPort(
    new Database(filePath, { fileMustExist: true })
  )
  try {
    const binding = await Runtime.open(
      connection,
      environment(),
      "readwrite",
      factoryContext
    )
    return await bindRuntime(connection, binding.service, filePath)
  } catch (error) {
    if (connection.database.open) connection.close()
    throw error
  }
}
