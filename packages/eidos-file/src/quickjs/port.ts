import type {
  Column,
  ConnectionCapabilities,
  ConnectionPort,
  ConnectionSnapshot,
  QueryResult,
  RunResult,
  ScalarDefinition,
  SnapshotContext,
  SqlValue,
} from "../adapter-contract"
import { MemoryByteSource, parseNonNegativeInt64 } from "../protocol-types"
import {
  assertExactConnectionBindings,
  EidosAdapterError,
} from "../connection-port"
import {
  base64ToBytes,
  bytesToBase64,
  sqlValuesToWire,
  wireRowsToSqlValues,
  wireToSqlValue,
  type WireSqlValue,
} from "./wire"

const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const DEFAULT_MAX_RESULT_ROWS = 100_000
const DEFAULT_MAX_RESULT_BYTES = 16 * 1024 * 1024

export interface QuickJsHostLimits {
  busyTimeoutMs: number
  maxVariables: number
  maxSqlBytes: number
  maxValueBytes: number
}

export interface QuickJsHostError {
  code: string
  message: string
  retryable?: boolean
  fatal?: boolean
  sqlitePrimaryCode?: number
  sqliteExtendedCode?: number
}

export type QuickJsHostEnvelope =
  | { ok: true; value: unknown }
  | { ok: false; error: QuickJsHostError }

/**
 * Rust-provided synchronous primitives. Every function returns a JSON-encoded
 * QuickJsHostEnvelope string so structured errors survive the FFI boundary.
 */
export interface QuickJsHostBridge {
  exec(sql: string): string
  query(sql: string, bindingsJson: string, forbidWrite: boolean): string
  run(sql: string, bindingsJson: string, forbidWrite: boolean): string
  registerScalar(name: string, arity: number): string
  dataVersion(): string
  serialize(): string
  interrupt(): string
  randomBytes(length: number): string
  sha256(bytesBase64: string): string
  log(level: string, message: string): void
  limits(): string
  sqliteProbe(): string
}

declare global {
  // eslint-disable-next-line no-var
  var __eidos_host: QuickJsHostBridge
  // eslint-disable-next-line no-var
  var __eidos_scalar_dispatch: (name: string, argsJson: string) => string
}

type ScalarOperation = (...values: SqlValue[]) => SqlValue

function unwrap<T>(envelopeJson: string): T {
  const envelope = JSON.parse(envelopeJson) as QuickJsHostEnvelope
  if (!envelope.ok) {
    const error = envelope.error
    throw new EidosAdapterError(
      error.code as EidosAdapterError["code"],
      error.message,
      error.retryable === true,
      error.fatal === true,
      error.sqlitePrimaryCode,
      error.sqliteExtendedCode
    )
  }
  return envelope.value as T
}

function positiveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new EidosAdapterError("invalid-argument", "Limit must be positive")
  }
  return value
}

/**
 * EA-Connection-1.0 over the Rust rusqlite bridge. Mirrors
 * SQLiteWasmConnectionPort semantics statement-for-statement; the Rust side
 * owns the real connection and never sees this class.
 */
export class QuickJsConnectionPort implements ConnectionPort {
  private readonly connectionCapabilities: ConnectionCapabilities
  private readonly maxResultRows: number
  private readonly maxResultBytes: number
  private readonly transactionModes: Array<"read" | "write"> = []
  private readonly snapshots = new Set<MemoryByteSource>()
  private readonly scalars = new Map<string, ScalarOperation>()
  private localCommit = 0
  private savepointSequence = 0
  private mainReadEstablished = false
  private closed = false

