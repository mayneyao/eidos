import type {
  AdapterError,
  AdapterErrorCode,
  ConnectionPort,
  SqlValue,
} from "./adapter-contract"
import type { EidosFileConnection, EidosFileSqlPrimitive } from "./connection"

const INT64_MIN = -9_223_372_036_854_775_808n
const INT64_MAX = 9_223_372_036_854_775_807n

/** Validates the exact `?1` through `?N` EA-Connection binding grammar. */
export function exactConnectionBindingCount(sql: string): number {
  const occurrences = new Map<number, number>()
  const skipQuoted = (start: number, terminator: string): number => {
    for (let index = start + 1; index < sql.length; index += 1) {
      if (sql[index] !== terminator) continue
      if (terminator !== "]" && sql[index + 1] === terminator) {
        index += 1
        continue
      }
      return index
    }
    return sql.length
  }
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]!
    if (character === "'" || character === '"' || character === "`") {
      index = skipQuoted(index, character)
      continue
    }
    if (character === "[") {
      index = skipQuoted(index, "]")
      continue
    }
    if (character === "-" && sql[index + 1] === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1
      continue
    }
    if (character === "/" && sql[index + 1] === "*") {
      index += 2
      while (
        index < sql.length &&
        !(sql[index] === "*" && sql[index + 1] === "/")
      )
        index += 1
      index += 1
      continue
    }
    if (character === ":" || character === "@" || character === "$") {
      throw new EidosAdapterError(
        "invalid-argument",
        "ConnectionPort forbids named SQL parameters"
      )
    }
    if (character !== "?") continue
    let end = index + 1
    while (end < sql.length && /[0-9]/.test(sql[end]!)) end += 1
    const token = sql.slice(index + 1, end)
    if (!/^[1-9][0-9]*$/.test(token)) {
      throw new EidosAdapterError(
        "invalid-argument",
        "ConnectionPort parameters must use canonical ?1 through ?N tokens"
      )
    }
    const parameter = Number(token)
    if (!Number.isSafeInteger(parameter)) {
      throw new EidosAdapterError(
        "invalid-argument",
        "ConnectionPort parameter index is out of range"
      )
    }
    occurrences.set(parameter, (occurrences.get(parameter) ?? 0) + 1)
    index = end - 1
  }
  const count = occurrences.size
  for (let parameter = 1; parameter <= count; parameter += 1) {
    if (occurrences.get(parameter) !== 1) {
      throw new EidosAdapterError(
        "invalid-argument",
        "ConnectionPort requires each parameter ?1 through ?N exactly once"
      )
    }
  }
  return count
}

export function assertExactConnectionBindings(
  sql: string,
  bindings: readonly SqlValue[]
): void {
  const count = exactConnectionBindingCount(sql)
  if (count !== bindings.length) {
    throw new EidosAdapterError(
      "invalid-argument",
      `Statement requires ${count} bindings, received ${bindings.length}`
    )
  }
}

function canonicalizeLegacyConnectionSql(sql: string): string {
  let result = ""
  let parameter = 0
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]!
    result += character
    if (character === "'" || character === '"' || character === "`") {
      for (index += 1; index < sql.length; index += 1) {
        result += sql[index]!
        if (sql[index] !== character) continue
        if (sql[index + 1] === character) {
          result += sql[++index]!
          continue
        }
        break
      }
      continue
    }
    if (character === "[") {
      for (index += 1; index < sql.length; index += 1) {
        result += sql[index]!
        if (sql[index] === "]") break
      }
      continue
    }
    if (character === "-" && sql[index + 1] === "-") {
      while (++index < sql.length) {
        result += sql[index]!
        if (sql[index] === "\n") break
      }
      continue
    }
    if (character === "/" && sql[index + 1] === "*") {
      result += sql[++index]!
      while (++index < sql.length) {
        result += sql[index]!
        if (sql[index] === "*" && sql[index + 1] === "/") {
          result += sql[++index]!
          break
        }
      }
      continue
    }
    if (character === "?") {
      if (/[0-9]/.test(sql[index + 1] ?? "")) {
        throw new EidosAdapterError(
          "invalid-argument",
          "Legacy Runtime SQL cannot mix numbered parameters"
        )
      }
      result += String(++parameter)
    }
  }
  return result
}

