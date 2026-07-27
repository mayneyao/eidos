import fs from "node:fs"
import path from "node:path"
import {
  BaseServerDatabase,
  type GraftConflictResolveTarget,
  type GraftConflictResolution,
  type GraftResetMode,
} from "@/packages/core/sqlite/interface"
import {
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

import { GraftCliProcess } from "../../../space-versioning/graft-cli-process"
import { EXPECTED_GRAFT_RUNTIME_VERSION } from "../../../space-versioning/graft-runtime-version"
import { writeEidosGraftMergePolicyConfig } from "../sync/helper"
import { type SqliteDatabase } from "./better-sqlite3"

interface GraftRuntimeOptions {
  cliPath?: string
  remoteToken?: string
  useVfs?: boolean
}

const isGraftResetMode = (mode: unknown): mode is GraftResetMode =>
  mode === "soft" || mode === "mixed" || mode === "hard"

const isGraftConflictResolution = (
  resolution: unknown
): resolution is GraftConflictResolution =>
  resolution === "ours" || resolution === "theirs" || resolution === "manual"

function graftRowIdentity(target: GraftConflictResolveTarget): string {
  const hasRowid = Number.isSafeInteger(target.rowid)
  const keyEntries =
    target.key && typeof target.key === "object"
      ? Object.entries(target.key)
      : []
  const hasKey = keyEntries.length > 0
  if (hasRowid === hasKey) {
    throw new Error("Row conflict target must contain one rowid or key")
  }
  if (hasRowid) return String(target.rowid)

  for (const [column, value] of keyEntries) {
    const validScalar =
      value === null ||
      typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))
    const validBlob =
      value !== null &&
      typeof value === "object" &&
      Object.keys(value).length === 1 &&
      typeof value.$blob === "string" &&
      value.$blob.length % 2 === 0 &&
      /^[0-9a-f]*$/.test(value.$blob)
    if (!column || column.includes("\0") || (!validScalar && !validBlob)) {
      throw new Error("Row conflict key is invalid")
    }
  }
  return JSON.stringify(
    Object.fromEntries(
      keyEntries.sort(([left], [right]) => left.localeCompare(right))
    )
  )
}

export class NodeBaseServerDatabase extends BaseServerDatabase {
  protected db: SqliteDatabase
  protected spaceInfo?: any
  protected graftOptions?: GraftRuntimeOptions
  private readonly usesGraftVfs: boolean
  private readonly reopenDatabase?: () => SqliteDatabase
  private graftCli: GraftCliProcess | null = null

  constructor(
    db: SqliteDatabase,
    spaceInfo?: any,
    graftOptions?: GraftRuntimeOptions,
    usesGraftVfs = false,
    reopenDatabase?: () => SqliteDatabase
  ) {
    super()
    this.db = db
    this.spaceInfo = spaceInfo
    this.graftOptions = graftOptions
    this.usesGraftVfs = usesGraftVfs
    this.reopenDatabase = reopenDatabase
  }

