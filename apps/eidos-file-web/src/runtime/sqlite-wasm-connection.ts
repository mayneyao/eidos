import type {
  EidosFileConnection,
  EidosFileRunResult,
  EidosFileSqlParams,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import type sqlite3InitModule from "@sqlite.org/sqlite-wasm"

type Sqlite3Static = Awaited<ReturnType<typeof sqlite3InitModule>>
type SqliteDatabase = InstanceType<Sqlite3Static["oo1"]["DB"]>

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

function sqliteParams(
  params: EidosFileSqlParams
): readonly EidosFileSqlPrimitive[] {
  return params
}

/**
 * The browser driver for @eidos.space/eidos-file. It deliberately stays at the
 * package's EidosFileConnection boundary: schema and query semantics
 * continue to live in the shared runtime.
 */
export class SQLiteWasmEidosFileConnection implements EidosFileConnection {
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
    const rows = this.database.selectObjects(sql, sqliteParams(params))
    return rows.map((row) =>
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
      if (params.length > 0) statement.bind(sqliteParams(params))
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
        statement.bind(sqliteParams(params)).step()
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
    const depth = this.transactionDepth
    const savepoint = `eidos_base_${depth}`
    this.transactionDepth += 1
    this.database.exec(
      depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`
    )
    try {
      const result = operation()
      this.database.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`)
      return result
    } catch (error) {
      if (depth === 0) {
        this.database.exec("ROLLBACK")
      } else {
        this.database.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`)
      }
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
