import type { Database } from "bun:sqlite"
import { BaseServerDatabase } from "@eidos.space/core/sqlite/interface"
import { dbManager } from "./database-manager"

/**
 * Bun SQLite database adapter that extends BaseServerDatabase
 *
 * This adapter integrates Bun's native SQLite with Eidos Core's
 * database abstraction layer, following the adapter pattern.
 *
 * Features:
 * - Connection pooling via DatabaseManager
 * - Full BaseServerDatabase interface implementation
 * - Support for transactions
 * - Extension loading support
 */
export class BunServerDatabase extends BaseServerDatabase {
  db: Database

  /**
   * Create a new BunServerDatabase instance
   * @param dbPath Path to the SQLite database file
   * @param options Database open options
   */
  constructor(
    dbPath: string,
    options: {
      create?: boolean
      readonly?: boolean
      readwrite?: boolean
    } = { readwrite: true }
  ) {
    super()
    this.filename = dbPath

    console.log(`[BunServerDatabase] Opening database: ${dbPath}`)
    console.log(`[BunServerDatabase] Options:`, options)

    try {
      // Use database manager to get/reuse connection
      this.db = dbManager.getConnection(dbPath, options)
      console.log(`[BunServerDatabase] ✓ Database connection acquired`)
    } catch (error: any) {
      console.error(`[BunServerDatabase] Failed to get database connection:`, {
        path: dbPath,
        error: error.message,
        code: error.code,
        errno: error.errno,
      })
      throw error
    }
  }

  /**
   * Prepare a SQL statement (BaseServerDatabase interface)
   */
  prepare(sql: string): {
    run: (bind?: any[]) => void
    all: (bind?: any[]) => Promise<any[]>
  } {
    const stmt = this.db.prepare(sql)
    return {
      run: (bind?: any[]) => {
        if (bind && bind.length > 0) {
          stmt.run(...bind)
        } else {
          stmt.run()
        }
      },
      all: (bind?: any[]) => {
        if (bind && bind.length > 0) {
          return Promise.resolve(stmt.all(...bind))
        }
        return Promise.resolve(stmt.all())
      },
    }
  }

  /**
   * Execute SQL with options (BaseServerDatabase interface)
   */
  async exec(
    opts:
      | string
      | {
          sql: string
          bind?: any[]
          rowMode?: "array" | "object"
          returnValue?: "resultRows" | "saveSql"
        }
  ): Promise<any> {
    // Handle string input (legacy compatibility)
    if (typeof opts === "string") {
      if (!opts || opts.trim().length === 0) {
        return { changes: 0 }
      }
      this.db.run(opts)
      return { changes: this.db.query("SELECT changes()").get() }
    }

    // Handle object input
    const { sql, bind, returnValue } = opts

    if (!sql || sql.trim().length === 0) {
      return { changes: 0 }
    }

    if (returnValue === "resultRows") {
      return this.selectObjects(sql, bind)
    }

    if (bind && bind.length > 0) {
      this.db.prepare(sql).run(...bind)
      return { changes: this.db.query("SELECT changes()").get() }
    }

    this.db.run(sql)
    return { changes: this.db.query("SELECT changes()").get() }
  }

  /**
   * Legacy exec methods for backward compatibility
   */
  exec2(sql: string, params?: any[]): any {
    return this.exec({ sql, bind: params })
  }

  syncExec(sql: string, params?: any[]): any {
    if (!sql || typeof sql !== "string" || sql.trim().length === 0) {
      return []
    }

    const stmt = this.db.prepare(sql)
    if (params && params.length > 0) {
      return stmt.all(...params)
    }
    return stmt.all()
  }

  syncExec2(sql: string, params?: any[]): Promise<any> {
    return Promise.resolve(this.syncExec(sql, params))
  }

  /**
   * Select objects (BaseServerDatabase interface)
   */
  async selectObjects(
    sql: string,
    bind?: any[]
  ): Promise<{ [columnName: string]: any }[]> {
    try {
      const stmt = this.db.prepare(sql)
      if (bind && bind.length > 0) {
        return stmt.all(...bind) as { [columnName: string]: any }[]
      }
      return stmt.all() as { [columnName: string]: any }[]
    } catch (error) {
      console.error("Error in selectObjects:", error)
      return []
    }
  }

  /**
   * Transaction support (BaseServerDatabase interface)
   */
  transaction(func: (db: BaseServerDatabase) => void): any {
    return this.db.transaction(() => {
      func(this)
    })()
  }

  /**
   * Create user-defined function (BaseServerDatabase interface)
   */
  createFunction(opt: { name: string; xFunc: (...args: any[]) => any }): any {
    // Bun SQLite doesn't support custom SQL functions in the same way
    // This would need native extension support
    console.warn(`⚠️  Custom function ${opt.name} not supported in Bun SQLite`)
  }

  /**
   * Load SQLite extension
   */
  loadExtension(path: string): void {
    try {
      this.db.loadExtension(path)
      console.log(`✓ Loaded extension: ${path.split("/").pop()}`)
    } catch (error: any) {
      console.warn(`⚠️  Could not load extension ${path.split("/").pop()}`)
    }
  }

  /**
   * Close the database connection (BaseServerDatabase interface)
   *
   * Note: This releases the connection back to the DatabaseManager,
   * which may not immediately close the underlying connection if
   * other references exist.
   */
  close(): void {
    if (this.filename) {
      dbManager.releaseConnection(this.filename)
    }
  }
}