  get isWalMode() {
    return !this.usesGraftVfs
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
    return {
      controlPlane: "cli",
      dataPlane: this.usesGraftVfs ? "graft-vfs" : "sqlite",
      graft_version: EXPECTED_GRAFT_RUNTIME_VERSION,
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

  // Graft repository commands are a process control plane in v0.8. The
  // SQLite extension is intentionally absent from this path.
  private isNoRepoChangesError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return (
      message.includes("no changes added to commit") ||
      message.includes("NoStagedChanges")
    )
  }

  private repositoryPath() {
    if (!this.spaceInfo?.path) throw new Error("Missing Graft space path")
    return path.join(this.spaceInfo.path, ".eidos")
  }

  private cli() {
    const cliPath = this.graftOptions?.cliPath
    if (!cliPath) throw new Error("Missing bundled Graft CLI path")
    this.graftCli ??= new GraftCliProcess(cliPath)
    return this.graftCli
  }

  private runGraft(
    args: readonly string[],
    timeoutMs = 30_000,
    remoteToken?: string
  ) {
    return this.cli().runJson(this.repositoryPath(), args, {
      timeoutMs,
      remoteToken,
    })
  }

  private parseCliResult<T>(result: unknown, parser: (value: string) => T): T {
    return parser(JSON.stringify(result))
  }

  private parseCliRecord(result: unknown): Record<string, any> {
    return parseGraftJsonResult<Record<string, any>>(JSON.stringify(result))
  }

  private assertNoOpenTransaction(action: string) {
    if (this.db.inTransaction) {
      throw new Error(`Cannot ${action} while a SQLite transaction is open.`)
    }
  }

  private async withClosedWorktree<T>(
    action: string,
    operation: () => Promise<T>
  ): Promise<T> {
    this.assertNoOpenTransaction(action)
    if (!this.reopenDatabase) {
      throw new Error(`Cannot ${action}: database reopen callback is missing.`)
    }
    this.db.close()
    try {
      return await operation()
    } finally {
      this.db = this.reopenDatabase()
    }
  }

  private async commitChanges(message?: string) {
    if (!this.isSyncEnabled) {
      throw new Error("Commit is only available in Graft mode.")
    }
    this.assertNoOpenTransaction("commit")

    const commitMessage = message ?? "Update"
    try {
      // v0.8 performs an online SQLite backup here. Keep the Eidos connection
      // open so committed WAL frames are included without forcing a checkpoint.
      await this.runGraft(["add", "--json", "db.sqlite3"])
      const result = await this.withClosedWorktree("commit", () =>
        this.runGraft(["commit", "--json", "--message", commitMessage])
      )
      return {
        rawMessage: JSON.stringify(result),
      }
    } catch (error) {
      if (this.isNoRepoChangesError(error)) {
        return { rawMessage: "No changes to commit", empty: true }
      }
      throw error
    }
  }

  private async configureOriginRemote(remoteUri?: string) {
    if (!remoteUri) return
    try {
      await this.runGraft(["remote", "add", "--json", "origin", remoteUri])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes("remote `origin` already exists")) {
        throw error
      }
      await this.runGraft(["remote", "set-url", "--json", "origin", remoteUri])
    }

    try {
      await this.runGraft([
        "branch",
        "--json",
        "--set-upstream-to",
        "origin/main",
        "main",
      ])
    } catch (error) {
      console.warn("Failed to set Graft upstream:", error)
    }
  }

  async status() {
    return this.parseCliResult(
      await this.runGraft(["status", "--json"]),
      parseGraftStatus
    )
  }

  async pull(remoteToken?: string) {
    return this.withClosedWorktree("pull", async () =>
      this.parseCliRecord(
        await this.runGraft(["pull", "--json"], 5 * 60_000, remoteToken)
      )
    )
  }

  async push(remoteToken?: string) {
    return this.parseCliRecord(
      await this.runGraft(["push", "--json"], 5 * 60_000, remoteToken)
    )
  }

  async fetch(remoteToken?: string) {
    return this.parseCliRecord(
      await this.runGraft(["fetch", "--json"], 5 * 60_000, remoteToken)
    )
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
    return this.commitChanges(message)
  }

  async completeMerge(message?: string) {
    if (!this.isSyncEnabled) {
      throw new Error("Complete merge is only available in Graft mode.")
    }
    const mergeMessage = message ?? "Merge remote changes"
    const result = await this.withClosedWorktree("complete merge", () =>
      this.runGraft([
        "merge",
        "--continue",
        "--json",
        "--message",
        mergeMessage,
      ])
    )
    return {
      rawMessage: JSON.stringify(result),
    }
  }

  async abortMerge() {
    if (!this.isSyncEnabled) {
      throw new Error("Abort merge is only available in Graft mode.")
    }
    const result = await this.withClosedWorktree("abort merge", () =>
      this.runGraft(["merge", "--abort", "--json"])
    )
    return {
      rawMessage: JSON.stringify(result),
    }
  }

  async conflicts() {
    return this.parseCliResult(
      await this.runGraft(["--db", "db.sqlite3", "conflicts", "--json"]),
      parseGraftConflicts
    )
  }

