import type sqlite3InitModule from "@sqlite.org/sqlite-wasm"

import type {
  EidosFileConnection,
  EidosFileRunResult,
  EidosFileSqlParams,
  EidosFileSqlPrimitive,
} from "./connection"
import {
  EIDOS_FILE_EXTENSION,
  EIDOS_FILE_MIME_TYPE,
  hasEidosFileSqliteHeader,
} from "./constants"
import { EidosFileRuntimeDataSource } from "./data-source"
import { EidosFileError } from "./errors"
import type {
  EidosFileDescriptor,
  EidosFileDocument,
  EidosFileHandle,
  EidosFileHostCapabilities,
  EidosFilePermissionState,
  EidosFileReadResult,
  EidosFileRecoverySnapshot,
  EidosFileRecoveryStore,
  EidosFileRuntimeAdapter,
  EidosFileWriteOptions,
} from "./host"
import { EidosFileHostError } from "./host"
import { EidosFileRuntime } from "./runtime"
import { validateEidosFile } from "./validation"

export {
  EIDOS_FILE_EXTENSION,
  EIDOS_FILE_FORMAT,
  EIDOS_FILE_MIME_TYPE,
} from "./constants"
export { SQLiteWasmConnectionPort } from "./sqlite-wasm"
export type { SQLiteWasmConnectionPortOptions } from "./sqlite-wasm"
export * from "./adapter-transport"
export type * from "./adapter-contract"
export type * from "./runtime-contract"
export type * from "./connection"
export type { EidosFileDataSource } from "./data-source"
export type {
  EidosFileDescriptor,
  EidosFileDocument,
  EidosFileHandle,
  EidosFileHostCapabilities,
  EidosFilePermissionState,
  EidosFileReadResult,
  EidosFileRecoverySnapshot,
  EidosFileRecoveryStore,
  EidosFileRuntimeAdapter,
  EidosFileWriteOptions,
} from "./host"
export type * from "./types"
export {
  currentEidosFileInstant,
  isCanonicalEidosFileDate,
  isCanonicalEidosFileInstant,
  normalizeEidosFileDate,
  normalizeEidosFileInstant,
} from "./temporal"

type Sqlite3Initializer = typeof sqlite3InitModule
type Sqlite3Static = Awaited<ReturnType<Sqlite3Initializer>>
type SqliteDatabase = InstanceType<Sqlite3Static["oo1"]["DB"]>

declare global {
  interface Window {
    showOpenFilePicker?: (
      options?: OpenFilePickerOptions
    ) => Promise<FileSystemFileHandle[]>
    showSaveFilePicker?: (
      options?: SaveFilePickerOptions
    ) => Promise<FileSystemFileHandle>
  }
}

const EIDOS_FILE_PICKER_TYPE: FilePickerAcceptType = {
  description: "Eidos File",
  accept: { [EIDOS_FILE_MIME_TYPE]: [EIDOS_FILE_EXTENSION] },
}

const DIRECT_CAPABILITIES: EidosFileHostCapabilities = {
  read: true,
  write: true,
  saveAs: true,
  recovery: true,
  persistentFileAccess: true,
}

const IMPORT_CAPABILITIES: EidosFileHostCapabilities = {
  read: true,
  write: false,
  saveAs: true,
  recovery: true,
  persistentFileAccess: false,
}

function abortIfNeeded(signal?: AbortSignal): void {
  signal?.throwIfAborted()
}

function copyArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  const source =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes, 0, bytes.byteLength)
  const copy = new Uint8Array(source.byteLength)
  copy.set(source)
  return copy.buffer
}

function copyBytes(bytes: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(copyArrayBuffer(bytes))
}

