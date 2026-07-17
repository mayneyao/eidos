import { existsSync, openSync, closeSync, readSync, statSync } from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

import type {
  EidosFileConnection,
  EidosFileRunResult,
  EidosFileSqlParams,
} from "./connection"
import { EIDOS_FILE_EXTENSION, SQLITE_HEADER } from "./constants"
import { EidosFileError } from "./errors"
import { migrateEidosFileSchema } from "./migrations"
import { EidosFileRuntime } from "./runtime"
import { initializeEidosFileSchema } from "./schema"
import type { CreateEidosFileOptions } from "./types"
import { validateEidosFile } from "./validation"

const DEFAULT_STATEMENT_CACHE_SIZE = 128

export interface BetterSqlite3EidosFileConnectionOptions {
  statementCacheSize?: number
}

export class BetterSqlite3EidosFileConnection implements EidosFileConnection {
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
    const statement = this.database.prepare(sql)
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
    return this.prepare(sql).all(...params) as T[]
  }

  get<T extends object>(
    sql: string,
    params: EidosFileSqlParams = []
  ): T | undefined {
    return this.prepare(sql).get(...params) as T | undefined
  }

  run(sql: string, params: EidosFileSqlParams = []): EidosFileRunResult {
    return this.prepare(sql).run(...params)
  }

  runMany(sql: string, parameterSets: readonly EidosFileSqlParams[]): void {
    const statement = this.prepare(sql)
    for (const params of parameterSets) statement.run(...params)
  }

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)()
  }

  close(): void {
    this.clearStatements()
    this.database.close()
  }
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
    connection.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;")
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
  options: { migrate?: boolean; readonly?: boolean } = {}
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
    connection.exec("PRAGMA foreign_keys = ON")
    const initial = validateEidosFile(connection)
    const onlyMigrationWarnings =
      initial.errors.length === 0 &&
      initial.warnings.some(
        (warning) => warning.code === "schema-migration-available"
      )
    if (options.migrate && !options.readonly && onlyMigrationWarnings) {
      migrateEidosFileSchema(connection)
    }
    const result = validateEidosFile(connection)
    if (!result.valid) {
      throw new EidosFileError(
        "not-eidos-file",
        result.errors.map((issue) => issue.message).join("; ")
      )
    }
    const runtime = new EidosFileRuntime(connection, true)
    if (options.migrate && !options.readonly) runtime.optimizeViewQueries()
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
    return validateEidosFile(connection)
  } finally {
    connection.close()
  }
}