export class EidosAdapterError extends Error implements AdapterError {
  readonly name = "EidosAdapterError"

  constructor(
    readonly code: AdapterErrorCode,
    message: string,
    readonly retryable = false,
    readonly fatal = false,
    readonly sqlitePrimaryCode?: number,
    readonly sqliteExtendedCode?: number
  ) {
    super(message)
  }
}

export function assertInt64Decimal(value: string): bigint {
  if (!/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(value) || value === "-0") {
    throw new EidosAdapterError(
      "invalid-sql-value",
      "INTEGER must use canonical signed int64 decimal text"
    )
  }
  const parsed = BigInt(value)
  if (parsed < INT64_MIN || parsed > INT64_MAX) {
    throw new EidosAdapterError(
      "invalid-sql-value",
      "INTEGER is outside signed int64 range"
    )
  }
  return parsed
}

export function assertUnicodeString(value: string, label = "TEXT"): string {
  if (
    /[\uD800-\uDFFF]/u.test(
      Array.from(value)
        .filter((part) => part.length === 1)
        .join("")
    )
  ) {
    throw new EidosAdapterError(
      "invalid-sql-value",
      label + " contains an unpaired surrogate"
    )
  }
  return value
}

export function sqlValueToNative(value: SqlValue): EidosFileSqlPrimitive {
  switch (value.tag) {
    case "null":
      return null
    case "integer":
      return assertInt64Decimal(value.value)
    case "real":
      if (!Number.isFinite(value.value)) {
        throw new EidosAdapterError(
          "invalid-sql-value",
          "REAL must be finite binary64"
        )
      }
      return Object.is(value.value, -0) ? 0 : value.value
    case "text":
      return assertUnicodeString(value.value)
    case "blob":
      return value.value.slice()
  }
}

export function nativeToSqlValue(value: unknown): SqlValue {
  if (value === null) return { tag: "null" }
  if (typeof value === "bigint") {
    if (value < INT64_MIN || value > INT64_MAX) {
      throw new EidosAdapterError(
        "invalid-sql-value",
        "SQLite returned an INTEGER outside signed int64 range",
        false,
        true
      )
    }
    return { tag: "integer", value: String(value) }
  }
  if (typeof value === "number") {
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
  if (typeof value === "string") {
    return { tag: "text", value: assertUnicodeString(value) }
  }
  if (
    ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === "[object Uint8Array]"
  ) {
    // Buffer overrides Uint8Array#slice() to return another Buffer. Copy via
    // a fresh Uint8Array so every Adapter binding publishes the exact
    // cross-host ABI, including when Electron supplies a foreign-realm Buffer.
    const view = value as ArrayBufferView
    const bytes = new Uint8Array(view.byteLength)
    bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    return { tag: "blob", value: bytes }
  }
  if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") {
    const source = new Uint8Array(value as ArrayBuffer)
    return { tag: "blob", value: new Uint8Array(source) }
  }
  throw new EidosAdapterError(
    "invalid-sql-value",
    "Unsupported SQLite storage value: " + typeof value,
    false,
    true
  )
}

/**
 * Compatibility bridge for the pre-1.0 synchronous engine. New Adapter code
 * exposes ConnectionPort; this bridge is kept inside Runtime composition and
 * is never handed to UI/application code.
 */
export class ConnectionPortEidosFileConnection implements EidosFileConnection {
  readonly capabilities

  constructor(readonly port: ConnectionPort) {
    const capabilities = port.capabilities()
    this.capabilities = {
      int64: capabilities.int64,
      json1: capabilities.json1,
      returning: capabilities.returning,
      interrupt: capabilities.interrupt,
      scalarFunctions: capabilities.scalarFunctions,
    }
  }

