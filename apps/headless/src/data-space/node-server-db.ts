/**
 * Node.js SQLite database adapter for headless server
 * Based on desktop's NodeBaseServerDatabase
 */

// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "./env"

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import Database from "better-sqlite3"
import {
  BaseServerDatabase,
  type GraftConflictResolveTarget,
  type GraftConflictResolution,
} from "../sqlite/interface"

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

const GRAFT_JOB_POLL_INTERVAL_MS = 50
const GRAFT_JOB_TIMEOUT_MS = 5 * 60 * 1000

type GraftJobStatus = {
  id?: string
  kind?: string
  state?: string
  result?: unknown
  error?: string | null
}

const isGraftConflictResolution = (
  resolution: unknown
): resolution is GraftConflictResolution =>
  resolution === "ours" || resolution === "theirs" || resolution === "manual"

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

  async transaction<T>(
    func: (db: BaseServerDatabase) => T | Promise<T>
  ): Promise<T> {
    this.db.exec("BEGIN")
    try {
      const result = await func(this)
      this.db.exec("COMMIT")
      return result
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
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

  private parseGraftJobStatus(rawStatus: unknown): GraftJobStatus {
    if (typeof rawStatus === "string") {
      try {
        return JSON.parse(rawStatus) as GraftJobStatus
      } catch (error) {
        throw new Error(`Invalid Graft job status JSON: ${error}`)
      }
    }
    if (rawStatus && typeof rawStatus === "object") {
      return rawStatus as GraftJobStatus
    }
    throw new Error(`Invalid Graft job status: ${String(rawStatus)}`)
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  private graftResolveConflictSpec(
    resolution: GraftConflictResolution,
    path?: string,
    target?: GraftConflictResolveTarget
  ) {
    const flag = `--${resolution}`
    const row =
      target?.table && Number.isFinite(target.rowid)
        ? ` --row ${target.table} ${target.rowid}`
        : ""
    return path ? `${flag}${row} ${path}` : `${flag}${row}`
  }

  private async graftAsyncCommand(command: string) {
    const jobId = await this.graftCommand(command)
    if (typeof jobId !== "string" || jobId.length === 0) {
      throw new Error(`Expected Graft async job id, got: ${String(jobId)}`)
    }

    const startedAt = Date.now()
    while (true) {
      const status = this.parseGraftJobStatus(
        await this.graftCommand(`graft_job_status = ${pragmaString(jobId)}`)
      )

      if (status.state === "done") {
        return this.graftCommand(
          `graft_json_job_result = ${pragmaString(jobId)}`,
          parseGraftJsonResult
        )
      }
      if (status.state === "failed") {
        throw new Error(
          `Graft async job ${jobId} failed: ${status.error ?? "unknown error"}`
        )
      }
      if (status.state !== "running") {
        throw new Error(
          `Graft async job ${jobId} returned unknown state: ${String(
            status.state
          )}`
        )
      }
      if (Date.now() - startedAt > GRAFT_JOB_TIMEOUT_MS) {
        throw new Error(`Graft async job ${jobId} timed out`)
      }

      await this.sleep(GRAFT_JOB_POLL_INTERVAL_MS)
    }
  }

  async status() {
    return this.graftCommand("graft_json_status")
  }

  async pull() {
    return this.graftCommand("graft_json_pull", parseGraftJsonResult)
  }

  async push() {
    return this.graftCommand("graft_json_push", parseGraftJsonResult)
  }

  async completeMerge(message?: string) {
    if (this.db.inTransaction) {
      throw new Error(
        "Cannot complete merge while a SQLite transaction is open."
      )
    }

    const mergeMessage = message ?? "Merge remote changes"
    const result = await this.graftCommand(
      `graft_merge_continue = ${pragmaString(mergeMessage)}`
    )
    return {
      rawMessage: typeof result === "string" ? result : "Merge completed",
      ...(result && typeof result === "object" ? result : {}),
    }
  }

  async abortMerge() {
    if (this.db.inTransaction) {
      throw new Error("Cannot abort merge while a SQLite transaction is open.")
    }

    const result = await this.graftCommand("graft_merge_abort")
    return {
      rawMessage: typeof result === "string" ? result : "Merge aborted",
      ...(result && typeof result === "object" ? result : {}),
    }
  }

  async conflicts() {
    return this.graftCommand("graft_json_conflicts", parseGraftJsonResult)
  }

  async resolveConflict(
    resolution: GraftConflictResolution,
    path?: string,
    target?: GraftConflictResolveTarget
  ) {
    if (this.db.inTransaction) {
      throw new Error(
        "Cannot resolve conflict while a SQLite transaction is open."
      )
    }
    if (!isGraftConflictResolution(resolution)) {
      throw new Error(
        `resolveConflict() received unsupported resolution: ${String(
          resolution
        )}`
      )
    }

    return this.graftCommand(
      `graft_json_resolve_conflict = ${pragmaString(
        this.graftResolveConflictSpec(resolution, path, target)
      )}`,
      parseGraftJsonResult
    )
  }

  async fetch() {
    return this.graftAsyncCommand("graft_json_fetch_async")
  }

  async hydrate() {
    return Promise.resolve({
      rawMessage: "Hydration is handled by repository checkout and pull.",
    })
  }

  async clone(remoteUri?: string) {
    if (remoteUri) {
      return this.graftCommand(`graft_clone = ${pragmaString(remoteUri)}`)
    }
    throw new Error("clone() requires a remote URI")
  }

  async info() {
    return this.graftCommand(
      "graft_debug_volume_json_info",
      parseGraftJsonResult
    )
  }

  async branches() {
    return this.graftCommand(
      "graft_json_branch = '--all'",
      parseGraftJsonResult
    )
  }

  async tags() {
    return this.graftCommand("graft_json_tags", parseGraftJsonResult)
  }

  async volumes() {
    return this.graftCommand(
      "graft_debug_volume_json_list",
      parseGraftJsonResult
    )
  }

  async audit() {
    return this.graftCommand(
      "graft_debug_volume_json_audit",
      parseGraftJsonResult
    )
  }
}

function parseGraftJsonResult(data: unknown) {
  if (typeof data !== "string") return data
  return JSON.parse(data)
}

function pragmaString(value: string | number) {
  return `'${String(value).split("'").join("''")}'`
}

function graftDbUri(dbPath: string) {
  const url = pathToFileURL(dbPath)
  url.searchParams.set("vfs", "graft")
  return url.href
}

function isNoRepoChangesError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes("no changes added to commit") ||
    message.includes("NoStagedChanges")
  )
}

