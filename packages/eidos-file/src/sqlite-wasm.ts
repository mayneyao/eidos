import type sqlite3InitModule from "@sqlite.org/sqlite-wasm"

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
import {
  assertExactConnectionBindings,
  assertInt64Decimal,
  assertUnicodeString,
  EidosAdapterError,
  exactConnectionBindingCount,
} from "./connection-port"
import { MemoryByteSource, parseNonNegativeInt64 } from "./protocol-types"

type Sqlite3Static = Awaited<ReturnType<typeof sqlite3InitModule>>
type SqliteDatabase = InstanceType<Sqlite3Static["oo1"]["DB"]>
type PreparedStatement = ReturnType<SqliteDatabase["prepare"]>

const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const DEFAULT_MAX_RESULT_ROWS = 100_000
const DEFAULT_MAX_RESULT_BYTES = 16 * 1024 * 1024
const UTF8 = new TextEncoder()
const UTF8_FATAL = new TextDecoder("utf-8", { fatal: true })

export interface SQLiteWasmConnectionPortOptions {
  busyTimeoutMs?: number
  maxResultRows?: number
  maxResultBytes?: number
}

/**
 * EA-Connection-1.0 binding for the official SQLite WASM build.
 *
 * This class is intended to live beside Runtime in a Dedicated Worker. The
 * Window side must expose RuntimeClient over the Adapter transport profile,
 * never this object or its underlying database.
 */
export class SQLiteWasmConnectionPort implements ConnectionPort {
  private readonly connectionCapabilities: ConnectionCapabilities
  private readonly maxResultRows: number
  private readonly maxResultBytes: number
  private readonly transactionModes: Array<"read" | "write"> = []
  private readonly snapshots = new Set<MemoryByteSource>()
  private readonly scalarPointers = new Set<number>()
  private localCommit = 0
  private savepointSequence = 0
  private mainReadEstablished = false
  private closed = false

  constructor(
    readonly database: SqliteDatabase,
    readonly sqlite3: Sqlite3Static,
    options: SQLiteWasmConnectionPortOptions = {}
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
    this.database.exec(
      "PRAGMA foreign_keys = ON; " +
        "PRAGMA trusted_schema = OFF; " +
        `PRAGMA busy_timeout = ${busyTimeoutMs};`
    )
    const sqliteVersion = this.runMandatoryProbes()
    const capi = this.sqlite3.capi
    const pointer = this.database.pointer
    if (!pointer) {
      throw new EidosAdapterError("adapter-closed", "Connection is closed")
    }
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
      // The official WASM wrapper does not expose a stable result argument for
      // SQLITE_DBCONFIG_DEFENSIVE. The required fallback remains enforced by
      // trusted_schema=OFF and by keeping this port private to trusted Runtime.
      defensiveMode: false,
      busyTimeoutMs,
      maxVariables: capi.sqlite3_limit(
        pointer,
        capi.SQLITE_LIMIT_VARIABLE_NUMBER,
        -1
      ),
      maxSqlBytes: capi.sqlite3_limit(
        pointer,
        capi.SQLITE_LIMIT_SQL_LENGTH,
        -1
      ),
      maxValueBytes: capi.sqlite3_limit(pointer, capi.SQLITE_LIMIT_LENGTH, -1),
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
    try {
      this.database.exec(sql)
    } catch (error) {
      throw this.mapError(error)
    }
  }

  query(sql: string, bindings: readonly SqlValue[] = []): QueryResult {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    let statement: PreparedStatement | undefined
    try {
      statement = this.database.prepare(sql)
      this.assertReader(statement, "query")
      this.bind(statement, bindings)
      const columns = statement.getColumnNames().map((name) => ({
        name: assertUnicodeString(name, "column name"),
      }))
      const rows: SqlValue[][] = []
      let resultBytes = measureColumns(columns)
      while (statement.step()) {
        if (rows.length >= this.maxResultRows) {
          throw new EidosAdapterError(
            "resource-limit",
            "Query result exceeds maxResultRows"
          )
        }
        const row = this.readRow(statement)
        resultBytes += measureRow(row)
        if (resultBytes > this.maxResultBytes) {
          throw new EidosAdapterError(
            "resource-limit",
            "Query result exceeds maxResultBytes"
          )
        }
        rows.push(row)
      }
      this.noteRead(sql)
      return { columns, rows }
    } catch (error) {
      throw this.mapError(error)
    } finally {
      statement?.finalize()
    }
  }