  async resolveConflict(
    resolution: GraftConflictResolution,
    path?: string,
    target?: GraftConflictResolveTarget
  ) {
    if (!this.isSyncEnabled) {
      throw new Error("Resolve conflict is only available in Graft mode.")
    }
    if (!isGraftConflictResolution(resolution)) {
      throw new Error(
        `resolveConflict() received unsupported resolution: ${String(
          resolution
        )}`
      )
    }

    const args = ["--db", "db.sqlite3", "resolve", "--json", `--${resolution}`]
    if (target) {
      if (!target.table) throw new Error("Row conflict table is required")
      args.push("--row", target.table, graftRowIdentity(target))
    }
    if (path) args.push(path)
    return this.withClosedWorktree("resolve conflict", async () =>
      this.parseCliResult(await this.runGraft(args), parseGraftResolveConflict)
    )
  }

  async branches() {
    return this.parseCliResult(
      await this.runGraft(["branch", "--json", "--all"]),
      parseGraftBranches
    )
  }

  async tags() {
    return this.parseCliResult(
      await this.runGraft(["tag", "--json"]),
      parseGraftTags
    )
  }

  async volumes(): Promise<Record<string, any>> {
    return this.optionalDataPlaneDiagnostic(
      "graft_debug_volume_json_list",
      parseGraftVolumes
    ) as unknown as Record<string, any>
  }

  async info(): Promise<Record<string, any>> {
    return (this.optionalDataPlaneDiagnostic(
      "graft_debug_volume_json_info",
      parseGraftInfo
    ) ?? {}) as Record<string, any>
  }

  async clone(remoteUri?: string, remoteToken?: string) {
    if (remoteUri) {
      return this.withClosedWorktree("clone", async () =>
        this.parseCliRecord(
          await this.runGraft(
            ["clone", "--json", remoteUri],
            5 * 60_000,
            remoteToken
          )
        )
      )
    }
    throw new Error("clone() requires a remote URI")
  }

  async audit() {
    return this.parseCliRecord(
      await this.runGraft(["audit", "--json"], 5 * 60_000)
    )
  }

  async log() {
    return this.parseCliResult(
      await this.runGraft(["log", "--json"]),
      parseGraftLog
    )
  }

