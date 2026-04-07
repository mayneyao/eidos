/**
 * Node.js SQLite database adapter for headless server
 * Based on desktop's NodeBaseServerDatabase
 */

// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "./env"

import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { BaseServerDatabase } from "../sqlite/interface"

export interface NodeServerDatabaseOptions {
  // SQLite extensions
  extensions?: {
    simple?: { libPath: string; dictPath: string }
    vec?: { libPath: string }
    graft?: { libPath: string }
  }
  // Graft sync enabled
  syncEnabled?: boolean
  // Logger
  logger?: Console
}

export class NodeServerDatabase extends BaseServerDatabase {
  protected db: Database.Database
  protected isSyncEnabled = false
  protected logger: Console

  constructor(db: Database.Database, options: NodeServerDatabaseOptions = {}) {
    super()
    this.db = db
    this.isSyncEnabled = options.syncEnabled || false
    this.logger = options.logger || console
  }

  get isWalMode() {
    return !this.isSyncEnabled
  }

  /**
   * Check if currently inside a transaction.
   * Uses better-sqlite3's inTransaction property.
   */
  get inTransaction(): boolean {
    return this.db.inTransaction
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql)
    return {
      run: (bind?: any[]) => {
        if (bind == null) {
          stmt.run()
        } else {
          stmt.run(bind)
        }
      },
      all: (bind?: any[]) => {
        return Promise.resolve(bind == null ? stmt.all() : stmt.all(bind))
      },
    }
  }

  close() {
    this.db.close()
  }

  async selectObjects(
    sql: string,
    bind?: any[]
  ): Promise<{ [columnName: string]: any }[]> {
    const stmt = this.db.prepare(sql)
    if (bind != null) {
      return stmt.all(bind) as { [columnName: string]: any }[]
    }
    return stmt.all() as { [columnName: string]: any }[]
  }

  transaction(func: (db: BaseServerDatabase) => void) {
    const transaction = this.db!.transaction(() => func(this))
    transaction()
    return
  }

  async exec(
    opts:
      | string
      | {
          sql: string
          bind?: any[]
          rowMode?: "array" | "object"
        }
  ): Promise<any> {
    if (typeof opts === "string") {
      const res = this.db.exec(opts)
      return res
    } else if (typeof opts === "object") {
      const { sql, bind } = opts
      const _bind = bind?.map((item: any) => {
        if (typeof item === "boolean") {
          return item ? 1 : 0
        }
        return item
      })
      let stmt
      try {
        stmt = this.db.prepare(sql)
      } catch (error) {
        this.logger.error("Error preparing statement:", error)
        this.logger.error("SQL:", sql)
        throw error
      }
      let res = null
      if (stmt.readonly) {
        res = stmt.all(_bind)
      } else {
        if (_bind == null) {
          return stmt.run()
        }
        try {
          return stmt.run(_bind)
        } catch (error) {
          this.logger.error("Error executing statement:", error)
          throw error
        }
      }
      if (opts.rowMode === "array") {
        return res.map((item: any) => Object.values(item))
      }
      return res
    }
    return []
  }

  createFunction(opt: { name: string; xFunc: (...args: any[]) => any }) {
    this.db.function(
      opt.name,
      {
        deterministic: true,
      },
      opt.xFunc
    )
  }

  // Graft commands
  private graftCommand(command: string, resultParser?: (result: any) => any) {
    if (!this.isSyncEnabled) {
      throw new Error("Graft command is only available in sync mode.")
    }
    const rawResult = this.db.pragma(command)

    if (
      !rawResult ||
      !Array.isArray(rawResult) ||
      rawResult.length === 0 ||
      typeof rawResult[0] !== "object" ||
      rawResult[0] === null
    ) {
      return Promise.resolve({ error: "Unexpected format from pragma command" })
    }
    const result = Object.values(rawResult[0])[0]
    const parsedResult = resultParser ? resultParser(result) : result
    return Promise.resolve(parsedResult)
  }

  async status() {
    return this.graftCommand("graft_status")
  }

  async pull() {
    return this.graftCommand("graft_pull")
  }

  async push() {
    return this.graftCommand("graft_push")
  }

  async fetch() {
    return this.graftCommand("graft_fetch")
  }

  async hydrate() {
    return this.graftCommand("graft_hydrate")
  }

  async clone(remoteLogId?: string) {
    if (remoteLogId) {
      return this.graftCommand(`graft_clone = "${remoteLogId}"`)
    }
    return this.graftCommand("graft_clone")
  }

  async info() {
    return this.graftCommand("graft_info")
  }

  async tags() {
    return this.graftCommand("graft_tags")
  }

  async volumes() {
    return this.graftCommand("graft_volumes")
  }

  async audit() {
    return this.graftCommand("graft_audit")
  }
}

