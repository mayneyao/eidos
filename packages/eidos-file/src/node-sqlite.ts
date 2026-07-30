import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs"
import path from "node:path"
import {
  constants,
  DatabaseSync,
  type DatabaseSyncOptions,
  type StatementSync,
} from "node:sqlite"

import type {
  ConnectionCapabilities,
  ConnectionPort,
  ConnectionSnapshot,
  QueryResult,
  RunResult,
  ScalarDefinition,
  SnapshotContext,
  SqlValue,
} from "./adapter-contract"
import type {
  EidosFileConnection,
  EidosFileRunResult,
  EidosFileSqlParams,
  EidosFileSqlPrimitive,
} from "./connection"
import {
  assertExactConnectionBindings,
  EidosAdapterError,
  exactConnectionBindingCount,
  nativeToSqlValue,
  sqlValueToNative,
} from "./connection-port"
import { EIDOS_FILE_EXTENSION, SQLITE_HEADER } from "./constants"
import { EidosFileError } from "./errors"
import { MemoryByteSource, parseNonNegativeInt64 } from "./protocol-types"
import { EidosFileRuntime } from "./runtime"
import { initializeEidosFileSchema } from "./schema"
import type { CreateEidosFileOptions } from "./types"
import { validateEidosFile } from "./validation"

const DEFAULT_STATEMENT_CACHE_SIZE = 128
const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const DEFAULT_MAX_RESULT_ROWS = 100_000
const DEFAULT_MAX_RESULT_BYTES = 16 * 1024 * 1024
const READ_ONLY_PRAGMAS = new Set([
  "application_id",
  "collation_list",
  "compile_options",
  "data_version",
  "database_list",
  "foreign_key_check",
  "foreign_key_list",
  "foreign_keys",
  "function_list",
  "index_info",
  "index_list",
  "index_xinfo",
  "integrity_check",
  "module_list",
  "page_count",
  "page_size",
  "pragma_list",
  "quick_check",
  "table_info",
  "table_list",
  "table_xinfo",
  "trusted_schema",
  "user_version",
])
const READ_ONLY_PRAGMAS_WITH_ARGUMENTS = new Set([
  "foreign_key_check",
  "foreign_key_list",
  "index_info",
  "index_list",
  "index_xinfo",
  "integrity_check",
  "quick_check",
  "table_info",
  "table_xinfo",
])

interface Electron43DatabaseSync extends DatabaseSync {
  readonly limits: {
    length: number
    sqlLength: number
    variableNumber: number
  }
  serialize(dbName?: string): Uint8Array
}

function electron43Database(database: DatabaseSync): Electron43DatabaseSync {
  return database as Electron43DatabaseSync
}

function sqliteValue(value: unknown): unknown {
  if (
    typeof value === "bigint" &&
    value >= BigInt(Number.MIN_SAFE_INTEGER) &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(value)
  }
  return value
}

function sqliteRow<T extends object>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, sqliteValue(value)])
  ) as T
}

function nodeSqliteBindings(
  bindings: readonly SqlValue[]
): EidosFileSqlPrimitive[] {
  return bindings.map(sqlValueToNative)
}

function prepareObjectStatement(
  database: DatabaseSync,
  sql: string
): StatementSync {
  const statement = database.prepare(sql)
  statement.setReadBigInts(true)
  statement.setAllowBareNamedParameters(false)
  statement.setAllowUnknownNamedParameters(false)
  return statement
}

function prepareArrayStatement(
  database: DatabaseSync,
  sql: string
): StatementSync {
  const statement = prepareObjectStatement(database, sql)
  statement.setReturnArrays(true)
  return statement
}

function openDatabase(
  filePath: string,
  options: DatabaseSyncOptions = {}
): DatabaseSync {
  return new DatabaseSync(filePath, {
    allowExtension: false,
    defensive: true,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
    readBigInts: true,
    timeout: DEFAULT_BUSY_TIMEOUT_MS,
    ...options,
  })
}

export interface NodeSqliteEidosFileConnectionOptions {
  statementCacheSize?: number
}

export interface NodeSqliteConnectionPortOptions {
  busyTimeoutMs?: number
  maxResultRows?: number
  maxResultBytes?: number
  /** Must match the DatabaseSync readOnly open option for source bindings. */
  readOnly?: boolean
}

/** Compatibility connection for the synchronous pre-1.0 EidosFileRuntime. */
export class NodeSqliteEidosFileConnection implements EidosFileConnection {
  readonly capabilities = {
    int64: true,
    json1: true,
    returning: true,
    interrupt: false,
    scalarFunctions: true,
  } as const

  private readonly statements = new Map<string, StatementSync>()
  private readonly statementCacheSize: number
  private transactionDepth = 0
  private savepointSequence = 0

