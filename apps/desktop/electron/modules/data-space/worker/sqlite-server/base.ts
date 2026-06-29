import fs from "node:fs"
import path from "node:path"
import {
  BaseServerDatabase,
  type GraftConflictResolveTarget,
  type GraftConflictResolution,
  type GraftResetMode,
} from "@/packages/core/sqlite/interface"
import {
  parseGraftAudit,
  parseGraftCheckout,
  parseGraftConflicts,
  parseGraftDiff,
  parseGraftJsonResult,
  parseGraftInfo,
  parseGraftLog,
  parseGraftResolveConflict,
  parseGraftShow,
  parseGraftStatus,
  parseGraftTags,
  parseGraftTableLog,
  parseGraftBranches,
  parseGraftVolumes,
} from "@/packages/sync/graft/helpers"
import { getSpaceRegistry } from "@eidos.space/space-manager"

import type { SyncCredentials } from "@eidos.space/sync"
import { applyGraftConfigToEnv } from "../sync/helper"
import Database, { type SqliteDatabase } from "./better-sqlite3"
import { createGraftDbUri } from "./graft-uri"
import { isVFSInitialized, setVFSInitialized } from "./initializer"

const GRAFT_JOB_POLL_INTERVAL_MS = 50
const GRAFT_JOB_TIMEOUT_MS = 5 * 60 * 1000

type GraftJobStatus = {
  id?: string
  kind?: string
  state?: string
  result?: unknown
  error?: string | null
}

const isGraftResetMode = (mode: unknown): mode is GraftResetMode =>
  mode === "soft" || mode === "mixed" || mode === "hard"

const isGraftConflictResolution = (
  resolution: unknown
): resolution is GraftConflictResolution =>
  resolution === "ours" || resolution === "theirs" || resolution === "manual"

export class NodeBaseServerDatabase extends BaseServerDatabase {
  protected db: SqliteDatabase
  protected spaceInfo?: any
  protected graftOptions?: any