  get(
    sql: string,
    bindings: readonly SqlValue[] = []
  ): { columns: Array<{ name: string }>; row: SqlValue[] | null } {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    let statement: PreparedStatement | undefined
    try {
      statement = this.database.prepare(sql)
      this.assertReader(statement, "get")
      this.bind(statement, bindings)
      const columns = statement.getColumnNames().map((name) => ({
        name: assertUnicodeString(name, "column name"),
      }))
      const row = statement.step() ? this.readRow(statement) : null
      if (
        measureColumns(columns) + (row ? measureRow(row) : 0) >
        this.maxResultBytes
      ) {
        throw new EidosAdapterError(
          "resource-limit",
          "Query result exceeds maxResultBytes"
        )
      }
      this.noteRead(sql)
      return { columns, row }
    } catch (error) {
      throw this.mapError(error)
    } finally {
      statement?.finalize()
    }
  }

  run(sql: string, bindings: readonly SqlValue[] = []): RunResult {
    this.assertOpen()
    assertExactConnectionBindings(sql, bindings)
    let statement: PreparedStatement | undefined
    try {
      statement = this.database.prepare(sql)
      this.assertWriter(statement, "run")
      this.bind(statement, bindings)
      statement.step()
      return this.runResult()
    } catch (error) {
      throw this.mapError(error)
    } finally {
      statement?.finalize()
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
    let statement: PreparedStatement | undefined
    try {
      statement = this.database.prepare(sql)
      this.assertWriter(statement, "runMany")
      const results: RunResult[] = []
      for (const bindings of bindingSets) {
        this.bind(statement, bindings)
        statement.step()
        results.push(this.runResult())
        statement.reset(true)
      }
      return results
    } catch (error) {
      throw this.mapError(error)
    } finally {
      statement?.finalize()
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
    const capi = this.sqlite3.capi
    const wasm = this.sqlite3.wasm
    const pointer = wasm.installFunction(
      (
        contextPointer: number,
        argumentCount: number,
        argumentsPointer: number
      ) => {
        try {
          const values: SqlValue[] = []
          for (let index = 0; index < argumentCount; index += 1) {
            const valuePointer = wasm.peekPtr(
              argumentsPointer + index * wasm.ptrSizeof
            )
            values.push(this.readValue(valuePointer, "value"))
          }
          this.writeScalarResult(contextPointer, operation(...values))
        } catch (error) {
          capi.sqlite3_result_error(
            contextPointer,
            error instanceof Error ? error.message : "Scalar function failed",
            -1
          )
        }
      },
      "viii"
    )
    try {
      const databasePointer = this.database.pointer
      if (!databasePointer) {
        throw new EidosAdapterError("adapter-closed", "Connection is closed")
      }
      this.database.checkRc(
        capi.sqlite3_create_function_v2(
          databasePointer,
          definition.name,
          definition.arity,
          (capi.SQLITE_UTF8 |
            capi.SQLITE_DETERMINISTIC |
            capi.SQLITE_DIRECTONLY) as typeof capi.SQLITE_UTF8,
          0,
          pointer,
          0,
          0,
          0
        )
      )
      this.scalarPointers.add(pointer)
    } catch (error) {
      wasm.uninstallFunction(pointer)
      throw this.mapError(error)
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
    const outer = this.transactionModes.length === 0
    const effectiveMode = parent ?? mode
    const savepoint = "eidos_adapter_" + ++this.savepointSequence
    let started = false
    const noCallbackFailure = Symbol("no-callback-failure")
    let callbackFailure: unknown = noCallbackFailure
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
              this.database.exec(outer ? "COMMIT" : "RELEASE " + savepoint)
              if (outer && effectiveMode === "write") this.localCommit += 1
              return value
            } catch (error) {
              this.rollbackTransaction(outer, savepoint)
              throw this.mapError(error)
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
      this.database.exec(outer ? "COMMIT" : "RELEASE " + savepoint)
      if (outer && effectiveMode === "write") this.localCommit += 1
      this.transactionModes.pop()
      if (outer) this.mainReadEstablished = false
      return result
    } catch (error) {
      try {
        if (started) this.rollbackTransaction(outer, savepoint)
        throw callbackFailure === error && callbackFailure !== noCallbackFailure
          ? error
          : this.mapError(error)
      } finally {
        if (started) this.transactionModes.pop()
        if (outer) this.mainReadEstablished = false
      }
    }
  }

  dataVersion(): string {
    this.assertOpen()
    const result = this.query("PRAGMA data_version")
    const value = result.rows[0]?.[0]
    if (!value || value.tag !== "integer") {
      throw new EidosAdapterError(
        "protocol-error",
        "PRAGMA data_version did not return INTEGER",
        false,
        true
      )
    }
    return `${this.localCommit}:${value.value}`
  }

  interrupt(): void {
    this.assertOpen()
    const pointer = this.database.pointer
    if (!pointer) {
      throw new EidosAdapterError("adapter-closed", "Connection is closed")
    }
    const capi = this.sqlite3.capi as typeof this.sqlite3.capi & {
      sqlite3_interrupt(databasePointer: number): void
    }
    capi.sqlite3_interrupt(pointer)
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
    const estimate = this.database.selectValue(
      "SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()"
    )
    const estimatedBytes =
      typeof estimate === "bigint" ? estimate : BigInt(Number(estimate ?? 0))
    if (estimatedBytes > maxBytes) {
      throw new EidosAdapterError(
        "resource-limit",
        "Database snapshot exceeds maxBytes"
      )
    }
    let bytes: Uint8Array
    try {
      bytes = this.sqlite3.capi
        .sqlite3_js_db_export(this.database, "main")
        .slice()
    } catch (error) {
      throw this.mapError(error)
    }
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
    this.database.close()
    for (const pointer of this.scalarPointers) {
      try {
        this.sqlite3.wasm.uninstallFunction(pointer)
      } catch {
        // The WASM table may already be unavailable after a fatal close.
      }
    }
    this.scalarPointers.clear()
  }

  private bind(
    statement: PreparedStatement,
    bindings: readonly SqlValue[]
  ): void {
    if (statement.parameterCount !== bindings.length) {
      throw new EidosAdapterError(
        "invalid-argument",
        `Statement requires ${statement.parameterCount} bindings, received ${bindings.length}`
      )
    }
    const capi = this.sqlite3.capi
    for (let index = 0; index < bindings.length; index += 1) {
      const value = bindings[index]!
      const bindingIndex = index + 1
      switch (value.tag) {
        case "null":
          statement.bind(bindingIndex, null)
          break
        case "integer":
          statement.bind(bindingIndex, assertInt64Decimal(value.value))
          break
        case "real":
          if (!Number.isFinite(value.value)) {
            throw new EidosAdapterError(
              "invalid-sql-value",
              "REAL must be finite binary64"
            )
          }
          this.database.checkRc(
            capi.sqlite3_bind_double(
              statement.pointer!,
              bindingIndex,
              Object.is(value.value, -0) ? 0 : value.value
            )
          )
          break
        case "text":
          statement.bind(bindingIndex, assertUnicodeString(value.value))
          break
        case "blob":
          statement.bindAsBlob(bindingIndex, value.value.slice())
          break
      }
    }
  }

  private readRow(statement: PreparedStatement): SqlValue[] {
    const row: SqlValue[] = []
    for (let index = 0; index < statement.columnCount; index += 1) {
      row.push(this.readValue(statement.pointer!, "column", index))
    }
    return row
  }

  private readValue(
    pointer: number,
    source: "column" | "value",
    columnIndex = 0
  ): SqlValue {
    const capi = this.sqlite3.capi
    const type =
      source === "column"
        ? capi.sqlite3_column_type(pointer, columnIndex)
        : capi.sqlite3_value_type(pointer)
    const bytes = () => {
      const length =
        source === "column"
          ? capi.sqlite3_column_bytes(pointer, columnIndex)
          : capi.sqlite3_value_bytes(pointer)
      const dataPointer =
        source === "column"
          ? capi.sqlite3_column_blob(pointer, columnIndex)
          : capi.sqlite3_value_blob(pointer)
      return length === 0
        ? new Uint8Array()
        : this.sqlite3.wasm.heap8u().slice(dataPointer, dataPointer + length)
    }
    switch (type) {
      case capi.SQLITE_NULL:
        return { tag: "null" }
      case capi.SQLITE_INTEGER:
        return {
          tag: "integer",
          value: String(
            source === "column"
              ? capi.sqlite3_column_int64(pointer, columnIndex)
              : capi.sqlite3_value_int64(pointer)
          ),
        }
      case capi.SQLITE_FLOAT: {
        const value =
          source === "column"
            ? capi.sqlite3_column_double(pointer, columnIndex)
            : capi.sqlite3_value_double(pointer)
        if (!Number.isFinite(value)) {
          throw new EidosAdapterError(
            "invalid-sql-value",
            "SQLite returned a non-finite REAL",
            false,
            true
          )
        }
        return { tag: "real", value: Object.is(value, -0) ? 0 : value }
      }
      case capi.SQLITE_TEXT:
        try {
          return { tag: "text", value: UTF8_FATAL.decode(bytes()) }
        } catch {
          throw new EidosAdapterError(
            "invalid-sql-value",
            "SQLite returned invalid UTF-8 TEXT",
            false,
            true
          )
        }
      case capi.SQLITE_BLOB:
        return { tag: "blob", value: bytes() }
      default:
        throw new EidosAdapterError(
          "protocol-error",
          "SQLite returned an unknown storage class",
          false,
          true
        )
    }
  }

  private writeScalarResult(contextPointer: number, value: SqlValue): void {
    const capi = this.sqlite3.capi
    const wasm = this.sqlite3.wasm
    switch (value.tag) {
      case "null":
        capi.sqlite3_result_null(contextPointer)
        break
      case "integer":
        capi.sqlite3_result_int64(
          contextPointer,
          assertInt64Decimal(value.value)
        )
        break
      case "real":
        if (!Number.isFinite(value.value)) {
          throw new EidosAdapterError(
            "invalid-sql-value",
            "REAL must be finite binary64"
          )
        }
        capi.sqlite3_result_double(
          contextPointer,
          Object.is(value.value, -0) ? 0 : value.value
        )
        break
      case "text":
        capi.sqlite3_result_text(
          contextPointer,
          assertUnicodeString(value.value),
          -1,
          capi.SQLITE_TRANSIENT
        )
        break
      case "blob": {
        const bytes = value.value.slice()
        const pointer = wasm.alloc(Math.max(1, bytes.byteLength))
        try {
          if (bytes.byteLength > 0) wasm.heap8u().set(bytes, pointer)
          capi.sqlite3_result_blob(
            contextPointer,
            pointer,
            bytes.byteLength,
            capi.SQLITE_TRANSIENT
          )
        } finally {
          wasm.dealloc(pointer)
        }
        break
      }
    }
  }

  private assertReader(statement: PreparedStatement, operation: string): void {
    if (statement.columnCount === 0) {
      throw new EidosAdapterError(
        "invalid-argument",
        operation + " requires one row-producing statement"
      )
    }
    this.assertStatementAllowed(statement)
  }

  private assertWriter(statement: PreparedStatement, operation: string): void {
    if (statement.columnCount !== 0) {
      throw new EidosAdapterError(
        "invalid-argument",
        operation + " requires one no-result statement"
      )
    }
    this.assertStatementAllowed(statement)
  }

  private assertStatementAllowed(statement: PreparedStatement): void {
    if (
      this.transactionModes.at(-1) === "read" &&
      this.sqlite3.capi.sqlite3_stmt_readonly(statement.pointer!) === 0
    ) {
      throw new EidosAdapterError(
        "read-only",
        "Mutating statement is forbidden in a read transaction"
      )
    }
  }

  private runResult(): RunResult {
    const pointer = this.database.pointer
    if (!pointer) {
      throw new EidosAdapterError("adapter-closed", "Connection is closed")
    }
    return {
      changes: String(this.sqlite3.capi.sqlite3_changes64(pointer)),
      lastInsertRowid: String(
        this.sqlite3.capi.sqlite3_last_insert_rowid(pointer)
      ),
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
    try {
      const version = this.database.selectArray(
        "SELECT sqlite_version(), sqlite_source_id()"
      )
      if (
        typeof version?.[0] !== "string" ||
        compareSqliteVersion(version[0], "3.45.0") < 0 ||
        typeof version[1] !== "string" ||
        version[1].length === 0
      ) {
        throw new EidosAdapterError(
          "unsupported-capability",
          "SQLite 3.45.0 or later with source ID is required"
        )
      }
      const json = this.database.selectArray(
        "SELECT json_valid('[]'), json_array_length('[1,2]')"
      )
      const foreignKeys = this.database.selectValue("PRAGMA foreign_keys")
      const trustedSchema = this.database.selectValue("PRAGMA trusted_schema")
      const boundaryStatement = this.database.prepare(
        "SELECT CAST('-9223372036854775808' AS INTEGER), " +
          "CAST('9223372036854775807' AS INTEGER), X'000102FF'"
      )
      try {
        if (!boundaryStatement.step()) {
          throw new EidosAdapterError(
            "unsupported-capability",
            "SQLite mandatory value probe returned no row"
          )
        }
        const values = this.readRow(boundaryStatement)
        if (
          values[0]?.tag !== "integer" ||
          values[0].value !== "-9223372036854775808" ||
          values[1]?.tag !== "integer" ||
          values[1].value !== "9223372036854775807" ||
          values[2]?.tag !== "blob" ||
          hex(values[2].value) !== "000102ff"
        ) {
          throw new EidosAdapterError(
            "unsupported-capability",
            "SQLite mandatory value probe failed"
          )
        }
      } finally {
        boundaryStatement.finalize()
      }
      if (
        Number(json?.[0]) !== 1 ||
        Number(json?.[1]) !== 2 ||
        Number(foreignKeys) !== 1 ||
        Number(trustedSchema) !== 0
      ) {
        throw new EidosAdapterError(
          "unsupported-capability",
          "SQLite mandatory JSON/PRAGMA probes failed"
        )
      }
      this.database.exec("BEGIN")
      try {
        this.database.exec(
          "CREATE TEMP TABLE eidos_adapter_probe(" +
            "id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT"
        )
        const returned = this.database.selectArray(
          "INSERT INTO eidos_adapter_probe(value) VALUES ('ok') RETURNING id, value"
        )
        if (Number(returned?.[0]) !== 1 || returned?.[1] !== "ok") {
          throw new EidosAdapterError(
            "unsupported-capability",
            "SQLite STRICT/RETURNING probe failed"
          )
        }
        this.database.exec("DROP TABLE eidos_adapter_probe")
        this.database.exec("ROLLBACK")
      } catch (error) {
        this.database.exec("ROLLBACK")
        throw error
      }
      this.registerScalar(
        {
          name: "eidos_adapter_probe_scalar",
          arity: 1,
          deterministic: true,
          directOnly: true,
        },
        (value) => value
      )
      const storage = this.query(
        "SELECT " +
          "typeof(eidos_adapter_probe_scalar(NULL)), " +
          "typeof(eidos_adapter_probe_scalar(1)), " +
          "typeof(eidos_adapter_probe_scalar(1.0)), " +
          "typeof(eidos_adapter_probe_scalar('x')), " +
          "typeof(eidos_adapter_probe_scalar(X'0001')), " +
          "hex(eidos_adapter_probe_scalar(X'0001'))"
      ).rows[0]
      const expected = ["null", "integer", "real", "text", "blob", "0001"]
      if (
        !storage ||
        storage.length !== expected.length ||
        storage.some(
          (value, index) =>
            value.tag !== "text" || value.value !== expected[index]
        )
      ) {
        throw new EidosAdapterError(
          "unsupported-capability",
          "Scalar function storage-class probe failed"
        )
      }
      return version[0]
    } catch (error) {
      const mapped = this.mapError(error)
      if (mapped instanceof EidosAdapterError) throw mapped
      throw new EidosAdapterError(
        "unsupported-capability",
        "SQLite mandatory probes failed"
      )
    }
  }

  private assertOpen(): void {
    if (this.closed || !this.database.pointer) {
      throw new EidosAdapterError("adapter-closed", "Connection is closed")
    }
  }

  private mapError(error: unknown): Error {
    if (error instanceof EidosAdapterError) return error
    const pointer = this.database.pointer
    const extended = pointer
      ? this.sqlite3.capi.sqlite3_extended_errcode(pointer)
      : undefined
    const primary = extended === undefined ? undefined : extended & 0xff
    const message =
      error instanceof Error ? error.message : "SQLite WASM failure"
    switch (primary) {
      case 5:
        return new EidosAdapterError(
          "busy",
          "SQLite is busy",
          true,
          false,
          5,
          extended
        )
      case 6:
        return new EidosAdapterError(
          "locked",
          "SQLite is locked",
          false,
          false,
          6,
          extended
        )
      case 8:
        return new EidosAdapterError(
          "read-only",
          "SQLite is read-only",
          false,
          false,
          8,
          extended
        )
      case 9:
        return new EidosAdapterError(
          "cancelled",
          "SQLite was interrupted",
          false,
          false,
          9,
          extended
        )
      case 10:
        return new EidosAdapterError(
          "io-error",
          "SQLite I/O failed",
          false,
          false,
          10,
          extended
        )
      case 11:
        return new EidosAdapterError(
          "corrupt",
          "SQLite database is corrupt",
          false,
          true,
          11,
          extended
        )
      case 18:
        return new EidosAdapterError(
          "resource-limit",
          "SQLite value is too large",
          false,
          false,
          18,
          extended
        )
      case 19:
        return new EidosAdapterError(
          "constraint",
          "SQLite constraint failed",
          false,
          false,
          19,
          extended
        )
      case 21:
        return new EidosAdapterError(
          "protocol-error",
          "SQLite driver misuse",
          false,
          true,
          21,
          extended
        )
      case 26:
        return new EidosAdapterError(
          "not-a-database",
          "Input is not a SQLite database",
          false,
          true,
          26,
          extended
        )
    }
    if (
      error instanceof RangeError ||
      error instanceof TypeError ||
      /bind|parameter/i.test(message)
    ) {
      return new EidosAdapterError("invalid-argument", message)
    }
    return new EidosAdapterError(
      "io-error",
      message,
      false,
      false,
      primary,
      extended
    )
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

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    ""
  )
}

function measureColumns(columns: readonly { name: string }[]): number {
  return columns.reduce(
    (total, column) => total + UTF8.encode(column.name).byteLength,
    0
  )
}

function measureRow(row: readonly SqlValue[]): number {
  return row.reduce((total, value) => {
    switch (value.tag) {
      case "null":
        return total
      case "integer":
        return total + UTF8.encode(value.value).byteLength
      case "real":
        return total + 8
      case "text":
        return total + UTF8.encode(value.value).byteLength
      case "blob":
        return total + value.value.byteLength
    }
  }, 0)
}