/**
 * Initialize SQLite database with Graft support
 */
export async function initializeDatabase(
  dataDir: string,
  options: {
    graftEnabled: boolean
    isFirstInit?: boolean
    remoteLogId?: string
    extensions?: NodeServerDatabaseOptions["extensions"]
  }
): Promise<{ db: NodeServerDatabase; isSyncEnabled: boolean }> {
  const eidosDir = path.join(dataDir, ".eidos")
  const graftDir = path.join(eidosDir, ".graft")
  const dbPath = path.join(eidosDir, "db.sqlite3")

  // Use passed isFirstInit or fallback to internal check (though caller should pass it)
  const isFirstInit = options.isFirstInit ?? !fs.existsSync(graftDir)

  if (isFirstInit) {
    console.log("[DB] First-time initialization mode active")
  }

  // Ensure directories exist (caller might have created eidosDir, but we ensure here too)
  if (!fs.existsSync(eidosDir)) {
    fs.mkdirSync(eidosDir, { recursive: true })
  }

  let db: Database.Database
  let isSyncEnabled = false

  if (options.graftEnabled && options.extensions?.graft) {
    // Initialize with Graft VFS
    console.log("[DB] Initializing with Graft VFS...")

    if (!fs.existsSync(graftDir)) {
      fs.mkdirSync(graftDir, { recursive: true })
    }

    // Load Graft extension first (registers VFS)
    const vfsDb = new Database(":memory:")
    const graftLibPath = options.extensions.graft.libPath
    const graftLibPathNoExt = path.join(
      path.dirname(graftLibPath),
      path.basename(graftLibPath, path.extname(graftLibPath))
    )
    vfsDb.loadExtension(graftLibPathNoExt)
    vfsDb.close()

    // Open with Graft VFS
    db = new Database("file:main?vfs=graft")
    db.pragma("page_size = 4096")
    db.pragma("journal_mode = MEMORY")
    isSyncEnabled = true

    console.log("[DB] Graft VFS initialized")

    // Clone from remote ONLY on first-time initialization
    if (isFirstInit && options.remoteLogId) {
      console.log(
        `[DB] First init: Cloning from remote: ${options.remoteLogId}`
      )
      try {
        db.pragma(`graft_clone = "${options.remoteLogId}"`)
        console.log("[DB] graft_clone completed")

        db.pragma("graft_pull")
        console.log("[DB] graft_pull completed")

        db.pragma("graft_hydrate")
        console.log("[DB] graft_hydrate completed")
      } catch (e: any) {
        console.error("[DB] Clone from remote failed:", e.message)
      }
    } else if (isFirstInit && !options.remoteLogId) {
      console.warn(
        "[DB] First init but no REMOTE_LOG_ID - database will be empty"
      )
    } else {
      // Not first init - just sync
      console.log("[DB] Existing database, syncing...")
      try {
        db.pragma("graft_pull")
        console.log("[DB] graft_pull completed")
      } catch (e: any) {
        console.warn("[DB] Sync failed (may be offline):", e.message)
      }
    }
  } else {
    // Regular SQLite
    console.log("[DB] Initializing regular SQLite...")
    db = new Database(dbPath)
    db.pragma("journal_mode = WAL")
  }

  // Load other extensions
  if (options.extensions?.simple) {
    try {
      const simpleLibPath = options.extensions.simple.libPath
      const simpleLibPathNoExt = path.join(
        path.dirname(simpleLibPath),
        path.basename(simpleLibPath, path.extname(simpleLibPath))
      )
      db.loadExtension(simpleLibPathNoExt)
      console.log("[DB] Loaded libsimple extension")
    } catch (e) {
      console.warn("[DB] Could not load libsimple:", e)
    }
  }

  if (options.extensions?.vec) {
    try {
      const libPath = options.extensions.vec.libPath
      const libPathNoExt = path.join(
        path.dirname(libPath),
        path.basename(libPath, path.extname(libPath))
      )
      db.loadExtension(libPathNoExt)
      console.log("[DB] Loaded libvec extension")
    } catch (e) {
      console.warn("[DB] Could not load libvec:", e)
    }
  }

  const serverDb = new NodeServerDatabase(db, { syncEnabled: isSyncEnabled })

  return { db: serverDb, isSyncEnabled }
}
