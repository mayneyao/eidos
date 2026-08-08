import { Buffer } from "node:buffer"
import { createHash, randomBytes } from "node:crypto"
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from "node:sqlite"

import { nativeToSqlValue, sqlValueToNative } from "../connection-port"
import type { QuickJsHostBridge, QuickJsHostError } from "./port"
import {
  bytesToBase64,
  sqlValuesToWire,
  wireToSqlValue,
  type WireSqlValue,
} from "./wire"

const BUSY_TIMEOUT_MS = 5_000

function hostError(
  code: string,
  message: string,
  extra: Partial<QuickJsHostError> = {}
): string {
  return JSON.stringify({
    ok: false,
    error: { code, message, retryable: false, fatal: false, ...extra },
  })
}

function ok(value: unknown): string {
  return JSON.stringify({ ok: true, value })
}

function mapSqliteError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const numericPrimary = sqlitePrimaryCode(error)
  const mapped =
    numericPrimary === 19
      ? "constraint"
      : numericPrimary === 5
        ? "busy"
        : numericPrimary === 6
          ? "locked"
          : numericPrimary === 8
            ? "read-only"
            : numericPrimary === 9
              ? "cancelled"
              : numericPrimary === 10
                ? "io-error"
                : numericPrimary === 11
                  ? "corrupt"
                  : numericPrimary === 26
                    ? "not-a-database"
                    : "sql-error"
  return hostError(mapped, message, {
    sqlitePrimaryCode: Number.isFinite(numericPrimary) ? numericPrimary : 0,
  })
}

function sqlitePrimaryCode(error: unknown): number {
  return Number((error as { errcode?: unknown }).errcode ?? 0) & 0xff
}

function mapReadOnlyError(error: unknown, forbidWrite: boolean): string {
  if (forbidWrite && sqlitePrimaryCode(error) === 8) {
    return hostError(
      "read-only",
      "Mutating statement is forbidden in a read transaction",
      { sqlitePrimaryCode: 8 }
    )
  }
  return mapSqliteError(error)
}

function parseBindings(bindingsJson: string): SQLInputValue[] {
  const wire = JSON.parse(bindingsJson) as WireSqlValue[]
  return wire.map(
    (value) => sqlValueToNative(wireToSqlValue(value)) as SQLInputValue
  )
}

function prepare(
  database: DatabaseSync,
  sql: string,
  arrays = false
): StatementSync {
  const statement = database.prepare(sql)
  statement.setReadBigInts(true)
  statement.setAllowBareNamedParameters(false)
  statement.setAllowUnknownNamedParameters(false)
  if (arrays) statement.setReturnArrays(true)
  return statement
}

function withReadOnlyGuard<T>(
  database: DatabaseSync,
  forbidWrite: boolean,
  operation: () => T
): T {
  if (!forbidWrite) return operation()
  database.exec("PRAGMA query_only = ON")
  try {
    return operation()
  } finally {
    database.exec("PRAGMA query_only = OFF")
  }
}

export interface NodeSqliteHostBridgeOptions {
  serialize?: () => Uint8Array
}

/**
 * node:sqlite reference implementation of the Rust rusqlite host bridge
 * contract. It validates the QuickJS port logic before involving rquickjs;
 * the Rust side must reproduce these envelopes.
 */
