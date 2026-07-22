import { existsSync, openSync, closeSync, readSync, statSync } from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

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
import { EidosFileRuntime } from "./runtime"
import { initializeEidosFileSchema } from "./schema"
import type { CreateEidosFileOptions } from "./types"
import { validateEidosFile } from "./validation"
import { MemoryByteSource, parseNonNegativeInt64 } from "./protocol-types"

const DEFAULT_STATEMENT_CACHE_SIZE = 128
const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const DEFAULT_MAX_RESULT_ROWS = 100_000
const DEFAULT_MAX_RESULT_BYTES = 16 * 1024 * 1024

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

function betterSqliteBindingArguments(
  bindings: readonly SqlValue[]
): unknown[] {
  if (bindings.length === 0) return []
  const named: Record<string, EidosFileSqlPrimitive> = {}
  bindings.forEach((value, index) => {
    // better-sqlite3 exposes SQLite's ?NNN parameters through its named-
    // parameter object API. The public ConnectionPort ABI remains positional.
    named[String(index + 1)] = sqlValueToNative(value)
  })
  return [named]
}

export interface BetterSqlite3EidosFileConnectionOptions {
  statementCacheSize?: number
}

export interface BetterSqlite3ConnectionPortOptions {
  busyTimeoutMs?: number
  maxResultRows?: number
  maxResultBytes?: number
}

export class BetterSqlite3EidosFileConnection implements EidosFileConnection {
  readonly capabilities = {
    int64: true,
    json1: true,
    returning: true,
    interrupt: false,
    scalarFunctions: true,
  } as const

  private readonly statements = new Map<
    string,
    Database.Statement<unknown[], unknown>
  >()
  private readonly statementCacheSize: number

  constructor(
    readonly database: Database.Database,
    options: BetterSqlite3EidosFileConnectionOptions = {}
  ) {
    const requestedSize = options.statementCacheSize
    this.statementCacheSize =
      typeof requestedSize === "number" && Number.isFinite(requestedSize)
        ? Math.max(0, Math.trunc(requestedSize))
        : DEFAULT_STATEMENT_CACHE_SIZE
  }

  private prepare(sql: string): Database.Statement<unknown[], unknown> {
    const cached = this.statements.get(sql)
    if (cached) {
      this.statements.delete(sql)
      this.statements.set(sql, cached)
      return cached
    }
    const statement = this.database.prepare(sql).safeIntegers(true)
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
    return this.prepare(sql).run(...params)
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
    this.database.function(name, { deterministic: true }, scalar)
  }

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)()
  }

  dataVersion(): number {
    return (
      this.get<{ data_version: number }>("PRAGMA data_version")?.data_version ??
      0
    )
  }

  interrupt(): void {
    // better-sqlite3 executes synchronously on the calling thread and does not
    // expose sqlite3_interrupt(). Desktop hosts interrupt by terminating the
    // dedicated database Worker advertised by this capability flag.
  }

  close(): void {
    this.clearStatements()
    this.database.close()
  }
}

/**
 * EA-Connection-1.0 binding for better-sqlite3.
 *
 * This is deliberately separate from the compatibility connection above:
 * ordered rows and tagged storage classes cannot be represented by the old
 * object-row ABI without losing duplicate column names and INTEGER identity.
 */
export class BetterSqlite3ConnectionPort implements ConnectionPort {
  private readonly connectionCapabilities: ConnectionCapabilities
  private readonly maxResultRows: number
  private readonly maxResultBytes: number
  private readonly transactionModes: Array<"read" | "write"> = []
  private readonly snapshots = new Set<MemoryByteSource>()
  private localCommit = 0
  private savepointSequence = 0
  private mainReadEstablished = false
  private closed = false

  constructor(
    readonly database: Database.Database,
    options: BetterSqlite3ConnectionPortOptions = {}
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
    this.database.pragma("foreign_keys = ON")
    this.database.pragma("trusted_schema = OFF")
    this.database.pragma("busy_timeout = " + busyTimeoutMs)
    this.database.defaultSafeIntegers(true)
    const sqliteVersion = this.runMandatoryProbes()
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
      defensiveMode: false,
      busyTimeoutMs,
      maxVariables: compileOptionLimit(
        this.database,
        "MAX_VARIABLE_NUMBER",
        32_766
      ),
      maxSqlBytes: compileOptionLimit(
        this.database,
        "MAX_SQL_LENGTH",
        1_000_000_000
      ),
      maxValueBytes: compileOptionLimit(
        this.database,
        "MAX_LENGTH",
        1_000_000_000
      ),
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
    if (this.database.readonly || this.transactionModes.at(-1) === "read") {
      throw new EidosAdapterError(
        "read-only",
        "Schema statements are forbidden on a read-only connection or transaction"
      )
    }
    try {
      this.database.exec(sql)
    } catch (error) {
      throw mapBetterSqliteError(error)
    }
  }

