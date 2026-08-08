import type Database from "better-sqlite3"

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
  const code =
    typeof (error as { code?: unknown })?.code === "string"
      ? ((error as { code: string }).code as string)
      : ""
  const message = error instanceof Error ? error.message : String(error)
  const primary = /^SQLITE_([A-Z]+)/.exec(code)?.[1] ?? ""
  const numericPrimary = Number((error as { code?: string }).code ?? 0) & 0xff
  const mapped =
    primary === "CONSTRAINT"
      ? "constraint"
      : primary === "BUSY"
        ? "busy"
        : primary === "LOCKED"
          ? "locked"
          : primary === "READONLY"
            ? "read-only"
            : primary === "INTERRUPT"
              ? "cancelled"
              : primary === "IOERR"
                ? "io-error"
                : primary === "CORRUPT"
                  ? "corrupt"
                  : primary === "NOTADB"
                    ? "not-a-database"
                    : "sql-error"
  return hostError(mapped, message, {
    sqlitePrimaryCode: Number.isFinite(numericPrimary) ? numericPrimary : 0,
  })
}

function parseBindings(bindingsJson: string): unknown[] {
  const wire = JSON.parse(bindingsJson) as WireSqlValue[]
  if (wire.length === 0) return []
  const named: Record<string, unknown> = {}
  wire.forEach((value, index) => {
    // better-sqlite3 exposes SQLite's ?NNN parameters through its named-
    // parameter object API. The bridge ABI remains positional; the Rust side
    // binds by sqlite3_bind_parameter_index instead.
    named[String(index + 1)] = sqlValueToNative(wireToSqlValue(value))
  })
  return [named]
}

/**
 * Reference implementation of the Rust rusqlite host bridge contract, used to
 * validate the QuickJS port logic in Node before involving rquickjs. The Rust
 * side must reproduce this behavior envelope-for-envelope.
 */
export function createBetterSqlite3HostBridge(
  database: Database.Database
): QuickJsHostBridge {
  database.pragma("foreign_keys = ON")
  database.pragma("trusted_schema = OFF")
  database.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`)

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
        const statement = database.prepare(sql).safeIntegers(true)
        if (!statement.reader) {
          return hostError(
            "invalid-argument",
            "query requires one row-producing statement"
          )
        }
        if (forbidWrite && !statement.readonly) {
          return hostError(
            "read-only",
            "Mutating statement is forbidden in a read transaction"
          )
        }
        const rows = statement
          .raw(true)
          .all(...parseBindings(bindingsJson)) as unknown[][]
        return ok({
          columns: statement.columns().map((column) => ({ name: column.name })),
          rows: rows.map((row) => sqlValuesToWire(row.map(nativeToSqlValue))),
        })
      } catch (error) {
        return mapSqliteError(error)
      }
    },

    run(sql: string, bindingsJson: string, forbidWrite: boolean): string {
      try {
        const statement = database.prepare(sql).safeIntegers(true)
        if (statement.reader) {
          return hostError(
            "invalid-argument",
            "run requires one no-result statement"
          )
        }
        if (forbidWrite && !statement.readonly) {
          return hostError(
            "read-only",
            "Mutating statement is forbidden in a read transaction"
          )
        }
        const result = statement.run(...parseBindings(bindingsJson))
        return ok({
          changes: String(result.changes),
          lastInsertRowid: String(result.lastInsertRowid),
        })
      } catch (error) {
        return mapSqliteError(error)
      }
    },

    registerScalar(name: string, arity: number): string {
      try {
        const trampoline = (...values: unknown[]) => {
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
            safeIntegers: true,
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
        const value = database.pragma("data_version", { simple: true })
        return ok(String(value))
      } catch (error) {
        return mapSqliteError(error)
      }
    },

    serialize(): string {
      try {
        const buffer = database.serialize()
        return ok(bytesToBase64(new Uint8Array(buffer)))
      } catch (error) {
        return mapSqliteError(error)
      }
    },

    interrupt(): string {
      return hostError(
        "unsupported-capability",
        "better-sqlite3 does not expose sqlite3_interrupt"
      )
    },

    randomBytes(length: number): string {
      const bytes = new Uint8Array(length)
      for (let index = 0; index < length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256)
      }
      return bytesToBase64(bytes)
    },

    sha256(bytesBase64: string): string {
      // Only used when the polyfilled crypto.subtle.digest runs under Node,
      // which never happens because Node provides real WebCrypto.
      void bytesBase64
      throw new Error("sha256 host call is unavailable in the Node bridge")
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
        const row = database
          .prepare(
            "SELECT sqlite_version() AS version, sqlite_source_id() AS source"
          )
          .get() as { version: string; source: string }
        return ok({ sqliteVersion: row.version, sourceId: row.source })
      } catch (error) {
        return mapSqliteError(error)
      }
    },
  }
}