export function createNodeSqliteHostBridge(
  database: DatabaseSync,
  options: NodeSqliteHostBridgeOptions = {}
): QuickJsHostBridge {
  database.exec(
    `PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`
  )

  return {
    exec(sql: string): string {
      try {
        database.exec(sql)
        return ok(null)
      } catch (error) {
        return mapSqliteError(error)
      }
    },

    query(sql: string, bindingsJson: string, forbidWrite: boolean): string {
      try {
        const statement = prepare(database, sql, true)
        const columns = statement.columns()
        if (columns.length === 0) {
          return hostError(
            "invalid-argument",
            "query requires one row-producing statement"
          )
        }
        const rows = withReadOnlyGuard(database, forbidWrite, () =>
          statement.all(...parseBindings(bindingsJson))
        ) as unknown as SQLInputValue[][]
        return ok({
          columns: columns.map((column) => ({ name: column.name })),
          rows: rows.map((row) => sqlValuesToWire(row.map(nativeToSqlValue))),
        })
      } catch (error) {
        return mapReadOnlyError(error, forbidWrite)
      }
    },

    run(sql: string, bindingsJson: string, forbidWrite: boolean): string {
      try {
        const statement = prepare(database, sql)
        if (statement.columns().length > 0) {
          return hostError(
            "invalid-argument",
            "run requires one no-result statement"
          )
        }
        const result = withReadOnlyGuard(database, forbidWrite, () =>
          statement.run(...parseBindings(bindingsJson))
        )
        return ok({
          changes: String(result.changes),
          lastInsertRowid: String(result.lastInsertRowid),
        })
      } catch (error) {
        return mapReadOnlyError(error, forbidWrite)
      }
    },

    registerScalar(name: string, arity: number): string {
      try {
        const trampoline = (...values: SQLInputValue[]) => {
          const argsJson = JSON.stringify(
            sqlValuesToWire(values.map(nativeToSqlValue))
          )
          const dispatch = (
            globalThis as unknown as {
              __eidos_scalar_dispatch: (name: string, args: string) => string
            }
          ).__eidos_scalar_dispatch
          const response = JSON.parse(dispatch(name, argsJson)) as
            | { ok: true; value: WireSqlValue }
            | { ok: false; error: { message: string } }
          if (!response.ok) throw new Error(response.error.message)
          return sqlValueToNative(wireToSqlValue(response.value))
        }
        Object.defineProperty(trampoline, "length", { value: arity })
        database.function(
          name,
          {
            deterministic: true,
            directOnly: true,
            useBigIntArguments: true,
            varargs: false,
          },
          trampoline
        )
        return ok(null)
      } catch (error) {
        return mapSqliteError(error)
      }
    },

    dataVersion(): string {
      try {
        const statement = prepare(database, "PRAGMA data_version", true)
        const value = (statement.get() as unknown[] | undefined)?.[0]
        return ok(String(value))
      } catch (error) {
        return mapSqliteError(error)
      }
    },

    serialize(): string {
      try {
        const serialize =
          options.serialize ??
          (() => {
            const method = (
              database as DatabaseSync & {
                serialize?: (name?: string) => Uint8Array
              }
            ).serialize
            if (typeof method !== "function") {
              throw new Error("node:sqlite serialize() is unavailable")
            }
            return method.call(database, "main")
          })
        return ok(bytesToBase64(new Uint8Array(serialize())))
      } catch (error) {
        return mapSqliteError(error)
      }
    },

    interrupt(): string {
      return hostError(
        "unsupported-capability",
        "node:sqlite does not expose sqlite3_interrupt"
      )
    },

    randomBytes(length: number): string {
      return randomBytes(length).toString("base64")
    },

    sha256(bytesBase64: string): string {
      return createHash("sha256")
        .update(Buffer.from(bytesBase64, "base64"))
        .digest("base64")
    },

    log(level: string, message: string): void {
      void level
      void message
    },

    limits(): string {
      return ok({
        busyTimeoutMs: BUSY_TIMEOUT_MS,
        maxVariables: 32_766,
        maxSqlBytes: 1_000_000_000,
        maxValueBytes: 1_000_000_000,
      })
    },

    sqliteProbe(): string {
      try {
        const row = prepare(
          database,
          "SELECT sqlite_version() AS version, sqlite_source_id() AS source"
        ).get() as { version: string; source: string }
        return ok({ sqliteVersion: row.version, sourceId: row.source })
      } catch (error) {
        return mapSqliteError(error)
      }
    },
  }
}
