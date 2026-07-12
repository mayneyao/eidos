import { existsSync, openSync, closeSync, readSync, statSync } from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

import type { BaseConnection, BaseRunResult, BaseSqlParams } from "./connection"
import { BASE_FILE_EXTENSION, SQLITE_HEADER } from "./constants"
import { BaseError } from "./errors"
import { migrateBaseSchema } from "./migrations"
import { BaseRuntime } from "./runtime"
import { initializeBaseSchema } from "./schema"
import type { CreateBaseOptions } from "./types"
import { validateBase } from "./validation"

export class BetterSqlite3BaseConnection implements BaseConnection {
  constructor(readonly database: Database.Database) {}

  exec(sql: string): void {
    this.database.exec(sql)
  }

  query<T extends object>(sql: string, params: BaseSqlParams = []): T[] {
    return this.database.prepare(sql).all(...params) as T[]
  }

  get<T extends object>(
    sql: string,
    params: BaseSqlParams = []
  ): T | undefined {
    return this.database.prepare(sql).get(...params) as T | undefined
  }

  run(sql: string, params: BaseSqlParams = []): BaseRunResult {
    return this.database.prepare(sql).run(...params)
  }

  runMany(sql: string, parameterSets: readonly BaseSqlParams[]): void {
    const statement = this.database.prepare(sql)
    for (const params of parameterSets) statement.run(...params)
  }

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)()
  }

  close(): void {
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

export function createBaseFile(
  filePath: string,
  options: CreateBaseOptions = {}
): BaseRuntime {
  if (path.extname(filePath).toLowerCase() !== BASE_FILE_EXTENSION) {
    throw new BaseError(
      "invalid-identifier",
      `Base files must use the ${BASE_FILE_EXTENSION} extension`
    )
  }
  if (existsSync(filePath) && statSync(filePath).size > 0) {
    throw new BaseError("file-exists", `Base file already exists: ${filePath}`)
  }
  const database = new Database(filePath)
  const connection = new BetterSqlite3BaseConnection(database)
  try {
    connection.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;")
    initializeBaseSchema(connection, options)
    const runtime = new BaseRuntime(connection, true)
    if (options.defaultTable) runtime.createTable(options.defaultTable)
    return runtime
  } catch (error) {
    connection.close()
    throw error
  }
}

export function openBaseFile(
  filePath: string,
  options: { migrate?: boolean; readonly?: boolean } = {}
): BaseRuntime {
  if (!existsSync(filePath)) {
    throw new BaseError("file-not-found", `Base file not found: ${filePath}`)
  }
  if (!hasSqliteHeader(filePath)) {
    throw new BaseError("invalid-sqlite", `Not a SQLite file: ${filePath}`)
  }
  const database = new Database(filePath, {
    fileMustExist: true,
    readonly: options.readonly ?? false,
  })
  const connection = new BetterSqlite3BaseConnection(database)
  try {
    connection.exec("PRAGMA foreign_keys = ON")
    const initial = validateBase(connection)
    const onlyMigrationWarnings =
      initial.errors.length === 0 &&
      initial.warnings.some(
        (warning) => warning.code === "schema-migration-available"
      )
    if (options.migrate && !options.readonly && onlyMigrationWarnings) {
      migrateBaseSchema(connection)
    }
    const result = validateBase(connection)
    if (!result.valid) {
      throw new BaseError(
        "not-base",
        result.errors.map((issue) => issue.message).join("; ")
      )
    }
    return new BaseRuntime(connection, true)
  } catch (error) {
    connection.close()
    throw error
  }
}

export function inspectBaseFile(filePath: string) {
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
  const connection = new BetterSqlite3BaseConnection(database)
  try {
    return validateBase(connection)
  } finally {
    connection.close()
  }
}