  async show(rev: string | number) {
    if (rev === undefined || rev === null || rev === "") {
      throw new Error("show() requires a revision")
    }
    return (
      this.parseCliResult(
        await this.runGraft(["show", "--json", String(rev)]),
        parseGraftShow
      ) ?? {}
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
    const args = ["--db", "db.sqlite3", "diff", "--json"]
    if (mode === "rows") args.push("--rows")
    args.push(String(from))
    if (!isWorktreeDiff) args.push(rawTo!)
    return this.parseCliResult(await this.runGraft(args), parser)
  }

  async checkoutLsn(rev: string | number) {
    if (rev === undefined || rev === null || rev === "") {
      throw new Error("checkoutLsn() requires a revision")
    }
    return this.withClosedWorktree("checkout", async () =>
      this.parseCliResult(
        await this.runGraft([
          "--db",
          "db.sqlite3",
          "checkout",
          "--json",
          "--force",
          String(rev),
        ]),
        parseGraftCheckout
      )
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
    const operation = async () =>
      this.parseCliRecord(
        await this.runGraft([
          "--db",
          "db.sqlite3",
          "reset",
          "--json",
          `--${resetMode}`,
          String(rev),
        ])
      )
    return resetMode === "hard"
      ? this.withClosedWorktree("hard reset", operation)
      : operation()
  }

  async tableLog(tableName: string) {
    if (!tableName) {
      throw new Error("tableLog() requires a table name")
    }
    return this.parseCliResult(await this.runGraft(["log", "--json"]), (data) =>
      parseGraftTableLog(data, tableName)
    )
  }

  async version() {
    return Promise.resolve({
      graft_version: EXPECTED_GRAFT_RUNTIME_VERSION,
    })
  }

  private optionalDataPlaneDiagnostic<T>(
    pragma: string,
    parser: (result: unknown) => T
  ): T | { available: false; dataPlane: "sqlite" } {
    if (!this.usesGraftVfs) {
      return { available: false, dataPlane: "sqlite" }
    }
    return parser(this.db.pragma(pragma))
  }

  private async convertSqliteToGraft(options: {
    remote?: string
    localOnly: boolean
    remoteToken?: string
  }): Promise<any> {
    if (this.isSyncEnabled) {
      throw new Error("Already in graft mode.")
    }

    const spaceInfo = this.spaceInfo
    if (!spaceInfo || !this.graftOptions?.cliPath) {
      throw new Error("Missing required configuration for conversion")
    }

    // The existing database remains an ordinary SQLite worktree. Graft v0.8
    // stages it with an online backup, including committed WAL frames.
    const dbPath = path.join(spaceInfo.path, ".eidos", "db.sqlite3")
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found: ${dbPath}`)
    }

    const remoteUri = options.localOnly ? undefined : options.remote
    if (!options.localOnly && (!remoteUri || !options.remoteToken)) {
      throw new Error("Eidos Sync requires an official remote and sign-in")
    }

    try {
      await this.runGraft(["init", "--json"])
      writeEidosGraftMergePolicyConfig(spaceInfo.path)
      await this.runGraft(["add", "--json", "db.sqlite3"])
      await this.withClosedWorktree("create initial version", () =>
        this.runGraft(["commit", "--json", "--message", "Initial version"])
      )
      this.isSyncEnabled = true
      if (remoteUri) {
        await this.configureOriginRemote(remoteUri)
        await this.pushInitialBranch(options.remoteToken)
      }
      console.log("Graft conversion completed")
    } catch (error) {
      console.error("Graft conversion failed:", error)
      this.isSyncEnabled = false
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
          provider: "eidos.space",
        })
        registry.setSpaceVersioning(spaceInfo.id, { enabled: true })
      }
    } catch (e) {
      console.error("Failed to update space registry:", e)
    }

    return { success: true }
  }

  async convertToGraft(remote: string, remoteToken?: string): Promise<any> {
    return this.convertSqliteToGraft({
      remote,
      remoteToken,
      localOnly: false,
    })
  }

  async enableLocalVersioning(): Promise<any> {
    return this.convertSqliteToGraft({ localOnly: true })
  }

  /** Reconfigure a local-only repository to use a remote sync backend. */
  async reconfigureRemote(remote: string, remoteToken?: string) {
    if (!this.isSyncEnabled) {
      throw new Error("Cannot reconfigure remote: not in Graft mode.")
    }

    // Configure origin in the repository and seed the remote branch so the
    // sync tab can fetch immediately after enabling remote sync.
    if (!this.spaceInfo) {
      throw new Error("Missing spaceInfo for remote reconfiguration")
    }
    if (!remoteToken) throw new Error("Eidos Sync sign-in is required")
    await this.configureOriginRemote(remote)
    writeEidosGraftMergePolicyConfig(this.spaceInfo.path)
    await this.pushInitialBranch(remoteToken)

    return { success: true, reloadRequired: false }
  }

  private async pushInitialBranch(remoteToken?: string) {
    await this.runGraft(["push", "--json"], 5 * 60_000, remoteToken)
    console.log("Initial Graft branch pushed to remote.")
  }

  /**
   * Export the current database to a standard SQLite db.sqlite3 file.
   * This is the reverse operation of convertToGraft.
   *
   * The normal worktree is already a physical SQLite file. A custom output
   * path uses the v0.8 CLI export for versioned spaces, otherwise VACUUM INTO.
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

    const currentDbPath = path.join(spaceInfo.path, ".eidos", "db.sqlite3")
    if (outputPath && outputPath !== currentDbPath) {
      if (this.isSyncEnabled) {
        await this.runGraft([
          "--db",
          "db.sqlite3",
          "export",
          "--json",
          "--output",
          outputPath,
        ])
      } else {
        this.db.prepare("VACUUM INTO ?").run(outputPath)
      }
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Export failed: file not found at ${outputPath}`)
      }
    } else {
      // Disabling versioning keeps this same physical worktree. Checkpointing
      // makes it self-contained before the caller reloads and removes .graft.
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
      this.isSyncEnabled = false
    }

    return { success: true, path: dbPath }
  }
}