function assertEidosFileName(name: string): void {
  if (name.toLowerCase().endsWith(EIDOS_FILE_EXTENSION)) return
  throw new EidosFileError(
    "file-not-found",
    `“${name}” is not an Eidos File. Choose a ${EIDOS_FILE_EXTENSION} file.`
  )
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

function randomId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function supportsBrowserFileAccess(
  target: Pick<Window, "showOpenFilePicker"> | undefined = typeof window ===
  "undefined"
    ? undefined
    : window
): boolean {
  return typeof target?.showOpenFilePicker === "function"
}

export function supportsBrowserSaveAs(
  target: Pick<Window, "showSaveFilePicker"> | undefined = typeof window ===
  "undefined"
    ? undefined
    : window
): boolean {
  return typeof target?.showSaveFilePicker === "function"
}

export async function digestEidosFileBytes(
  bytes: ArrayBuffer | Uint8Array
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", copyArrayBuffer(bytes))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

async function descriptorForFile(
  id: string,
  file: File,
  bytes?: ArrayBuffer
): Promise<EidosFileDescriptor> {
  const content = bytes ?? (await file.arrayBuffer())
  return {
    id,
    name: file.name,
    format: "eidos-file",
    mimeType: EIDOS_FILE_MIME_TYPE,
    size: content.byteLength,
    revision: await digestEidosFileBytes(content),
    lastModified: file.lastModified,
  }
}

export class BrowserEidosFileHandle implements EidosFileHandle {
  readonly capabilities: EidosFileHostCapabilities
  private current: EidosFileDescriptor

  private constructor(
    private file: File,
    readonly nativeHandle: FileSystemFileHandle | undefined,
    descriptor: EidosFileDescriptor
  ) {
    this.current = descriptor
    this.capabilities = nativeHandle ? DIRECT_CAPABILITIES : IMPORT_CAPABILITIES
  }

  static async fromFile(
    file: File,
    nativeHandle?: FileSystemFileHandle
  ): Promise<BrowserEidosFileHandle> {
    assertEidosFileName(file.name)
    return new BrowserEidosFileHandle(
      file,
      nativeHandle,
      await descriptorForFile(`browser:${randomId()}`, file)
    )
  }

  async descriptor(): Promise<EidosFileDescriptor> {
    if (this.nativeHandle) {
      this.file = await this.nativeHandle.getFile()
      this.current = await descriptorForFile(this.current.id, this.file)
    }
    return this.current
  }

  async permission(): Promise<EidosFilePermissionState> {
    if (!this.nativeHandle) return "denied"
    try {
      return await this.nativeHandle.queryPermission({ mode: "readwrite" })
    } catch {
      return "denied"
    }
  }

  async requestPermission(): Promise<EidosFilePermissionState> {
    if (!this.nativeHandle) return "denied"
    try {
      return await this.nativeHandle.requestPermission({ mode: "readwrite" })
    } catch {
      return "denied"
    }
  }

  async read(
    options: { signal?: AbortSignal } = {}
  ): Promise<EidosFileReadResult> {
    abortIfNeeded(options.signal)
    if (this.nativeHandle) this.file = await this.nativeHandle.getFile()
    const bytes = await this.file.arrayBuffer()
    abortIfNeeded(options.signal)
    this.current = await descriptorForFile(this.current.id, this.file, bytes)
    return { descriptor: this.current, bytes }
  }

  async write(
    bytes: Uint8Array,
    options: EidosFileWriteOptions = {}
  ): Promise<EidosFileDescriptor> {
    if (!this.nativeHandle) {
      throw new EidosFileHostError(
        "permission-denied",
        "Imported browser files are read-only. Choose a destination with Save As."
      )
    }
    abortIfNeeded(options.signal)
    const actual = await this.descriptor()
    if (
      !options.force &&
      options.expectedRevision &&
      actual.revision !== options.expectedRevision
    ) {
      const conflict = {
        expectedRevision: options.expectedRevision,
        actual,
      }
      throw new EidosFileHostError(
        "conflict",
        "The file changed outside this app. Reload it or save your working copy elsewhere.",
        conflict
      )
    }

    const content = copyBytes(bytes)
    const writable = await this.nativeHandle.createWritable({
      keepExistingData: false,
    })
    try {
      await writable.write(content)
      abortIfNeeded(options.signal)
      await writable.close()
    } catch (error) {
      try {
        await writable.abort(error)
      } catch {
        // Preserve the original failure; the session recovery copy is untouched.
      }
      throw error
    }
    this.file = await this.nativeHandle.getFile()
    this.current = await descriptorForFile(this.current.id, this.file)
    const expectedDigest = await digestEidosFileBytes(content)
    if (this.current.revision !== expectedDigest) {
      throw new EidosFileHostError(
        "write-failed",
        "The browser closed the file, but the bytes on disk do not match the saved Eidos File."
      )
    }
    return this.current
  }
}

export async function openBrowserEidosFile(
  file: File
): Promise<BrowserEidosFileHandle> {
  return BrowserEidosFileHandle.fromFile(file)
}

export async function openBrowserEidosFileHandle(
  handle: FileSystemFileHandle
): Promise<BrowserEidosFileHandle> {
  return BrowserEidosFileHandle.fromFile(await handle.getFile(), handle)
}

export async function pickBrowserEidosFile(): Promise<BrowserEidosFileHandle | null> {
  if (!supportsBrowserFileAccess()) return null
  try {
    const handles = await window.showOpenFilePicker?.({
      multiple: false,
      types: [EIDOS_FILE_PICKER_TYPE],
      excludeAcceptAllOption: false,
    })
    return handles?.[0] ? openBrowserEidosFileHandle(handles[0]) : null
  } catch (error) {
    if (isAbort(error)) return null
    throw error
  }
}

export async function pickBrowserEidosFileDestination(
  suggestedName: string
): Promise<BrowserEidosFileHandle | null> {
  if (!supportsBrowserSaveAs()) return null
  const fileName = suggestedName.toLowerCase().endsWith(EIDOS_FILE_EXTENSION)
    ? suggestedName
    : `${suggestedName}${EIDOS_FILE_EXTENSION}`
  try {
    const handle = await window.showSaveFilePicker?.({
      suggestedName: fileName,
      types: [EIDOS_FILE_PICKER_TYPE],
      excludeAcceptAllOption: false,
    })
    return handle ? openBrowserEidosFileHandle(handle) : null
  } catch (error) {
    if (isAbort(error)) return null
    throw error
  }
}

export function downloadEidosFile(
  bytes: Uint8Array,
  suggestedName: string
): void {
  const fileName = suggestedName.toLowerCase().endsWith(EIDOS_FILE_EXTENSION)
    ? suggestedName
    : `${suggestedName}${EIDOS_FILE_EXTENSION}`
  const url = URL.createObjectURL(
    new Blob([copyArrayBuffer(bytes)], { type: EIDOS_FILE_MIME_TYPE })
  )
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function sqliteValue(value: unknown): EidosFileSqlPrimitive {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  ) {
    return value
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (value instanceof Int8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  throw new TypeError(`Unsupported SQLite value: ${typeof value}`)
}

class SQLiteWasmEidosFileConnection implements EidosFileConnection {
  readonly capabilities = {
    int64: true,
    json1: true,
    returning: true,
    interrupt: true,
    scalarFunctions: true,
  } as const

  private transactionDepth = 0

  constructor(
    readonly database: SqliteDatabase,
    private readonly sqlite3: Sqlite3Static
  ) {}

  exec(sql: string): void {
    this.database.exec(sql)
  }

  query<T extends object>(sql: string, params: EidosFileSqlParams = []): T[] {
    return this.database
      .selectObjects(sql, params)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, sqliteValue(value)])
        )
      ) as T[]
  }

  get<T extends object>(
    sql: string,
    params: EidosFileSqlParams = []
  ): T | undefined {
    return this.query<T>(sql, params)[0]
  }

  run(sql: string, params: EidosFileSqlParams = []): EidosFileRunResult {
    const statement = this.database.prepare(sql)
    try {
      if (params.length > 0) statement.bind(params)
      statement.step()
    } finally {
      statement.finalize()
    }
    const lastInsertRowid = this.database.selectValue(
      "SELECT last_insert_rowid()"
    )
    return {
      changes: this.database.changes(),
      lastInsertRowid:
        typeof lastInsertRowid === "bigint" ||
        typeof lastInsertRowid === "number"
          ? lastInsertRowid
          : 0,
    }
  }

  runMany(sql: string, parameterSets: readonly EidosFileSqlParams[]): void {
    const statement = this.database.prepare(sql)
    try {
      for (const params of parameterSets) {
        statement.bind(params).step()
        statement.reset(true)
      }
    } finally {
      statement.finalize()
    }
  }

  registerFunction(
    name: string,
    operation: (...values: EidosFileSqlPrimitive[]) => EidosFileSqlPrimitive,
    arity = operation.length
  ): void {
    this.database.createFunction(
      name,
      (_context, ...values) => operation(...values.map(sqliteValue)),
      { arity, deterministic: true }
    )
  }

  transaction<T>(operation: () => T): T {
    const depth = this.transactionDepth++
    const savepoint = `eidos_file_${depth}`
    this.database.exec(
      depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`
    )
    try {
      const result = operation()
      this.database.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`)
      return result
    } catch (error) {
      this.database.exec(
        depth === 0
          ? "ROLLBACK"
          : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`
      )
      throw error
    } finally {
      this.transactionDepth -= 1
    }
  }

  dataVersion(): number {
    return (
      this.get<{ data_version: number }>("PRAGMA data_version")?.data_version ??
      0
    )
  }

  interrupt(): void {
    const capi = this.sqlite3.capi as unknown as {
      sqlite3_interrupt(pointer: unknown): void
    }
    capi.sqlite3_interrupt(this.database.pointer)
  }

  close(): void {
    this.database.close()
  }
}

let sqlitePromise: Promise<Sqlite3Static> | null = null

function sqlite(): Promise<Sqlite3Static> {
  sqlitePromise ??= import("@sqlite.org/sqlite-wasm").then(
    ({ default: sqlite3InitModule }) =>
      sqlite3InitModule({
        print: () => undefined,
        printErr: (message) => console.warn(`[sqlite-wasm] ${String(message)}`),
      })
  )
  return sqlitePromise
}

function validateCanonicalFile(connection: EidosFileConnection): void {
  const result = validateEidosFile(connection)
  if (!result.valid) {
    throw new EidosFileError(
      "not-eidos-file",
      result.errors.map((issue) => issue.message).join("; ") ||
        "This SQLite file is not an Eidos File"
    )
  }
}

/**
 * Browser runtime for small-to-medium files and embedders.
 *
 * It runs SQLite WASM in the current JavaScript realm. Hosts with long-running
 * or very large workloads can put the same adapter behind a Worker without
 * changing the data-source or view contracts.
 */
export class EidosFileBrowserRuntime implements EidosFileRuntimeAdapter {
  async open(
    read: EidosFileReadResult,
    options: { signal?: AbortSignal } = {}
  ): Promise<EidosFileDocument> {
    abortIfNeeded(options.signal)
    if (!hasEidosFileSqliteHeader(read.bytes)) {
      throw new EidosFileError(
        "not-eidos-file",
        "Input does not have a SQLite 3 header"
      )
    }
    const sqlite3 = await sqlite()
    abortIfNeeded(options.signal)
    const path = `/eidos-${randomId()}.eidos`
    sqlite3.capi.sqlite3_js_posix_create_file(path, read.bytes)
    const database = new sqlite3.oo1.DB(path, "w")
    const connection = new SQLiteWasmEidosFileConnection(database, sqlite3)
    try {
      connection.exec(
        "PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;"
      )
      validateCanonicalFile(connection)
      const runtime = new EidosFileRuntime(connection, true)
      runtime.optimizeViewQueries()
      const source = new EidosFileRuntimeDataSource(
        runtime,
        read.descriptor.name
      )
      let closed = false
      return {
        source,
        async exportBytes(exportOptions = {}) {
          abortIfNeeded(exportOptions.signal)
          if (closed) {
            throw new EidosFileHostError("closed", "The Eidos File is closed")
          }
          const integrity = connection.get<{ integrity_check: string }>(
            "PRAGMA integrity_check"
          )?.integrity_check
          if (integrity !== "ok") {
            throw new EidosFileHostError(
              "write-failed",
              `SQLite integrity check failed: ${integrity ?? "unknown"}`
            )
          }
          return copyBytes(sqlite3.capi.sqlite3_js_db_export(database))
        },
        close() {
          if (closed) return
          closed = true
          runtime.close()
        },
      }
    } catch (error) {
      connection.close()
      throw error
    }
  }
}

export class IndexedDbEidosFileRecoveryStore implements EidosFileRecoveryStore {
  constructor(
    private readonly databaseName = "eidos-file-sdk",
    private readonly storeName = "recovery"
  ) {}

  async load(id: string): Promise<EidosFileRecoverySnapshot | null> {
    return this.withStore("readonly", (store) => store.get(id))
  }

  async save(snapshot: EidosFileRecoverySnapshot): Promise<void> {
    await this.withStore("readwrite", (store) => store.put(snapshot))
  }

  async delete(id: string): Promise<void> {
    await this.withStore("readwrite", (store) => store.delete(id))
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.storeName)) {
          request.result.createObjectStore(this.storeName, { keyPath: "id" })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const database = await this.openDatabase()
    try {
      const request = operation(
        database.transaction(this.storeName, mode).objectStore(this.storeName)
      )
      return await new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      database.close()
    }
  }
}