  constructor(
    readonly database: DatabaseSync,
    options: NodeSqliteEidosFileConnectionOptions = {}
  ) {
    const requestedSize = options.statementCacheSize
    this.statementCacheSize =
      typeof requestedSize === "number" && Number.isFinite(requestedSize)
        ? Math.max(0, Math.trunc(requestedSize))
        : DEFAULT_STATEMENT_CACHE_SIZE
  }

  private prepare(sql: string): StatementSync {
    const cached = this.statements.get(sql)
    if (cached) {
      this.statements.delete(sql)
      this.statements.set(sql, cached)
      return cached
    }
    const statement = prepareObjectStatement(this.database, sql)
    if (this.statementCacheSize === 0) return statement
    this.statements.set(sql, statement)
    if (this.statements.size > this.statementCacheSize) {
      const oldest = this.statements.keys().next().value
      if (typeof oldest === "string") this.statements.delete(oldest)
    }
    return statement
  }

  private clearStatements(): void {
    this.statements.clear()
  }

  exec(sql: string): void {
    this.clearStatements()
    this.database.exec(sql)
  }

  query<T extends object>(sql: string, params: EidosFileSqlParams = []): T[] {
    return (this.prepare(sql).all(...params) as T[]).map(sqliteRow)
  }

  get<T extends object>(
    sql: string,
    params: EidosFileSqlParams = []
  ): T | undefined {
    const row = this.prepare(sql).get(...params) as T | undefined
    return row ? sqliteRow(row) : undefined
  }

  run(sql: string, params: EidosFileSqlParams = []): EidosFileRunResult {
    const result = this.prepare(sql).run(...params)
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    }
  }

  runMany(sql: string, parameterSets: readonly EidosFileSqlParams[]): void {
    const statement = this.prepare(sql)
    for (const params of parameterSets) statement.run(...params)
  }

  registerFunction(
    name: string,
    operation: (...values: EidosFileSqlPrimitive[]) => EidosFileSqlPrimitive,
    arity = operation.length
  ): void {
    const scalar = (...values: EidosFileSqlPrimitive[]) => operation(...values)
    Object.defineProperty(scalar, "length", { value: arity })
    this.database.function(
      name,
      {
        deterministic: true,
        directOnly: false,
        useBigIntArguments: true,
        varargs: false,
      },
      scalar
    )
  }

  transaction<T>(operation: () => T): T {
    const outer = this.transactionDepth === 0
    const savepoint = `eidos_legacy_${++this.savepointSequence}`
    this.database.exec(outer ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`)
    this.transactionDepth += 1
    try {
      const result = operation()
      this.database.exec(outer ? "COMMIT" : `RELEASE ${savepoint}`)
      return result
    } catch (error) {
      this.database.exec(
        outer ? "ROLLBACK" : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`
      )
      throw error
    } finally {
      this.transactionDepth -= 1
    }
  }

  dataVersion(): number {
    const row = prepareArrayStatement(
      this.database,
      "PRAGMA data_version"
    ).get()
    const value = (row as unknown[] | undefined)?.[0]
    return typeof value === "bigint" ? Number(value) : Number(value ?? 0)
  }

  interrupt(): void {
    // node:sqlite has no public sqlite3_interrupt() binding. Eidos Lite runs
    // each connection in a utility process and cancels by terminating it.
  }

  close(): void {
    this.clearStatements()
    if (this.database.isOpen) this.database.close()
  }
}

/** EA-Connection-1.0 binding for Electron 43's Node 24 node:sqlite runtime. */
export class NodeSqliteConnectionPort implements ConnectionPort {
  private readonly connectionCapabilities: ConnectionCapabilities
  private readonly maxResultRows: number
  private readonly maxResultBytes: number
  private readonly readOnly: boolean
  private readonly transactionModes: Array<"read" | "write"> = []
  private readonly snapshots = new Set<MemoryByteSource>()
  private readonly mutationAuthorizerCodes = new Set<number>([
    constants.SQLITE_CREATE_INDEX,
    constants.SQLITE_CREATE_TABLE,
    constants.SQLITE_CREATE_TEMP_INDEX,
    constants.SQLITE_CREATE_TEMP_TABLE,
    constants.SQLITE_CREATE_TEMP_TRIGGER,
    constants.SQLITE_CREATE_TEMP_VIEW,
    constants.SQLITE_CREATE_TRIGGER,
    constants.SQLITE_CREATE_VIEW,
    constants.SQLITE_DELETE,
    constants.SQLITE_DROP_INDEX,
    constants.SQLITE_DROP_TABLE,
    constants.SQLITE_DROP_TEMP_INDEX,
    constants.SQLITE_DROP_TEMP_TABLE,
    constants.SQLITE_DROP_TEMP_TRIGGER,
    constants.SQLITE_DROP_TEMP_VIEW,
    constants.SQLITE_DROP_TRIGGER,
    constants.SQLITE_DROP_VIEW,
    constants.SQLITE_INSERT,
    constants.SQLITE_TRANSACTION,
    constants.SQLITE_UPDATE,
    constants.SQLITE_ATTACH,
    constants.SQLITE_DETACH,
    constants.SQLITE_ALTER_TABLE,
    constants.SQLITE_REINDEX,
    constants.SQLITE_ANALYZE,
    constants.SQLITE_CREATE_VTABLE,
    constants.SQLITE_DROP_VTABLE,
    constants.SQLITE_SAVEPOINT,
  ])
  private localCommit = 0
  private savepointSequence = 0
  private internalAuthorizationDepth = 0
  private mainReadEstablished = false
  private closed = false