  constructor(db: SqliteDatabase, spaceInfo?: any, graftOptions?: any) {
    super()
    this.db = db
    this.spaceInfo = spaceInfo
    this.graftOptions = graftOptions
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

  // This will be set by the initializer
  protected isSyncEnabled = false

  setSyncEnabled(enabled: boolean) {
    this.isSyncEnabled = enabled
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
        // if item is boolean return 1 or 0
        if (typeof item === "boolean") {
          return item ? 1 : 0
        }
        return item
      })
      let stmt
      try {
        stmt = this.db.prepare(sql)
      } catch (error) {
        console.error("Error preparing statement:", error)
        console.error("SQL:", sql)
        console.error("Bind:", _bind)
        throw error
      }
      let res = null
      if (stmt.readonly) {
        res = _bind == null ? stmt.all() : stmt.all(_bind)
      } else {
        let runResult: any
        if (_bind == null) {
          runResult = stmt.run()
        } else {
          try {
            runResult = stmt.run(_bind)
          } catch (error) {
            console.error("Error executing statement:", error)
            console.error("SQL:", sql)
            console.error("Bind:", _bind)
            throw error
          }
        }
        return runResult
      }
      if (opts.rowMode === "array") {
        return res.map((item: any) => Object.values(item))
      }
      return res
    }
    return []
  }

  createFunction(opt: {
    name: string
    xFunc: (...args: any[]) => any
    deterministic?: boolean
    nArg?: number
  }) {
    this.db.function(
      opt.name,
      {
        deterministic: opt.deterministic ?? false,
        varargs: opt.nArg === -1,
      },
      opt.xFunc
    )
  }

  table(
    name: string,
    options: {
      rows: (...params: unknown[]) => Generator
      columns: string[]
      parameters?: string[]
      safeIntegers?: boolean
      directOnly?: boolean
    }
  ) {
    this.db.table(name, options as any)
  }

  selectObjectsSync(
    sql: string,
    bind?: any[]
  ): { [columnName: string]: any }[] {
    const stmt = this.db.prepare(sql)
    if (bind != null) {
      return stmt.all(bind) as { [columnName: string]: any }[]
    }
    return stmt.all() as { [columnName: string]: any }[]
  }

  // Helper methods for subclasses
  getGraftInfo() {
    const tryPragma = (name: string) => {
      try {
        return this.db.pragma(name)
      } catch {
        return null
      }
    }
    return {
      graft_snapshot: tryPragma("graft_debug_volume_snapshot"),
      graft_version: tryPragma("graft_version"),
      graft_status: tryPragma("graft_json_status"),
    }
  }

  getLocksInfo() {
    return {
      lockingMode: this.db.pragma("locking_mode"),
      walSize: this.db.pragma("wal_size"),
      pageSize: this.db.pragma("page_size"),
      cacheSize: this.db.pragma("cache_size"),
      busyTimeout: this.db.pragma("busy_timeout"),
      foreignKeys: this.db.pragma("foreign_keys"),
    }
  }

  // Graft-specific methods that require sync to be enabled
  private graftCommand(command: string, resultParser?: (result: any) => any) {
    if (!this.isSyncEnabled) {
      throw new Error("Command is only available in Graft mode.")
    }
    let rawResult: any
    try {
      rawResult = this.db.pragma(command)
    } catch (e: any) {
      console.error(`[graftCommand] FAILED command: "${command}"`, e)
      throw new Error(`graft pragma failed: "${command}": ${e.message ?? e}`)
    }

    console.log(`[${command}] Raw result:`, rawResult)
    if (
      !rawResult ||
      !Array.isArray(rawResult) ||
      rawResult.length === 0 ||
      typeof rawResult[0] !== "object" ||
      rawResult[0] === null
    ) {
      console.error("Unexpected command format:", rawResult)
      return Promise.resolve({ error: "Unexpected format from pragma command" })
    }
    const result = Object.values(rawResult[0])[0]
    const parsedResult = resultParser ? resultParser(result) : result
    console.log(
      `[${command}] Raw result:`,
      rawResult,
      "Parsed result:",
      parsedResult
    )
    return Promise.resolve(parsedResult)
  }

  private graftPragmaString(value: string | number) {
    return `'${String(value).split("'").join("''")}'`
  }

  private graftCliWord(value: string | number) {
    return `"${String(value).split("\\").join("\\\\").split('"').join('\\"')}"`
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

  private graftDbUri(dbPath: string) {
    return createGraftDbUri(dbPath)
  }

  private isNoRepoChangesError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return (
      message.includes("no changes added to commit") ||
      message.includes("NoStagedChanges")
    )
  }

  private firstPragmaValue(rawResult: any) {
    if (
      Array.isArray(rawResult) &&
      rawResult.length > 0 &&
      typeof rawResult[0] === "object" &&
      rawResult[0] !== null
    ) {
      return Object.values(rawResult[0])[0]
    }
    return rawResult
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

  private async graftAsyncCommand(command: string) {
    const jobId = await this.graftCommand(command)
    if (typeof jobId !== "string" || jobId.length === 0) {
      throw new Error(`Expected Graft async job id, got: ${String(jobId)}`)
    }

    const startedAt = Date.now()
    while (true) {
      const status = this.parseGraftJobStatus(
        await this.graftCommand(
          `graft_job_status = ${this.graftPragmaString(jobId)}`
        )
      )

      if (status.state === "done") {
        return this.graftCommand(
          `graft_json_job_result = ${this.graftPragmaString(jobId)}`,
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

  private commitChanges(message?: string) {
    if (!this.isSyncEnabled) {
      throw new Error("Commit is only available in Graft mode.")
    }
    if (this.db.inTransaction) {
      throw new Error("Cannot commit while a SQLite transaction is open.")
    }

    const commitMessage = message ?? "Update"
    try {
      this.db.pragma("graft_add")
      const result = this.db.pragma(
        `graft_commit = ${this.graftPragmaString(commitMessage)}`
      )
      return {
        rawMessage: this.firstPragmaValue(result) ?? "Committed changes",
      }
    } catch (error) {
      if (this.isNoRepoChangesError(error)) {
        return { rawMessage: "No changes to commit", empty: true }
      }
      throw error
    }
  }

  private configureOriginRemote(remoteUri?: string) {
    if (!remoteUri) return
    try {
      this.db.pragma(
        `graft_remote_add = ${this.graftPragmaString(`origin ${remoteUri}`)}`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes("remote `origin` already exists")) {
        throw error
      }
      this.db.pragma(
        `graft_remote_set_url = ${this.graftPragmaString(`origin ${remoteUri}`)}`
      )
    }

    try {
      this.db.pragma(
        `graft_branch_upstream = ${this.graftPragmaString("origin/main")}`
      )
    } catch (error) {
      console.warn("Failed to set Graft upstream:", error)
    }
  }

  async status() {
    return this.graftCommand("graft_json_status", parseGraftStatus)
  }

  async pull() {
    return this.graftCommand("graft_json_pull", parseGraftJsonResult)
  }

  async push() {
    return this.graftCommand("graft_json_push", parseGraftJsonResult)
  }

  async fetch() {
    return this.graftAsyncCommand("graft_json_fetch_async")
  }

  async hydrate() {
    return Promise.resolve({
      rawMessage: "Hydration is handled by repository checkout and pull.",
    })
  }

  async snapshot() {
    return this.commit()
  }

  async commit(message?: string) {
    return Promise.resolve(this.commitChanges(message))
  }

  async completeMerge(message?: string) {
    if (!this.isSyncEnabled) {
      throw new Error("Complete merge is only available in Graft mode.")
    }
    if (this.db.inTransaction) {
      throw new Error(
        "Cannot complete merge while a SQLite transaction is open."
      )
    }

    const mergeMessage = message ?? "Merge remote changes"
    const result = this.db.pragma(
      `graft_merge_continue = ${this.graftPragmaString(mergeMessage)}`
    )
    return {
      rawMessage: this.firstPragmaValue(result) ?? "Merge completed",
    }
  }

  async abortMerge() {
    if (!this.isSyncEnabled) {
      throw new Error("Abort merge is only available in Graft mode.")
    }
    if (this.db.inTransaction) {
      throw new Error("Cannot abort merge while a SQLite transaction is open.")
    }

    const result = this.db.pragma("graft_merge_abort")
    return {
      rawMessage: this.firstPragmaValue(result) ?? "Merge aborted",
    }
  }

  async conflicts() {
    return this.graftCommand("graft_json_conflicts", parseGraftConflicts)
  }

  async resolveConflict(
    resolution: GraftConflictResolution,
    path?: string,
    target?: GraftConflictResolveTarget
  ) {
    if (!this.isSyncEnabled) {
      throw new Error("Resolve conflict is only available in Graft mode.")
    }
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
      `graft_json_resolve_conflict = ${this.graftPragmaString(
        this.graftResolveConflictSpec(resolution, path, target)
      )}`,
      parseGraftResolveConflict
    )
  }

  async branches() {
    return this.graftCommand("graft_json_branch = '--all'", parseGraftBranches)
  }

  async tags() {
    return this.graftCommand("graft_json_tags", parseGraftTags)
  }

  async volumes() {
    return this.graftCommand("graft_debug_volume_json_list", parseGraftVolumes)
  }

  async info() {
    return this.graftCommand("graft_debug_volume_json_info", parseGraftInfo)
  }

  async clone(remoteUri?: string) {
    if (remoteUri) {
      return this.graftCommand(
        `graft_clone = ${this.graftPragmaString(remoteUri)}`
      )
    }
    throw new Error("clone() requires a remote URI")
  }

  async audit() {
    return this.graftCommand("graft_debug_volume_json_audit", parseGraftAudit)
  }

  async log() {
    return this.graftCommand("graft_json_log", parseGraftLog)
  }

  async show(rev: string | number) {
    if (rev === undefined || rev === null || rev === "") {
      throw new Error("show() requires a revision")
    }
    return this.graftCommand(
      `graft_json_show = ${this.graftPragmaString(rev)}`,
      parseGraftShow
    )
  }

  async diff(
    from: string | number,
    to?: string | number,
    mode: "summary" | "rows" = "summary"
  ) {
    if (from === undefined || from === null || from === "") {
      throw new Error("diff() requires a source revision")
    }
    const rawTo = to == null ? undefined : String(to)
    const isWorktreeDiff = rawTo == null || rawTo.toUpperCase() === "WORKTREE"
    const toLabel = isWorktreeDiff ? "WORKTREE" : rawTo!
    const parser = (data: any) =>
      parseGraftDiff(data, {
        from: String(from),
        to: toLabel,
        mode,
      })
    const revs = isWorktreeDiff ? String(from) : `${from} ${rawTo}`
    const value = mode === "rows" ? `--rows ${revs}` : revs
    return this.graftCommand(
      `graft_json_diff = ${this.graftPragmaString(value)}`,
      parser
    )
  }

  async checkoutLsn(rev: string | number) {
    if (rev === undefined || rev === null || rev === "") {
      throw new Error("checkoutLsn() requires a revision")
    }
    return this.graftCommand(
      `graft_json_checkout = ${this.graftPragmaString(`--force ${rev}`)}`,
      parseGraftCheckout
    )
  }

  async resetTo(rev: string | number, mode: GraftResetMode = "hard") {
    if (rev === undefined || rev === null || rev === "") {
      throw new Error("resetTo() requires a revision")
    }
    const resetMode = mode ?? "hard"
    if (!isGraftResetMode(resetMode)) {
      throw new Error(`resetTo() received unsupported mode: ${String(mode)}`)
    }
    return this.graftCommand(
      `graft_json_reset = ${this.graftPragmaString(`--${resetMode} ${rev}`)}`,
      parseGraftJsonResult
    )
  }

  async tableLog(tableName: string) {
    if (!tableName) {
      throw new Error("tableLog() requires a table name")
    }
    return this.graftCommand("graft_json_log", (data: any) =>
      parseGraftTableLog(data, tableName)
    )
  }

  async version() {
    return Promise.resolve({
      graft_version: this.db.pragma("graft_version"),
    })
  }

  private async convertSqliteToGraft(options: {
    remote?: string
    localOnly: boolean
  }): Promise<any> {
    if (this.isSyncEnabled) {
      throw new Error("Already in graft mode.")
    }

    const spaceInfo = this.spaceInfo
    const credentials = this.graftOptions?.credentials
    const graftLibPath = this.graftOptions?.libPath

    if (!spaceInfo || !graftLibPath) {
      throw new Error("Missing required configuration for conversion")
    }
    if (!options.localOnly && !credentials) {
      throw new Error("Missing sync credentials for conversion")
    }

    // 1. Checkpoint current DB
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)")

    // 2. Ensure 4k page size and DELETE journal mode (Graft requirement)
    try {
      // 2a. Ensure journal_mode is DELETE
      const journalModeRes = this.db.pragma("journal_mode")
      const currentJournalMode =
        Array.isArray(journalModeRes) && journalModeRes.length > 0
          ? (Object.values(journalModeRes[0])[0] as string).toUpperCase()
          : ""

      console.log(`Current journal mode: ${currentJournalMode}`)

      if (currentJournalMode !== "DELETE") {
        console.log("Setting journal_mode to DELETE...")
        this.db.pragma("journal_mode = DELETE")
      }

      // 2b. Ensure page_size is 4096
      const currentPageSizeRes = this.db.pragma("page_size")
      const currentPageSize =
        Array.isArray(currentPageSizeRes) && currentPageSizeRes.length > 0
          ? (Object.values(currentPageSizeRes[0])[0] as number)
          : 4096

      console.log(`Current database page size: ${currentPageSize}`)

      if (currentPageSize !== 4096) {
        console.log("Setting page_size to 4096...")
        this.db.pragma("page_size = 4096")
      }

      // 2c. Run VACUUM to apply changes and compact
      console.log("Running VACUUM...")
      this.db.exec("VACUUM")
      console.log("VACUUM completed")
    } catch (e) {
      console.error("Failed to check or convert page size/journal mode:", e)
      // Non-fatal, try to continue
    }

    // 3. Path to existing db
    const dbPath = path.join(spaceInfo.path, ".eidos", "db.sqlite3")
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found: ${dbPath}`)
    }

    // 4. Clear existing graft data (Prevent corruption from previous failed attempts)
    const graftDirPath = path.join(spaceInfo.path, ".eidos", ".graft")
    if (fs.existsSync(graftDirPath)) {
      try {
        fs.rmSync(graftDirPath, { recursive: true, force: true })
        console.log("Cleared existing graft directory")
      } catch (e) {
        console.warn("Failed to clear graft directory:", e)
      }
    }

    let remoteUri: string | undefined
    if (!options.localOnly) {
      const updatedSpaceInfo = {
        ...spaceInfo,
        sync: {
          enabled: true,
          remote: options.remote,
        },
      }
      remoteUri = applyGraftConfigToEnv(updatedSpaceInfo, credentials)
    }

    // 5. Initialize VFS if needed
    if (!isVFSInitialized) {
      // Use a short-lived memory db just to load the extension library
      const vfsRegistrationDb = new Database(":memory:")
      try {
        vfsRegistrationDb.loadExtension(graftLibPath)
        setVFSInitialized(true)
      } finally {
        vfsRegistrationDb.close()
      }
    }

    const graftUri = this.graftDbUri(dbPath)
    console.log(`Starting graft conversion from: ${dbPath}`)
    console.log(`Opening graft database URI: ${graftUri}`)

    let graftDb: SqliteDatabase | undefined

    try {
      // 6. Close regular SQLite connection before opening the same file via
      // Graft VFS. If anything below fails, reopen the regular connection so
      // the worker is not left with a closed database handle.
      this.db.close()

      // 7. Open graft connection using the physical database path so repository
      // discovery and .graft placement are tied to the space directory.
      graftDb = new Database(graftUri)

      // IMPORTANT: Set 4k alignment and memory mode immediately
      graftDb.pragma("page_size = 4096")
      graftDb.pragma("journal_mode = MEMORY")

      this.db = graftDb
      this.isSyncEnabled = true

      this.db.pragma("graft_init")
      this.commitChanges("Initial version")
      if (remoteUri) {
        this.configureOriginRemote(remoteUri)
        this.pushInitialBranch()
      }
      console.log("Graft conversion completed")
    } catch (error) {
      console.error("Graft conversion failed:", error)
      this.isSyncEnabled = false

      if (graftDb?.open) {
        try {
          graftDb.close()
        } catch (closeError) {
          console.warn("Failed to close failed graft connection:", closeError)
        }
      }

      try {
        this.db = new Database(dbPath)
        console.log(
          "Restored regular SQLite connection after failed Graft conversion"
        )
      } catch (restoreError) {
        console.error(
          "Failed to restore regular SQLite connection after Graft conversion failure:",
          restoreError
        )
      }

      if (fs.existsSync(graftDirPath)) {
        try {
          fs.rmSync(graftDirPath, { recursive: true, force: true })
          console.log("Cleared partial graft directory after failed conversion")
        } catch (cleanupError) {
          console.warn(
            "Failed to clear partial graft directory after failed conversion:",
            cleanupError
          )
        }
      }

      throw error
    }

    try {
      const registry = getSpaceRegistry()
      if (options.localOnly) {
        registry.setSpaceVersioning(spaceInfo.id, { enabled: true })
      } else {
        registry.setSpaceSync(spaceInfo.id, {
          enabled: true,
          remote: options.remote || "",
          provider: this.graftOptions?.provider || "eidos.space",
        })
        registry.setSpaceVersioning(spaceInfo.id, { enabled: true })
      }
    } catch (e) {
      console.error("Failed to update space registry:", e)
    }

    return { success: true }
  }

  async convertToGraft(remote: string): Promise<any> {
    return this.convertSqliteToGraft({ remote, localOnly: false })
  }

  async enableLocalVersioning(): Promise<any> {
    return this.convertSqliteToGraft({ localOnly: true })
  }

  /**
   * Reconfigure a local-only Graft space to use a remote sync backend.
   * The active VFS runtime reads its config when the extension is registered,
   * so the caller must restart the worker before pushing to the new remote.
   */
  async reconfigureRemote(credentials: SyncCredentials, remote: string) {
    if (!this.isSyncEnabled) {
      throw new Error("Cannot reconfigure remote: not in Graft mode.")
    }

    // Configure origin in the repository and seed the remote branch so the
    // sync tab can fetch immediately after enabling remote sync.
    const spaceInfo = this.spaceInfo
    if (!spaceInfo) {
      throw new Error("Missing spaceInfo for remote reconfiguration")
    }
    const remoteUri = applyGraftConfigToEnv(spaceInfo, credentials, remote)
    this.configureOriginRemote(remoteUri)
    this.pushInitialBranch()

    return { success: true, reloadRequired: false }
  }

  private pushInitialBranch() {
    try {
      this.db.pragma("graft_push")
      console.log("Initial Graft branch pushed to remote.")
    } catch (error) {
      console.warn("Initial Graft push failed:", error)
    }
  }

  /**
   * Export the current database to a standard SQLite db.sqlite3 file.
   * This is the reverse operation of convertToGraft.
   *
   * If the database is in Graft sync mode:
   * - Uses graft_export pragma to export to a regular SQLite file
   * - Exports the current worktree without creating a repository commit
   *
   * If the database is already in regular SQLite mode:
   * - Performs a WAL checkpoint to ensure all data is persisted
   * - Optionally copies the database to a custom output path using VACUUM INTO
   *
   * @param outputPath - Optional custom path for the exported database file.
   *                     If not provided, defaults to .eidos/db.sqlite3 in the space directory.
   * @returns Promise resolving to {success: true, path: string} on success
   * @throws Error if spaceInfo is missing or export fails
   */
  async exportToSqlite(outputPath?: string): Promise<any> {
    const spaceInfo = this.spaceInfo

    if (!spaceInfo) {
      throw new Error("Missing spaceInfo for export")
    }

    // Determine output path
    const dbPath =
      outputPath || path.join(spaceInfo.path, ".eidos", "db.sqlite3")

    console.log(`Exporting database to: ${dbPath}`)

    if (this.isSyncEnabled) {
      // Export from Graft mode to regular SQLite
      console.log("Exporting from Graft mode...")

      // Use graft_export pragma to export the current worktree to SQLite.
      try {
        const result = this.db.pragma(
          `graft_export = ${this.graftPragmaString(
            `--output ${this.graftCliWord(dbPath)}`
          )}`
        )
        console.log("Graft export result:", result)
      } catch (e) {
        console.error("Failed to export from graft:", e)
        throw new Error(`Failed to export from graft: ${e}`)
      }

      // 3. Verify the exported file exists
      if (!fs.existsSync(dbPath)) {
        throw new Error(`Export failed: file not found at ${dbPath}`)
      }

      console.log(`Successfully exported to ${dbPath}`)
      if (!outputPath) {
        this.db.close()
        this.db = new Database(dbPath)
        this.isSyncEnabled = false
      }
      return { success: true, path: dbPath }
    } else {
      // Already in regular SQLite mode, just copy/checkpoint
      console.log("Already in regular SQLite mode...")

      // 1. Checkpoint WAL to ensure all data is in the main db file
      try {
        this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
        console.log("WAL checkpoint completed")
      } catch (e) {
        console.warn("Failed to checkpoint WAL:", e)
      }

      // 2. If a custom output path is specified, copy the file
      if (
        outputPath &&
        outputPath !== path.join(spaceInfo.path, ".eidos", "db.sqlite3")
      ) {
        const currentDbPath = path.join(spaceInfo.path, ".eidos", "db.sqlite3")

        if (!fs.existsSync(currentDbPath)) {
          throw new Error(`Source database not found: ${currentDbPath}`)
        }

        try {
          // Use VACUUM INTO to create a clean copy
          this.db.exec(`VACUUM INTO '${outputPath}'`)
          console.log(`Database copied to ${outputPath}`)
        } catch (e) {
          console.error("Failed to copy database:", e)
          throw new Error(`Failed to copy database: ${e}`)
        }
      }

      console.log(`Database already at ${dbPath}`)
      return { success: true, path: dbPath }
    }
  }
}