  query(sql: string, bindings: readonly SqlValue[] = []): QueryResult {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    const statement = this.prepare(sql)
    if (!statement.reader) {
      throw new EidosAdapterError(
        "invalid-argument",
        "query requires one row-producing statement"
      )
    }
    this.assertStatementAllowed(statement)
    try {
      const rows = statement
        .raw(true)
        .all(...betterSqliteBindingArguments(bindings)) as unknown[][]
      if (rows.length > this.maxResultRows) {
        throw new EidosAdapterError(
          "resource-limit",
          "Query result exceeds maxResultRows"
        )
      }
      const result: QueryResult = {
        columns: statement.columns().map((column) => ({ name: column.name })),
        rows: rows.map((row) => row.map(nativeToSqlValue)),
      }
      this.assertResultSize(result)
      this.noteRead(sql)
      return result
    } catch (error) {
      throw mapBetterSqliteError(error)
    }
  }

  get(
    sql: string,
    bindings: readonly SqlValue[] = []
  ): { columns: Array<{ name: string }>; row: SqlValue[] | null } {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    const statement = this.prepare(sql)
    if (!statement.reader) {
      throw new EidosAdapterError(
        "invalid-argument",
        "get requires one row-producing statement"
      )
    }
    this.assertStatementAllowed(statement)
    try {
      const native = statement
        .raw(true)
        .get(...betterSqliteBindingArguments(bindings)) as unknown[] | undefined
      const result = {
        columns: statement.columns().map((column) => ({ name: column.name })),
        row: native ? native.map(nativeToSqlValue) : null,
      }
      this.assertResultSize(result)
      this.noteRead(sql)
      return result
    } catch (error) {
      throw mapBetterSqliteError(error)
    }
  }