  constructor(
    readonly database: DatabaseSync,
    options: NodeSqliteConnectionPortOptions = {}
  ) {
    const busyTimeoutMs = positiveLimit(
      options.busyTimeoutMs,
      DEFAULT_BUSY_TIMEOUT_MS,
      "busyTimeoutMs"
    )
    this.maxResultRows = positiveLimit(
      options.maxResultRows,
      DEFAULT_MAX_RESULT_ROWS,
      "maxResultRows"
    )
    this.maxResultBytes = positiveLimit(
      options.maxResultBytes,
      DEFAULT_MAX_RESULT_BYTES,
      "maxResultBytes"
    )
    this.readOnly = options.readOnly ?? false
    const electronDatabase = electron43Database(database)
    if (
      typeof electronDatabase.serialize !== "function" ||
      typeof electronDatabase.limits !== "object" ||
      typeof database.setAuthorizer !== "function"
    ) {
      throw new EidosAdapterError(
        "unsupported-capability",
        "node:sqlite from Node 24.16.0 or later is required"
      )
    }
    database.enableDefensive(true)
    database.exec(
      `PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA busy_timeout = ${busyTimeoutMs}`
    )
    const sqliteVersion = this.runMandatoryProbes()
    database.setAuthorizer((actionCode, firstArgument, secondArgument) => {
      const readOnlyContext =
        this.readOnly || this.transactionModes.at(-1) === "read"
      if (this.internalAuthorizationDepth === 0 && readOnlyContext) {
        if (
          this.mutationAuthorizerCodes.has(actionCode) ||
          (actionCode === constants.SQLITE_PRAGMA &&
            !isReadOnlyPragma(firstArgument, secondArgument))
        ) {
          return constants.SQLITE_DENY
        }
      }
      return constants.SQLITE_OK
    })
    if (this.readOnly) this.execInternal("PRAGMA query_only = ON")
    const limits = electronDatabase.limits
    this.connectionCapabilities = {
      adapterVersion: "1.0",
      sqliteVersion,
      json1: true,
      returning: true,
      strict: true,
      int64: true,
      scalarFunctions: true,
      directOnlyFunctions: true,
      interrupt: false,
      snapshot: true,
      defensiveMode: true,
      busyTimeoutMs,
      maxVariables: databaseLimit(limits.variableNumber, "variableNumber"),
      maxSqlBytes: databaseLimit(limits.sqlLength, "sqlLength"),
      maxValueBytes: databaseLimit(limits.length, "length"),
      maxResultRows: this.maxResultRows,
      maxResultBytes: this.maxResultBytes,
    }
  }

  capabilities(): ConnectionCapabilities {
    this.assertOpen()
    return { ...this.connectionCapabilities }
  }

  execSchema(sql: string): void {
    this.assertOpen()
    if (/(?:^|;)\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(sql)) {
      throw new EidosAdapterError(
        "invalid-argument",
        "Transaction-control SQL is owned by ConnectionPort.transaction"
      )
    }
    if (this.readOnly || this.transactionModes.at(-1) === "read") {
      throw new EidosAdapterError(
        "read-only",
        "Schema statements are forbidden on a read-only connection or transaction"
      )
    }
    try {
      this.database.exec(sql)
    } catch (error) {
      throw mapNodeSqliteError(error, this.inReadOnlyContext())
    }
  }