  exec(sql: string): void {
    // ConnectionPort adapters establish mandatory connection PRAGMAs before
    // Runtime composition. The compatibility core repeats the same setup in
    // its constructor; suppress only that exact, idempotent initialization so
    // Runtime.open can compose over a genuinely read-only Adapter connection.
    if (
      sql.trim() === "PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;"
    ) {
      return
    }
    this.port.execSchema(sql)
  }

  query<T extends object>(
    sql: string,
    params: readonly EidosFileSqlPrimitive[] = []
  ): T[] {
    const result = this.port.query(
      canonicalizeLegacyConnectionSql(sql),
      params.map(nativeParameterToSqlValue)
    )
    return result.rows.map((row) =>
      Object.fromEntries(
        row.map((value, index) => [
          result.columns[index]!.name,
          sqlValueToLegacy(value),
        ])
      )
    ) as T[]
  }

  get<T extends object>(
    sql: string,
    params: readonly EidosFileSqlPrimitive[] = []
  ): T | undefined {
    const result = this.port.get(
      canonicalizeLegacyConnectionSql(sql),
      params.map(nativeParameterToSqlValue)
    )
    if (!result.row) return undefined
    return Object.fromEntries(
      result.row.map((value, index) => [
        result.columns[index]!.name,
        sqlValueToLegacy(value),
      ])
    ) as T
  }

  run(sql: string, params: readonly EidosFileSqlPrimitive[] = []) {
    const result = this.port.run(
      canonicalizeLegacyConnectionSql(sql),
      params.map(nativeParameterToSqlValue)
    )
    return {
      changes: Number(assertInt64Decimal(result.changes)),
      lastInsertRowid: assertInt64Decimal(result.lastInsertRowid),
    }
  }

  runMany(
    sql: string,
    parameterSets: readonly (readonly EidosFileSqlPrimitive[])[]
  ): void {
    this.port.runMany(
      canonicalizeLegacyConnectionSql(sql),
      parameterSets.map((params) => params.map(nativeParameterToSqlValue))
    )
  }

  registerFunction(
    name: string,
    operation: (...values: EidosFileSqlPrimitive[]) => EidosFileSqlPrimitive,
    arity = operation.length
  ): void {
    this.port.registerScalar(
      { name, arity, deterministic: true, directOnly: true },
      (...values) =>
        nativeParameterToSqlValue(operation(...values.map(sqlValueToLegacy)))
    )
  }

  transaction<T>(operation: () => T): T {
    return this.port.transaction("write", operation)
  }

  dataVersion(): number {
    const token = this.port.dataVersion()
    let hash = 2_166_136_261
    for (const character of token) {
      hash ^= character.codePointAt(0) ?? 0
      hash = Math.imul(hash, 16_777_619)
    }
    return hash >>> 0
  }

  interrupt(): void {
    this.port.interrupt()
  }

  close(): void {
    this.port.close()
  }
}

function nativeParameterToSqlValue(value: EidosFileSqlPrimitive): SqlValue {
  if (value === null) return { tag: "null" }
  if (typeof value === "bigint") return { tag: "integer", value: String(value) }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new EidosAdapterError(
        "invalid-sql-value",
        "SQL number must be finite"
      )
    }
    return Number.isInteger(value)
      ? { tag: "integer", value: String(value) }
      : { tag: "real", value }
  }
  if (typeof value === "string") return { tag: "text", value }
  return { tag: "blob", value: value.slice() }
}

function sqlValueToLegacy(value: SqlValue): EidosFileSqlPrimitive {
  switch (value.tag) {
    case "null":
      return null
    case "integer": {
      const integer = assertInt64Decimal(value.value)
      return integer >= BigInt(Number.MIN_SAFE_INTEGER) &&
        integer <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(integer)
        : integer
    }
    case "real":
      return value.value
    case "text":
      return value.value
    case "blob":
      return value.value.slice()
  }
}