  run(sql: string, bindings: readonly SqlValue[] = []): RunResult {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    const statement = this.prepare(sql)
    if (statement.reader) {
      throw new EidosAdapterError(
        "invalid-argument",
        "run requires one no-result statement"
      )
    }
    this.assertStatementAllowed(statement)
    try {
      const result = statement.run(...betterSqliteBindingArguments(bindings))
      return {
        changes: String(result.changes),
        lastInsertRowid: String(result.lastInsertRowid),
      }
    } catch (error) {
      throw mapBetterSqliteError(error)
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
    const statement = this.prepare(sql)
    if (statement.reader) {
      throw new EidosAdapterError(
        "invalid-argument",
        "runMany requires one no-result statement"
      )
    }
    this.assertStatementAllowed(statement)
    const results: RunResult[] = []
    try {
      for (const bindings of bindingSets) {
        const result = statement.run(...betterSqliteBindingArguments(bindings))
        results.push({
          changes: String(result.changes),
          lastInsertRowid: String(result.lastInsertRowid),
        })
      }
      return results
    } catch (error) {
      throw mapBetterSqliteError(error)
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
          safeIntegers: true,
          varargs: false,
        },
        scalar
      )
    } catch (error) {
      throw mapBetterSqliteError(error)
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
    if (mode === "write" && this.database.readonly) {
      throw new EidosAdapterError("read-only", "Connection is read-only")
    }
    const outer = this.transactionModes.length === 0
    const effectiveMode = parent ?? mode
    const savepoint = "eidos_adapter_" + ++this.savepointSequence
    let started = false
    try {
      this.database.exec(
        outer
          ? effectiveMode === "write"
            ? "BEGIN IMMEDIATE"
            : "BEGIN DEFERRED"
          : "SAVEPOINT " + savepoint
      )
      started = true
      this.transactionModes.push(effectiveMode)
      if (outer) this.mainReadEstablished = false
      const result = operation()
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            try {
              this.database.exec(outer ? "COMMIT" : "RELEASE " + savepoint)
              if (outer && effectiveMode === "write") this.localCommit += 1
              return value
            } catch (error) {
              this.rollbackTransaction(outer, savepoint)
              throw mapBetterSqliteError(error)
            } finally {
              this.transactionModes.pop()
              if (outer) this.mainReadEstablished = false
            }
          },
          (error: unknown) => {
            try {
              this.rollbackTransaction(outer, savepoint)
              throw mapBetterSqliteError(error)
            } finally {
              this.transactionModes.pop()
              if (outer) this.mainReadEstablished = false
            }
          }
        )
      }
      this.database.exec(outer ? "COMMIT" : "RELEASE " + savepoint)
      if (outer && effectiveMode === "write") this.localCommit += 1
      this.transactionModes.pop()
      if (outer) this.mainReadEstablished = false
      return result
    } catch (error) {
      try {
        if (started) this.rollbackTransaction(outer, savepoint)
        throw mapBetterSqliteError(error)
      } finally {
        if (started) this.transactionModes.pop()
        if (outer) this.mainReadEstablished = false
      }
    }
  }

  private rollbackTransaction(outer: boolean, savepoint: string): void {
    try {
      this.database.exec(
        outer
          ? "ROLLBACK"
          : "ROLLBACK TO " + savepoint + "; RELEASE " + savepoint
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

  dataVersion(): string {
    this.assertOpen()
    const external = this.database.pragma("data_version", {
      simple: true,
    }) as bigint | number
    return String(this.localCommit) + ":" + String(external)
  }

  interrupt(): void {
    this.assertOpen()
    throw new EidosAdapterError(
      "unsupported-capability",
      "better-sqlite3 uses the required terminate cancellation profile"
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
    const pageCount = this.database.pragma("page_count", {
      simple: true,
    }) as bigint | number
    const pageSize = this.database.pragma("page_size", {
      simple: true,
    }) as bigint | number
    if (BigInt(pageCount) * BigInt(pageSize) > maxBytes) {
      throw new EidosAdapterError(
        "resource-limit",
        "Database snapshot exceeds maxBytes"
      )
    }
    const bytes = new Uint8Array(this.database.serialize({ attached: "main" }))
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
    this.database.close()
  }

  private prepare(sql: string): Database.Statement<unknown[], unknown> {
    try {
      return this.database.prepare(sql).safeIntegers(true)
    } catch (error) {
      throw mapBetterSqliteError(error)
    }
  }

  private assertOpen(): void {
    if (this.closed || !this.database.open) {
      throw new EidosAdapterError("adapter-closed", "Connection is closed")
    }
  }

  private assertStatementAllowed(
    statement: Database.Statement<unknown[], unknown>
  ): void {
    if (this.transactionModes.at(-1) === "read" && !statement.readonly) {
      throw new EidosAdapterError(
        "read-only",
        "Mutating statement is forbidden in a read transaction"
      )
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
    const bytes = Buffer.byteLength(
      JSON.stringify(value, (_key, entry) =>
        entry instanceof Uint8Array ? { byteLength: entry.byteLength } : entry
      ),
      "utf8"
    )
    if (bytes > this.maxResultBytes) {
      throw new EidosAdapterError(
        "resource-limit",
        "Query result exceeds maxResultBytes"
      )
    }
  }

  private runMandatoryProbes(): string {
    try {
      const versionRow = this.database
        .prepare("SELECT sqlite_version(), sqlite_source_id()")
        .raw(true)
        .get() as [string, string]
      if (compareSqliteVersion(versionRow[0], "3.45.0") < 0 || !versionRow[1]) {
        throw new EidosAdapterError(
          "unsupported-capability",
          "SQLite 3.45.0 or later with source ID is required"
        )
      }
      const json = this.database
        .prepare("SELECT json_valid('[]'), json_array_length('[1,2]')")
        .raw(true)
        .get() as [bigint, bigint]
      const foreignKeys = this.database.pragma("foreign_keys", {
        simple: true,
      }) as bigint
      const trustedSchema = this.database.pragma("trusted_schema", {
        simple: true,
      }) as bigint
      const values = this.database
        .prepare(
          "SELECT CAST('-9223372036854775808' AS INTEGER), " +
            "CAST('9223372036854775807' AS INTEGER), X'000102FF'"
        )
        .safeIntegers(true)
        .raw(true)
        .get() as [bigint, bigint, Uint8Array]
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
          safeIntegers: true,
        },
        (value: unknown) => value
      )
      const storage = this.database
        .prepare(
          "SELECT " +
            "typeof(eidos_adapter_probe_scalar(NULL)), " +
            "typeof(eidos_adapter_probe_scalar(1)), " +
            "typeof(eidos_adapter_probe_scalar(1.5)), " +
            "typeof(eidos_adapter_probe_scalar('x')), " +
            "typeof(eidos_adapter_probe_scalar(X'0001')), " +
            "hex(eidos_adapter_probe_scalar(X'0001'))"
        )
        .raw(true)
        .get() as [string, string, string, string, string, string]
      if (storage.join(",") !== "null,integer,real,text,blob,0001") {
        throw new EidosAdapterError(
          "unsupported-capability",
          "Scalar function storage-class probe failed"
        )
      }
      this.database.transaction(() => {
        this.database.exec(
          "CREATE TEMP TABLE eidos_adapter_probe(" +
            "id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT"
        )
        const returned = this.database
          .prepare(
            "INSERT INTO eidos_adapter_probe(value) VALUES ('ok') " +
              "RETURNING id, value"
          )
          .safeIntegers(true)
          .raw(true)
          .get() as [bigint, string]
        this.database.exec("DROP TABLE eidos_adapter_probe")
        if (returned[0] !== 1n || returned[1] !== "ok") {
          throw new EidosAdapterError(
            "unsupported-capability",
            "SQLite STRICT/RETURNING probe failed"
          )
        }
      })()
      return versionRow[0]
    } catch (error) {
      const mapped = mapBetterSqliteError(error)
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
      label + " must be a positive JSON integer"
    )
  }
  return limit
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

function compileOptionLimit(
  database: Database.Database,
  name: string,
  fallback: number
): number {
  const rows = database.pragma("compile_options") as Array<{
    compile_options?: string
  }>
  const prefix = name + "="
  const value = rows
    .map((row) => row.compile_options ?? "")
    .find((option) => option.startsWith(prefix))
  const parsed = value ? Number(value.slice(prefix.length)) : fallback
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function mapBetterSqliteError(error: unknown): Error {
  if (error instanceof EidosAdapterError) return error
  if (!(error instanceof Error)) {
    return new EidosAdapterError("io-error", "Unknown SQLite Adapter failure")
  }
  const sqliteCode = (error as { code?: unknown }).code
  const code = typeof sqliteCode === "string" ? sqliteCode : ""
  if (code.includes("BUSY")) {
    return new EidosAdapterError("busy", "SQLite is busy", true)
  }
  if (code.includes("LOCKED")) {
    return new EidosAdapterError("locked", "SQLite is locked")
  }
  if (code.includes("CONSTRAINT")) {
    return new EidosAdapterError("constraint", "SQLite constraint failed")
  }
  if (code.includes("CORRUPT")) {
    return new EidosAdapterError(
      "corrupt",
      "SQLite database is corrupt",
      false,
      true
    )
  }
  if (code.includes("NOTADB")) {
    return new EidosAdapterError(
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
    return new EidosAdapterError("invalid-argument", error.message)
  }
  return new EidosAdapterError("io-error", error.message)
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
  const database = new Database(filePath)
  const connection = new BetterSqlite3EidosFileConnection(database)
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
  const database = new Database(filePath, {
    fileMustExist: true,
    readonly: options.readonly ?? false,
  })
  const connection = new BetterSqlite3EidosFileConnection(database)
  try {
    connection.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;")
    const result = validateEidosFile(connection)
    if (!result.valid) {
      throw new EidosFileError(
        "not-eidos-file",
        result.errors.map((issue) => issue.message).join("; ")
      )
    }
    const runtime = new EidosFileRuntime(connection, true)
    return runtime
  } catch (error) {
    connection.close()
    throw error
  }
}

function assertEidosFileExtension(filePath: string): void {
  if (path.extname(filePath).toLowerCase() === EIDOS_FILE_EXTENSION) return
  throw new EidosFileError(
    "invalid-identifier",
    `Eidos Files must use the ${EIDOS_FILE_EXTENSION} extension`
  )
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
  const database = new Database(filePath, {
    fileMustExist: true,
    readonly: true,
  })
  const connection = new BetterSqlite3EidosFileConnection(database)
  try {
    connection.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;")
    return validateEidosFile(connection)
  } finally {
    connection.close()
  }
}