  query(sql: string, bindings: readonly SqlValue[] = []): QueryResult {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    try {
      const statement = prepareArrayStatement(this.database, sql)
      const columns = statement
        .columns()
        .map((column) => ({ name: column.name }))
      if (columns.length === 0) {
        throw new EidosAdapterError(
          "invalid-argument",
          "query requires one row-producing statement"
        )
      }
      const rows: SqlValue[][] = []
      for (const nativeRow of statement.iterate(
        ...nodeSqliteBindings(bindings)
      ) as unknown as Iterable<unknown[]>) {
        if (rows.length >= this.maxResultRows) {
          throw new EidosAdapterError(
            "resource-limit",
            "Query result exceeds maxResultRows"
          )
        }
        rows.push(nativeRow.map(nativeToSqlValue))
      }
      const result = { columns, rows }
      this.assertResultSize(result)
      this.noteRead(sql)
      return result
    } catch (error) {
      throw mapNodeSqliteError(error, this.inReadOnlyContext())
    }
  }

  get(
    sql: string,
    bindings: readonly SqlValue[] = []
  ): { columns: Array<{ name: string }>; row: SqlValue[] | null } {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    try {
      const statement = prepareArrayStatement(this.database, sql)
      const columns = statement
        .columns()
        .map((column) => ({ name: column.name }))
      if (columns.length === 0) {
        throw new EidosAdapterError(
          "invalid-argument",
          "get requires one row-producing statement"
        )
      }
      const native = statement.get(...nodeSqliteBindings(bindings)) as
        | unknown[]
        | undefined
      const result = {
        columns,
        row: native ? native.map(nativeToSqlValue) : null,
      }
      this.assertResultSize(result)
      this.noteRead(sql)
      return result
    } catch (error) {
      throw mapNodeSqliteError(error, this.inReadOnlyContext())
    }
  }

  run(sql: string, bindings: readonly SqlValue[] = []): RunResult {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    try {
      const statement = prepareArrayStatement(this.database, sql)
      if (statement.columns().length > 0) {
        throw new EidosAdapterError(
          "invalid-argument",
          "run requires one no-result statement"
        )
      }
      const result = statement.run(...nodeSqliteBindings(bindings))
      return {
        changes: String(result.changes),
        lastInsertRowid: String(result.lastInsertRowid),
      }
    } catch (error) {
      throw mapNodeSqliteError(error, this.inReadOnlyContext())
    }
  }

  runMany(
    sql: string,
    bindingSets: readonly (readonly SqlValue[])[]
  ): RunResult[] {
    this.assertOpen()
    const expectedBindings = exactConnectionBindingCount(sql)
    for (const bindings of bindingSets) {
      if (bindings.length !== expectedBindings) {
        throw new EidosAdapterError(
          "invalid-argument",
          `Statement requires ${expectedBindings} bindings, received ${bindings.length}`
        )
      }
    }
    try {
      const statement = prepareArrayStatement(this.database, sql)
      if (statement.columns().length > 0) {
        throw new EidosAdapterError(
          "invalid-argument",
          "runMany requires one no-result statement"
        )
      }
      return bindingSets.map((bindings) => {
        const result = statement.run(...nodeSqliteBindings(bindings))
        return {
          changes: String(result.changes),
          lastInsertRowid: String(result.lastInsertRowid),
        }
      })
    } catch (error) {
      throw mapNodeSqliteError(error, this.inReadOnlyContext())
    }
  }