function initializeLocalRepository(db: Database.Database) {
  db.pragma("graft_init")
  try {
    db.pragma("graft_add")
    db.pragma(`graft_commit = ${pragmaString("Initial version")}`)
  } catch (error) {
    if (!isNoRepoChangesError(error)) throw error
  }
}

function configureOriginRemote(db: Database.Database, remoteUri: string) {
  try {
    db.pragma(`graft_remote_add = ${pragmaString(`origin ${remoteUri}`)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes("remote `origin` already exists")) {
      throw error
    }
    db.pragma(`graft_remote_set_url = ${pragmaString(`origin ${remoteUri}`)}`)
  }

  try {
    db.pragma(`graft_branch_upstream = ${pragmaString("origin/main")}`)
  } catch (error) {
    console.warn("[DB] Failed to set Graft upstream:", error)
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
    remoteUri?: string
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
    db = new Database(graftDbUri(dbPath))
    db.pragma("page_size = 4096")
    db.pragma("journal_mode = MEMORY")
    isSyncEnabled = true

    console.log("[DB] Graft VFS initialized")

    if (isFirstInit && options.remoteUri) {
      console.log(`[DB] First init: Cloning from remote: ${options.remoteUri}`)
      try {
        db.pragma(`graft_clone = ${pragmaString(options.remoteUri)}`)
        console.log("[DB] graft_clone completed")
      } catch (e: any) {
        console.error("[DB] Clone from remote failed:", e.message)
        initializeLocalRepository(db)
        configureOriginRemote(db, options.remoteUri)
        try {
          db.pragma("graft_push")
        } catch (pushError: any) {
          console.warn("[DB] Initial push failed:", pushError.message)
        }
      }
    } else if (isFirstInit) {
      initializeLocalRepository(db)
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