  constructor(
    options: {
      busyTimeoutMs?: number
      maxResultRows?: number
      maxResultBytes?: number
    } = {}
  ) {
    const busyTimeoutMs = positiveLimit(
      options.busyTimeoutMs,
      DEFAULT_BUSY_TIMEOUT_MS
    )
    this.maxResultRows = positiveLimit(
      options.maxResultRows,
      DEFAULT_MAX_RESULT_ROWS
    )
    this.maxResultBytes = positiveLimit(
      options.maxResultBytes,
      DEFAULT_MAX_RESULT_BYTES
    )
    const sqliteVersion = this.runMandatoryProbes()
    const limits = unwrap<QuickJsHostLimits>(globalThis.__eidos_host.limits())
    this.connectionCapabilities = {
      adapterVersion: "1.0",
      sqliteVersion,
      json1: true,
      returning: true,
      strict: true,
      int64: true,
      scalarFunctions: true,
      directOnlyFunctions: true,
      interrupt: true,
      snapshot: true,
      defensiveMode: false,
      busyTimeoutMs,
      maxVariables: limits.maxVariables,
      maxSqlBytes: limits.maxSqlBytes,
      maxValueBytes: limits.maxValueBytes,
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
    if (this.transactionModes.at(-1) === "read") {
      throw new EidosAdapterError(
        "read-only",
        "Schema statements are forbidden in a read transaction"
      )
    }
    this.hostExec(sql)
  }

  query(sql: string, bindings: readonly SqlValue[] = []): QueryResult {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    const result = unwrap<{ columns: Column[]; rows: WireSqlValue[][] }>(
      globalThis.__eidos_host.query(
        sql,
        JSON.stringify(sqlValuesToWire(bindings)),
        this.transactionModes.at(-1) === "read"
      )
    )
    if (result.rows.length > this.maxResultRows) {
      throw new EidosAdapterError(
        "resource-limit",
        "Query result exceeds maxResultRows"
      )
    }
    const tagged: QueryResult = {
      columns: result.columns,
      rows: wireRowsToSqlValues(result.rows),
    }
    this.assertResultSize(tagged)
    this.noteRead(sql)
    return tagged
  }

  get(
    sql: string,
    bindings: readonly SqlValue[] = []
  ): { columns: Column[]; row: SqlValue[] | null } {
    const result = this.query(sql, bindings)
    return {
      columns: result.columns,
      row: result.rows.length === 0 ? null : result.rows[0]!,
    }
  }

  run(sql: string, bindings: readonly SqlValue[] = []): RunResult {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    return unwrap<RunResult>(
      globalThis.__eidos_host.run(
        sql,
        JSON.stringify(sqlValuesToWire(bindings)),
        this.transactionModes.at(-1) === "read"
      )
    )
  }

  runMany(
    sql: string,
    bindingSets: readonly (readonly SqlValue[])[]
  ): RunResult[] {
    this.assertOpen()
    const results: RunResult[] = []
    for (const bindings of bindingSets) {
      results.push(this.run(sql, bindings))
    }
    return results
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
    unwrap(
      globalThis.__eidos_host.registerScalar(definition.name, definition.arity)
    )
    this.scalars.set(definition.name, operation)
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
    const outer = this.transactionModes.length === 0
    const effectiveMode = parent ?? mode
    const savepoint = "eidos_adapter_" + ++this.savepointSequence
    let started = false
    const noCallbackFailure = Symbol("no-callback-failure")
    let callbackFailure: unknown = noCallbackFailure
    try {
      this.hostExec(
        outer
          ? effectiveMode === "write"
            ? "BEGIN IMMEDIATE"
            : "BEGIN DEFERRED"
          : "SAVEPOINT " + savepoint
      )
      started = true
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
              this.hostExec(outer ? "COMMIT" : "RELEASE " + savepoint)
              if (outer && effectiveMode === "write") this.localCommit += 1
              return value
            } catch (error) {
              this.rollbackTransaction(outer, savepoint)
              throw error
            } finally {
              this.transactionModes.pop()
              if (outer) this.mainReadEstablished = false
            }
          },
          (error: unknown) => {
            try {
              this.rollbackTransaction(outer, savepoint)
              throw error
            } finally {
              this.transactionModes.pop()
              if (outer) this.mainReadEstablished = false
            }
          }
        )
      }
      this.hostExec(outer ? "COMMIT" : "RELEASE " + savepoint)
      if (outer && effectiveMode === "write") this.localCommit += 1
      this.transactionModes.pop()
      if (outer) this.mainReadEstablished = false
      return result
    } catch (error) {
      try {
        if (started) this.rollbackTransaction(outer, savepoint)
        throw callbackFailure === error && callbackFailure !== noCallbackFailure
          ? error
          : error
      } finally {
        if (started) this.transactionModes.pop()
        if (outer) this.mainReadEstablished = false
      }
    }
  }

  dataVersion(): string {
    this.assertOpen()
    const value = unwrap<string>(globalThis.__eidos_host.dataVersion())
    return `${this.localCommit}:${value}`
  }

  interrupt(): void {
    this.assertOpen()
    unwrap(globalThis.__eidos_host.interrupt())
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
    this.assertSnapshotContext(context, startedAt)
    const maxBytes = parseNonNegativeInt64(context.maxBytes, "maxBytes")
    const estimate = this.query(
      "SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()"
    )
    const estimateValue = estimate.rows[0]?.[0]
    const estimatedBytes =
      estimateValue?.tag === "integer"
        ? BigInt(estimateValue.value)
        : estimateValue?.tag === "real"
          ? BigInt(Math.trunc(estimateValue.value))
          : 0n
    if (estimatedBytes > maxBytes) {
      throw new EidosAdapterError(
        "resource-limit",
        "Database snapshot exceeds maxBytes"
      )
    }
    const bytes = base64ToBytes(
      unwrap<string>(globalThis.__eidos_host.serialize())
    )
    this.assertSnapshotContext(context, startedAt)
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
    this.scalars.clear()
  }

  /** Installed as globalThis.__eidos_scalar_dispatch; called by Rust UDF trampolines. */
  dispatchScalar(name: string, argsJson: string): string {
    const operation = this.scalars.get(name)
    if (!operation) {
      return JSON.stringify({
        ok: false,
        error: { message: `Scalar function ${name} is not registered` },
      })
    }
    try {
      const args = (JSON.parse(argsJson) as WireSqlValue[]).map(wireToSqlValue)
      const result = operation(...args)
      return JSON.stringify({
        ok: true,
        value:
          result.tag === "blob"
            ? { tag: "blob", value: bytesToBase64(result.value) }
            : result,
      })
    } catch {
      return JSON.stringify({
        ok: false,
        error: { message: "Deterministic scalar function failed" },
      })
    }
  }

  private hostExec(sql: string): void {
    unwrap(globalThis.__eidos_host.exec(sql))
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new EidosAdapterError("adapter-closed", "Connection is closed")
    }
  }

  private assertResultSize(result: QueryResult): void {
    let bytes = 0
    for (const row of result.rows) {
      for (const value of row) {
        if (value.tag === "text")
          bytes += new TextEncoder().encode(value.value).byteLength
        else if (value.tag === "blob") bytes += value.value.byteLength
        else bytes += 24
      }
    }
    if (bytes > this.maxResultBytes) {
      throw new EidosAdapterError(
        "resource-limit",
        "Query result exceeds maxResultBytes"
      )
    }
  }

  private rollbackTransaction(outer: boolean, savepoint: string): void {
    try {
      this.hostExec(
        outer
          ? "ROLLBACK"
          : "ROLLBACK TO " + savepoint + "; RELEASE " + savepoint
      )
    } catch {
      this.closed = true
      throw new EidosAdapterError(
        "transport-fatal",
        "Transaction rollback could not be proven",
        false,
        true
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

  private assertSnapshotContext(
    context: SnapshotContext,
    startedAt: number
  ): void {
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
  }

  private runMandatoryProbes(): string {
    const probe = unwrap<{ sqliteVersion: string; sourceId: string }>(
      globalThis.__eidos_host.sqliteProbe()
    )
    if (
      compareSqliteVersion(probe.sqliteVersion, "3.45.0") < 0 ||
      probe.sourceId.length === 0
    ) {
      throw new EidosAdapterError(
        "unsupported-capability",
        "SQLite 3.45.0 or later with source ID is required"
      )
    }
    const json = this.query(
      "SELECT json_valid('[]'), json_array_length('[1,2]')"
    )
    const jsonValid = json.rows[0]?.[0]
    const jsonLength = json.rows[0]?.[1]
    if (
      jsonValid?.tag !== "integer" ||
      jsonValid.value !== "1" ||
      jsonLength?.tag !== "integer" ||
      jsonLength.value !== "2"
    ) {
      throw new EidosAdapterError(
        "unsupported-capability",
        "SQLite JSON1 support is required"
      )
    }
    const foreignKeys = this.query("PRAGMA foreign_keys")
    if (
      foreignKeys.rows[0]?.[0]?.tag !== "integer" ||
      foreignKeys.rows[0]?.[0]?.value !== "1"
    ) {
      throw new EidosAdapterError(
        "unsupported-capability",
        "PRAGMA foreign_keys = ON is required"
      )
    }
    const trustedSchema = this.query("PRAGMA trusted_schema")
    if (
      trustedSchema.rows[0]?.[0]?.tag !== "integer" ||
      trustedSchema.rows[0]?.[0]?.value !== "0"
    ) {
      throw new EidosAdapterError(
        "unsupported-capability",
        "PRAGMA trusted_schema = OFF is required"
      )
    }
    const boundary = this.query(
      "SELECT CAST('-9223372036854775808' AS INTEGER) AS minimum, " +
        "CAST('9223372036854775807' AS INTEGER) AS maximum, X'000102FF' AS blob"
    )
    const row = boundary.rows[0]
    if (
      row?.[0]?.tag !== "integer" ||
      row[0].value !== "-9223372036854775808" ||
      row[1]?.tag !== "integer" ||
      row[1].value !== "9223372036854775807" ||
      row[2]?.tag !== "blob" ||
      row[2].value.length !== 4 ||
      row[2].value[3] !== 0xff
    ) {
      throw new EidosAdapterError(
        "unsupported-capability",
        "SQLite mandatory value probe failed"
      )
    }
    return probe.sqliteVersion
  }
}

function compareSqliteVersion(left: string, right: string): number {
  const leftParts = left.split(".").map(Number)
  const rightParts = right.split(".").map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}