  registerScalar(
    definition: ScalarDefinition,
    operation: (...values: SqlValue[]) => SqlValue
  ): void {
    this.assertOpen()
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(definition.name) ||
      !Number.isInteger(definition.arity) ||
      definition.arity < 0 ||
      definition.arity > 127 ||
      definition.deterministic !== true ||
      definition.directOnly !== true
    ) {
      throw new EidosAdapterError(
        "invalid-argument",
        "Invalid ScalarDefinition"
      )
    }
    try {
      const scalar = (...values: unknown[]) => {
        try {
          return sqlValueToNative(operation(...values.map(nativeToSqlValue)))
        } catch {
          throw new EidosAdapterError(
            "sql-function-error",
            "Deterministic scalar function failed"
          )
        }
      }
      Object.defineProperty(scalar, "length", { value: definition.arity })
      this.database.function(
        definition.name,
        {
          deterministic: true,
          directOnly: true,
          useBigIntArguments: true,
          varargs: false,
        },
        scalar
      )
    } catch (error) {
      throw mapNodeSqliteError(error)
    }
  }

  transaction<T>(mode: "read" | "write", operation: () => T): T
  transaction<T>(
    mode: "read" | "write",
    operation: () => Promise<T>
  ): Promise<T>
  transaction<T>(
    mode: "read" | "write",
    operation: () => T | Promise<T>
  ): T | Promise<T> {
    this.assertOpen()
    if (mode !== "read" && mode !== "write") {
      throw new EidosAdapterError(
        "invalid-argument",
        "Invalid transaction mode"
      )
    }
    const parent = this.transactionModes.at(-1)
    if (parent === "read" && mode === "write") {
      throw new EidosAdapterError(
        "read-only",
        "Cannot escalate a read transaction"
      )
    }
    if (mode === "write" && this.readOnly) {
      throw new EidosAdapterError("read-only", "Connection is read-only")
    }
    const outer = this.transactionModes.length === 0
    const effectiveMode = parent ?? mode
    const savepoint = `eidos_adapter_${++this.savepointSequence}`
    let started = false
    const noCallbackFailure = Symbol("no-callback-failure")
    let callbackFailure: unknown = noCallbackFailure
    try {
      this.execInternal(
        outer
          ? effectiveMode === "write"
            ? "BEGIN IMMEDIATE"
            : "BEGIN DEFERRED"
          : `SAVEPOINT ${savepoint}`
      )
      started = true
      if (outer && effectiveMode === "read") {
        this.execInternal("PRAGMA query_only = ON")
      }
      this.transactionModes.push(effectiveMode)
      if (outer) this.mainReadEstablished = false
      let result: T | Promise<T>
      try {
        result = operation()
      } catch (error) {
        callbackFailure = error
        throw error
      }
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            try {
              this.commitTransaction(outer, effectiveMode, savepoint)
              return value
            } catch (error) {
              this.rollbackTransaction(outer, effectiveMode, savepoint)
              throw mapNodeSqliteError(error, effectiveMode === "read")
            } finally {
              this.transactionModes.pop()
              if (outer) this.mainReadEstablished = false
            }
          },
          (error: unknown) => {
            try {
              this.rollbackTransaction(outer, effectiveMode, savepoint)
              throw error
            } finally {
              this.transactionModes.pop()
              if (outer) this.mainReadEstablished = false
            }
          }
        )
      }
      this.commitTransaction(outer, effectiveMode, savepoint)
      this.transactionModes.pop()
      if (outer) this.mainReadEstablished = false
      return result
    } catch (error) {
      try {
        if (started) this.rollbackTransaction(outer, effectiveMode, savepoint)
        throw callbackFailure === error && callbackFailure !== noCallbackFailure
          ? error
          : mapNodeSqliteError(error, effectiveMode === "read")
      } finally {
        if (started) this.transactionModes.pop()
        if (outer) this.mainReadEstablished = false
      }
    }
  }

  dataVersion(): string {
    this.assertOpen()
    try {
      const row = this.withInternalAuthorization(() =>
        prepareArrayStatement(this.database, "PRAGMA data_version").get()
      )
      const external = (row as unknown[] | undefined)?.[0]
      return `${this.localCommit}:${String(external ?? 0)}`
    } catch (error) {
      throw mapNodeSqliteError(error)
    }
  }

  interrupt(): void {
    this.assertOpen()
    throw new EidosAdapterError(
      "unsupported-capability",
      "node:sqlite uses the required utility-process terminate cancellation profile"
    )
  }

  async snapshot(context: SnapshotContext): Promise<ConnectionSnapshot> {
    this.assertOpen()
    if (
      this.transactionModes.length !== 1 ||
      this.transactionModes[0] !== "read" ||
      !this.mainReadEstablished
    ) {
      throw new EidosAdapterError(
        "invalid-argument",
        "snapshot requires an established outer read transaction"
      )
    }
    if (context.cancellation.cancelled()) {
      throw new EidosAdapterError("cancelled", "Snapshot was cancelled")
    }
    const startedAt = Date.now()
    if (
      context.deadlineMilliseconds !== undefined &&
      (!Number.isSafeInteger(context.deadlineMilliseconds) ||
        context.deadlineMilliseconds < 1)
    ) {
      throw new EidosAdapterError(
        "invalid-argument",
        "deadlineMilliseconds must be a positive safe integer"
      )
    }
    const maxBytes = parseNonNegativeInt64(context.maxBytes, "maxBytes")
    const pageCount = this.pragmaBigInt("page_count")
    const pageSize = this.pragmaBigInt("page_size")
    if (pageCount * pageSize > maxBytes) {
      throw new EidosAdapterError(
        "resource-limit",
        "Database snapshot exceeds maxBytes"
      )
    }
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(
        this.withInternalAuthorization(() =>
          electron43Database(this.database).serialize("main")
        )
      )
    } catch (error) {
      throw mapNodeSqliteError(error, true)
    }
    if (context.cancellation.cancelled()) {
      throw new EidosAdapterError("cancelled", "Snapshot was cancelled")
    }
    if (
      context.deadlineMilliseconds !== undefined &&
      Date.now() - startedAt >= context.deadlineMilliseconds
    ) {
      throw new EidosAdapterError(
        "deadline-exceeded",
        "Snapshot deadline was exceeded"
      )
    }
    if (BigInt(bytes.byteLength) > maxBytes) {
      throw new EidosAdapterError(
        "resource-limit",
        "Database snapshot exceeds maxBytes"
      )
    }
    const source = new MemoryByteSource(bytes)
    this.snapshots.add(source)
    let released = false
    return {
      bytes: source,
      release: async () => {
        if (released) return
        released = true
        source.release()
        this.snapshots.delete(source)
      },
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const snapshot of this.snapshots) snapshot.release()
    this.snapshots.clear()
    if (this.database.isOpen) {
      this.database.setAuthorizer(null)
      this.database.close()
    }
  }

  private inReadOnlyContext(): boolean {
    return this.readOnly || this.transactionModes.at(-1) === "read"
  }

  private execInternal(sql: string): void {
    this.withInternalAuthorization(() => this.database.exec(sql))
  }

  private withInternalAuthorization<T>(operation: () => T): T {
    this.internalAuthorizationDepth += 1
    try {
      return operation()
    } finally {
      this.internalAuthorizationDepth -= 1
    }
  }

  private commitTransaction(
    outer: boolean,
    mode: "read" | "write",
    savepoint: string
  ): void {
    this.execInternal(
      outer
        ? mode === "read"
          ? this.readOnly
            ? "COMMIT"
            : "PRAGMA query_only = OFF; COMMIT"
          : "COMMIT"
        : `RELEASE ${savepoint}`
    )
    if (outer && mode === "write") this.localCommit += 1
  }

  private rollbackTransaction(
    outer: boolean,
    mode: "read" | "write",
    savepoint: string
  ): void {
    try {
      this.execInternal(
        outer
          ? mode === "read"
            ? this.readOnly
              ? "ROLLBACK"
              : "PRAGMA query_only = OFF; ROLLBACK"
            : "ROLLBACK"
          : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`
      )
    } catch {
      throw new EidosAdapterError(
        "transport-fatal",
        "Transaction rollback could not be proven",
        false,
        true
      )
    }
  }

  private assertOpen(): void {
    if (this.closed || !this.database.isOpen) {
      throw new EidosAdapterError("adapter-closed", "Connection is closed")
    }
  }

  private noteRead(sql: string): void {
    if (
      this.transactionModes.length === 1 &&
      this.transactionModes[0] === "read" &&
      !/^\s*PRAGMA\b/i.test(sql) &&
      !/\btemp(?:\.|\s)/i.test(sql)
    ) {
      this.mainReadEstablished = true
    }
  }

  private assertResultSize(value: unknown): void {
    let binaryBytes = 0
    const json = JSON.stringify(value, (_key, entry) => {
      if (entry instanceof Uint8Array) {
        binaryBytes += entry.byteLength
        return null
      }
      return entry
    })
    const bytes = binaryBytes + Buffer.byteLength(json, "utf8")
    if (bytes > this.maxResultBytes) {
      throw new EidosAdapterError(
        "resource-limit",
        "Query result exceeds maxResultBytes"
      )
    }
  }

  private pragmaBigInt(
    name: "foreign_keys" | "page_count" | "page_size" | "trusted_schema"
  ): bigint {
    const row = this.withInternalAuthorization(() =>
      prepareArrayStatement(this.database, `PRAGMA ${name}`).get()
    )
    const value = (row as unknown[] | undefined)?.[0]
    return BigInt(value as bigint | number)
  }

  private runMandatoryProbes(): string {
    try {
      const versionRow = prepareArrayStatement(
        this.database,
        "SELECT sqlite_version(), sqlite_source_id()"
      ).get() as unknown as [string, string]
      if (compareSqliteVersion(versionRow[0], "3.45.0") < 0 || !versionRow[1]) {
        throw new EidosAdapterError(
          "unsupported-capability",
          "SQLite 3.45.0 or later with source ID is required"
        )
      }
      const json = prepareArrayStatement(
        this.database,
        "SELECT json_valid('[]'), json_array_length('[1,2]')"
      ).get() as unknown as [bigint, bigint]
      const foreignKeys = this.pragmaBigInt("foreign_keys")
      const trustedSchema = this.pragmaBigInt("trusted_schema")
      const values = prepareArrayStatement(
        this.database,
        "SELECT CAST('-9223372036854775808' AS INTEGER), " +
          "CAST('9223372036854775807' AS INTEGER), X'000102FF'"
      ).get() as unknown as [bigint, bigint, Uint8Array]
      if (
        json[0] !== 1n ||
        json[1] !== 2n ||
        foreignKeys !== 1n ||
        trustedSchema !== 0n ||
        values[0] !== -9_223_372_036_854_775_808n ||
        values[1] !== 9_223_372_036_854_775_807n ||
        Buffer.from(values[2]).toString("hex") !== "000102ff"
      ) {
        throw new EidosAdapterError(
          "unsupported-capability",
          "SQLite mandatory value/PRAGMA probes failed"
        )
      }
      this.database.function(
        "eidos_adapter_probe_scalar",
        {
          deterministic: true,
          directOnly: true,
          useBigIntArguments: true,
          varargs: false,
        },
        (value) => value
      )
      const storage = prepareArrayStatement(
        this.database,
        "SELECT " +
          "typeof(eidos_adapter_probe_scalar(NULL)), " +
          "typeof(eidos_adapter_probe_scalar(1)), " +
          "typeof(eidos_adapter_probe_scalar(1.5)), " +
          "typeof(eidos_adapter_probe_scalar('x')), " +
          "typeof(eidos_adapter_probe_scalar(X'0001')), " +
          "hex(eidos_adapter_probe_scalar(X'0001'))"
      ).get() as unknown as [string, string, string, string, string, string]
      if (storage.join(",") !== "null,integer,real,text,blob,0001") {
        throw new EidosAdapterError(
          "unsupported-capability",
          "Scalar function storage-class probe failed"
        )
      }
      this.execInternal("SAVEPOINT eidos_adapter_probe_transaction")
      try {
        this.database.exec(
          "CREATE TEMP TABLE eidos_adapter_probe(" +
            "id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT"
        )
        const returned = prepareArrayStatement(
          this.database,
          "INSERT INTO eidos_adapter_probe(value) VALUES ('ok') RETURNING id, value"
        ).get() as unknown as [bigint, string]
        this.database.exec("DROP TABLE eidos_adapter_probe")
        if (returned[0] !== 1n || returned[1] !== "ok") {
          throw new EidosAdapterError(
            "unsupported-capability",
            "SQLite STRICT/RETURNING probe failed"
          )
        }
        this.execInternal("RELEASE eidos_adapter_probe_transaction")
      } catch (error) {
        this.execInternal(
          "ROLLBACK TO eidos_adapter_probe_transaction; RELEASE eidos_adapter_probe_transaction"
        )
        throw error
      }
      return versionRow[0]
    } catch (error) {
      const mapped = mapNodeSqliteError(error)
      if (mapped instanceof EidosAdapterError) throw mapped
      throw new EidosAdapterError(
        "unsupported-capability",
        "SQLite mandatory probes failed"
      )
    }
  }
}

function positiveLimit(
  value: number | undefined,
  fallback: number,
  label: string
): number {
  const limit = value ?? fallback
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2_147_483_647) {
    throw new EidosAdapterError(
      "invalid-argument",
      `${label} must be a positive JSON integer`
    )
  }
  return limit
}

function databaseLimit(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new EidosAdapterError(
      "unsupported-capability",
      `node:sqlite did not expose a valid ${label} limit`
    )
  }
  return value
}

function compareSqliteVersion(left: string, right: string): number {
  const a = left.split(".").map(Number)
  const b = right.split(".").map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function isReadOnlyPragma(
  name: string | null,
  argument: string | null
): boolean {
  const normalizedName = name?.toLowerCase()
  if (!normalizedName || !READ_ONLY_PRAGMAS.has(normalizedName)) return false
  return (
    argument === null || READ_ONLY_PRAGMAS_WITH_ARGUMENTS.has(normalizedName)
  )
}

function mapNodeSqliteError(error: unknown, readOnlyContext = false): Error {
  if (error instanceof EidosAdapterError) return error
  if (!(error instanceof Error)) {
    return new EidosAdapterError("io-error", "Unknown SQLite Adapter failure")
  }
  const systemCode = (error as { code?: unknown }).code
  if (systemCode === "ENOENT") {
    return new EidosAdapterError("io-error", "SQLite database was not found")
  }
  if (systemCode === "EACCES" || systemCode === "EPERM") {
    return new EidosAdapterError(
      "permission-denied",
      "SQLite database access was denied"
    )
  }
  if (
    systemCode === "ERR_INVALID_STATE" &&
    /closed|not open/i.test(error.message)
  ) {
    return new EidosAdapterError("adapter-closed", "Connection is closed")
  }
  const extended = (error as { errcode?: unknown }).errcode
  const extendedCode =
    typeof extended === "number" && Number.isInteger(extended)
      ? extended
      : undefined
  const primaryCode =
    extendedCode === undefined ? undefined : extendedCode & 0xff
  const mapped = (
    code: ConstructorParameters<typeof EidosAdapterError>[0],
    message: string,
    retryable = false,
    fatal = false
  ) =>
    new EidosAdapterError(
      code,
      message,
      retryable,
      fatal,
      primaryCode,
      extendedCode
    )
  switch (primaryCode) {
    case 5:
      return mapped("busy", "SQLite is busy", true)
    case 6:
      return mapped("locked", "SQLite is locked", true)
    case 7:
      return mapped("out-of-memory", "SQLite ran out of memory", false, true)
    case 8:
      return mapped("read-only", "SQLite connection is read-only")
    case 9:
      return mapped("cancelled", "SQLite operation was interrupted")
    case 10:
      return mapped("io-error", "SQLite I/O failed")
    case 11:
      return mapped("corrupt", "SQLite database is corrupt", false, true)
    case 18:
      return mapped("resource-limit", "SQLite value exceeds a resource limit")
    case 19:
      return mapped("constraint", "SQLite constraint failed")
    case 23:
      return mapped(
        readOnlyContext ? "read-only" : "permission-denied",
        readOnlyContext
          ? "Mutating statement is forbidden in a read transaction"
          : "SQLite statement was denied by the authorizer"
      )
    case 25:
      return mapped("invalid-argument", error.message)
    case 26:
      return mapped(
        "not-a-database",
        "Input is not a SQLite database",
        false,
        true
      )
  }
  if (
    error instanceof RangeError ||
    error instanceof TypeError ||
    /bind|parameter|statement/i.test(error.message)
  ) {
    return mapped("invalid-argument", error.message)
  }
  if (systemCode === "ERR_SQLITE_ERROR") {
    return mapped("sql-error", error.message)
  }
  return mapped("io-error", error.message)
}

export function hasSqliteHeader(filePath: string): boolean {
  if (!existsSync(filePath) || statSync(filePath).size < SQLITE_HEADER.length) {
    return false
  }
  const descriptor = openSync(filePath, "r")
  try {
    const header = Buffer.alloc(SQLITE_HEADER.length)
    readSync(descriptor, header, 0, header.length, 0)
    return header.toString("binary") === SQLITE_HEADER
  } finally {
    closeSync(descriptor)
  }
}

export function createEidosFile(
  filePath: string,
  options: CreateEidosFileOptions = {}
): EidosFileRuntime {
  assertEidosFileExtension(filePath)
  if (existsSync(filePath) && statSync(filePath).size > 0) {
    throw new EidosFileError(
      "file-exists",
      `Eidos File already exists: ${filePath}`
    )
  }
  const connection = new NodeSqliteEidosFileConnection(openDatabase(filePath))
  try {
    connection.exec(
      "PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA journal_mode = DELETE;"
    )
    initializeEidosFileSchema(connection, options)
    const runtime = new EidosFileRuntime(connection, true)
    if (options.defaultTable) runtime.createTable(options.defaultTable)
    return runtime
  } catch (error) {
    connection.close()
    throw error
  }
}

export function openEidosFile(
  filePath: string,
  options: {
    /** @deprecated Final Eidos File 1.0 does not migrate pre-standard drafts. */
    migrate?: false
    readonly?: boolean
  } = {}
): EidosFileRuntime {
  assertEidosFileExtension(filePath)
  if (!existsSync(filePath)) {
    throw new EidosFileError(
      "file-not-found",
      `Eidos File not found: ${filePath}`
    )
  }
  if (!hasSqliteHeader(filePath)) {
    throw new EidosFileError("invalid-sqlite", `Not a SQLite file: ${filePath}`)
  }
  const connection = new NodeSqliteEidosFileConnection(
    openDatabase(filePath, { readOnly: options.readonly ?? false })
  )
  try {
    connection.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;")
    const result = validateEidosFile(connection)
    if (!result.valid) {
      throw new EidosFileError(
        "not-eidos-file",
        result.errors.map((issue) => issue.message).join("; ")
      )
    }
    return new EidosFileRuntime(connection, true)
  } catch (error) {
    connection.close()
    throw error
  }
}

export function inspectEidosFile(filePath: string) {
  if (!hasSqliteHeader(filePath)) {
    return {
      valid: false,
      metadata: null,
      tables: [],
      errors: [{ code: "invalid-sqlite", message: "Not a SQLite file" }],
      warnings: [],
    }
  }
  const connection = new NodeSqliteEidosFileConnection(
    openDatabase(filePath, { readOnly: true })
  )
  try {
    connection.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;")
    return validateEidosFile(connection)
  } finally {
    connection.close()
  }
}

function assertEidosFileExtension(filePath: string): void {
  if (path.extname(filePath).toLowerCase() === EIDOS_FILE_EXTENSION) return
  throw new EidosFileError(
    "invalid-identifier",
    `Eidos Files must use the ${EIDOS_FILE_EXTENSION} extension`
  )
}
