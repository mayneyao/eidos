import fs from "fs"
import path from "path"
import Database, {
  type SqliteDatabase,
  type SqliteOptions,
} from "./better-sqlite3"

import type { SpaceInfo } from "@eidos.space/space-manager"
import { CREATE_TABLES_SQL, INIT_DATA_SQL } from "@eidos.space/rawdata"
import { GraftCliProcess } from "../../../space-versioning/graft-cli-process"
import {
  isInitializationOperation,
  writeEidosGraftMergePolicyConfig,
} from "../sync/helper"
import { generatePragmaList } from "./config"
import { createGraftDbUri } from "./graft-uri"
import { loadCustomExtensions, scanCustomExtensions } from "./sqlite-extension"

export interface NodeDomainDbInfo {
  type: "node"
  config: {
    options?: SqliteOptions
    spaceInfo?: SpaceInfo
  }
}

interface NodeServerDatabaseOptions {
  // for full text search
  simple: {
    libPath: string
    dictPath: string
  }
  // for sync
  graft?: {
    libPath: string
    cliPath: string
    enabled?: boolean
    syncEnabled?: boolean
    remote?: string
    /** Ephemeral OAuth token forwarded to Graft through GRAFT_REMOTE_TOKEN. */
    remoteToken?: string
    isVFSInitialized?: boolean
    requireRemoteClone?: boolean
    /** Advanced opt-in data plane. Normal Eidos databases use the OS VFS. */
    useVfs?: boolean
  }
  // vec extension
  vec?: {
    libPath: string
  }
  // path to the space directory for scanning custom extensions
  spacePath?: string
  // we make logger configurable instead of directly importing electron-log,
  // electron-log does not support esm, which will cause the worker code to mix cjs and esm and cannot work normally
  logger?: any
}

export let isVFSInitialized = false
export function setVFSInitialized(value: boolean) {
  isVFSInitialized = value
}

export class NodeDatabaseInitializer {
  private logger: any = console
  private options: NodeServerDatabaseOptions
  private graftCli: GraftCliProcess | null = null

  constructor(options: NodeServerDatabaseOptions) {
    this.options = options
    this.logger = console
  }

  /**
   * Initialize the database with all necessary extensions and configurations
   */
  async initializeDatabase(config: NodeDomainDbInfo["config"]): Promise<{
    db: SqliteDatabase
    isSyncEnabled: boolean
    usesGraftVfs: boolean
  }> {
    const spaceInfo = config.spaceInfo
    if (!spaceInfo) {
      throw new Error("Space info not found")
    }

    try {
      const eidosDirPath = path.join(spaceInfo.path, ".eidos")
      if (!fs.existsSync(eidosDirPath)) {
        fs.mkdirSync(eidosDirPath, { recursive: true })
      }
      const isGraftEnabled = this.options.graft?.enabled ?? false
      const isRemoteSyncEnabled =
        this.options.graft?.syncEnabled ?? this.options.graft?.enabled ?? false
      const usesGraftVfs = isGraftEnabled && this.options.graft?.useVfs === true

      let isInit = false
      if (isGraftEnabled) {
        isInit = isInitializationOperation(spaceInfo)
        this.logger.log("isInit", isInit)
      }
      let remoteUri: string | undefined
      if (isRemoteSyncEnabled) {
        remoteUri = this.options.graft?.remote
        if (!remoteUri || !this.options.graft?.remoteToken) {
          throw new Error(
            "Official Graft remote sync requires a provisioned remote and OAuth access token"
          )
        }
      }

      if (isGraftEnabled && !usesGraftVfs) {
        await this.materializeLegacyVfsWorktree(spaceInfo)
      }

      // The extension is optional in v0.8 and is loaded only for an explicit
      // live VFS data-plane request. Repository commands always use the CLI.
      if (usesGraftVfs && this.options.graft?.libPath && !isVFSInitialized) {
        this.initializeVFS()
      }

      let shouldBootstrapLocal = false
      if (isInit && isRemoteSyncEnabled) {
        shouldBootstrapLocal = !(await this.initializeWithRemoteSpace(
          spaceInfo,
          remoteUri,
          this.options.graft?.remoteToken
        ))
      } else if (isInit && isGraftEnabled) {
        await this.initializeLocalRepository(spaceInfo)
        shouldBootstrapLocal = true
      }

      let db = this.openDatabase(spaceInfo, config, usesGraftVfs)

      if (isGraftEnabled) {
        writeEidosGraftMergePolicyConfig(spaceInfo.path)
      }

      if (shouldBootstrapLocal) {
        db = await this.createInitialCommit(
          spaceInfo,
          config,
          db,
          usesGraftVfs,
          remoteUri,
          this.options.graft?.remoteToken
        )
      } else if (!isInit && isRemoteSyncEnabled) {
        await this.refreshRemoteRefsOnStartup(
          spaceInfo,
          this.options.graft?.remoteToken
        )
      }

      this.logger.log("Database initialized successfully.")

      return { db, isSyncEnabled: isGraftEnabled, usesGraftVfs }
    } catch (error) {
      this.logger.error("Error during database initialization:", error)
      throw error
    }
  }

  private async initializeWithRemoteSpace(
    spaceInfo: SpaceInfo,
    remoteUri?: string,
    remoteToken?: string
  ): Promise<boolean> {
    if (!remoteUri) {
      this.logger.warn(
        "Remote URI not found, skipping remote space initialization"
      )
      return false
    }
    this.logger.log("Initializing with remote Graft repository...", remoteUri)

    try {
      await this.runGraft(
        spaceInfo,
        ["clone", "--json", remoteUri],
        remoteToken
      )
      this.logger.log("Remote space initialized successfully.")
      return true
    } catch (error) {
      if (this.options.graft?.requireRemoteClone) {
        throw error
      }
      this.logger.warn(
        "Remote clone failed; initializing a new local Graft repository:",
        error
      )
      await this.initializeLocalRepository(spaceInfo)
      return false
    }
  }

  private async initializeLocalRepository(spaceInfo: SpaceInfo) {
    this.logger.log("Initializing local Graft repository...")
    await this.runGraft(spaceInfo, ["init", "--json"])
    this.logger.log("Local Graft repository initialized successfully.")
  }

  private async createInitialCommit(
    spaceInfo: SpaceInfo,
    config: NodeDomainDbInfo["config"],
    db: SqliteDatabase,
    usesGraftVfs: boolean,
    remoteUri?: string,
    remoteToken?: string
  ): Promise<SqliteDatabase> {
    let nextDb = db
    try {
      await this.runGraft(spaceInfo, ["add", "--json", "db.sqlite3"])
      db.close()
      await this.runGraft(spaceInfo, [
        "commit",
        "--json",
        "--message",
        "Initial version",
      ])
      nextDb = this.openDatabase(spaceInfo, config, usesGraftVfs)
    } catch (error) {
      if (!nextDb.open) {
        nextDb = this.openDatabase(spaceInfo, config, usesGraftVfs)
      }
      if (!this.isNoRepoChangesError(error)) {
        throw error
      }
      this.logger.log("No initial Graft changes to commit.")
    }
    if (remoteUri) {
      await this.configureOriginRemote(spaceInfo, remoteUri)
      await this.pushInitialBranch(spaceInfo, remoteToken)
    }
    return nextDb
  }

  private async pushInitialBranch(spaceInfo: SpaceInfo, remoteToken?: string) {
    await this.runGraft(spaceInfo, ["push", "--json"], remoteToken)
    this.logger.log("Initial Graft branch pushed to remote.")
  }

  private async refreshRemoteRefsOnStartup(
    spaceInfo: SpaceInfo,
    remoteToken?: string
  ) {
    try {
      await this.runGraft(spaceInfo, ["fetch", "--json"], remoteToken)
    } catch (error) {
      this.logger.warn("Graft fetch failed during initialization:", error)
    }
  }

  private isNoRepoChangesError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return (
      message.includes("no changes added to commit") ||
      message.includes("NoStagedChanges")
    )
  }

  private async configureOriginRemote(spaceInfo: SpaceInfo, remoteUri: string) {
    try {
      await this.runGraft(spaceInfo, [
        "remote",
        "add",
        "--json",
        "origin",
        remoteUri,
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes("remote `origin` already exists")) {
        throw error
      }
      await this.runGraft(spaceInfo, [
        "remote",
        "set-url",
        "--json",
        "origin",
        remoteUri,
      ])
    }

    try {
      await this.runGraft(spaceInfo, [
        "branch",
        "--json",
        "--set-upstream-to",
        "origin/main",
        "main",
      ])
    } catch (error) {
      this.logger.warn("Failed to set Graft upstream:", error)
    }
  }

  private runGraft(
    spaceInfo: SpaceInfo,
    args: readonly string[],
    remoteToken?: string
  ) {
    const cliPath = this.options.graft?.cliPath
    if (!cliPath) throw new Error("Missing bundled Graft CLI path")
    this.graftCli ??= new GraftCliProcess(cliPath)
    return this.graftCli.runJson(path.join(spaceInfo.path, ".eidos"), args, {
      remoteToken,
    })
  }

  private async materializeLegacyVfsWorktree(spaceInfo: SpaceInfo) {
    const eidosPath = path.join(spaceInfo.path, ".eidos")
    const graftPath = path.join(eidosPath, ".graft")
    const dbPath = path.join(eidosPath, "db.sqlite3")
    if (!fs.existsSync(graftPath) || this.isPhysicalSqlite(dbPath)) return
    if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
      throw new Error(
        `Refusing to replace non-SQLite legacy worktree file: ${dbPath}`
      )
    }

    const output = `${dbPath}.graft-v0.8-${process.pid}.tmp`
    try {
      await this.runGraft(spaceInfo, [
        "--db",
        "db.sqlite3",
        "export",
        "--json",
        "--output",
        output,
      ])
      if (!this.isPhysicalSqlite(output)) {
        throw new Error("Graft exported an invalid SQLite worktree")
      }
      if (fs.existsSync(dbPath)) {
        fs.rmSync(dbPath)
      }
      fs.renameSync(output, dbPath)
    } finally {
      fs.rmSync(output, { force: true })
    }
  }

  private isPhysicalSqlite(filePath: string): boolean {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 16)
      return false
    const fd = fs.openSync(filePath, "r")
    try {
      const header = Buffer.alloc(16)
      fs.readSync(fd, header, 0, header.length, 0)
      return header.equals(Buffer.from("SQLite format 3\0"))
    } finally {
      fs.closeSync(fd)
    }
  }

  private initializeVFS() {
    // Use a short-lived memory db just to load the extension library
    // This is necessary to register the 'graft' VFS system-wide
    const vfsRegistrationDb = new Database(":memory:")
    try {
      this.logger.log(
        "Loading graft extension library to register VFS:",
        this.options.graft!.libPath
      )
      vfsRegistrationDb.loadExtension(this.options.graft!.libPath)
      this.logger.log(
        "Graft extension library loaded, VFS should be registered."
      )
    } catch (err: any) {
      this.logger.error("Failed to load graft extension library:", err)
      throw new Error(
        `Failed to load graft VFS extension from ${this.options.graft!.libPath}: ${err.message}`
      )
    } finally {
      vfsRegistrationDb.close()
      isVFSInitialized = true
    }
  }

  private createDatabaseConnection(
    spaceInfo: SpaceInfo,
    config: NodeDomainDbInfo["config"],
    usesGraftVfs: boolean
  ): { db: SqliteDatabase } {
    const dbPath =
      spaceInfo.path == ":memory:"
        ? ":memory:"
        : path.join(spaceInfo.path, ".eidos", "db.sqlite3")
    const dbUri = usesGraftVfs ? createGraftDbUri(dbPath) : dbPath

    this.logger.log("Creating database instance...", dbUri)
    const db = new Database(dbUri, config.options)
    this.logger.log("Database instance created.")

    if (usesGraftVfs) {
      db.pragma("page_size = 4096")
      db.pragma("journal_mode = MEMORY")
    }

    // Verify database is open
    if (!db?.open) {
      throw new Error("Database is not open")
    }
    const result = db?.prepare("select 1 as result").get()
    this.logger.log("Database is open:", result)

    return { db }
  }

  private initializeDatabaseConnection(
    db: SqliteDatabase,
    usesGraftVfs: boolean
  ) {
    this.logger.log(
      "Initializing database connection settings (extensions, pragmas)..."
    )

    // Apply Pragma settings FIRST to ensure correct alignment and mode
    try {
      this.logger.log("Applying PRAGMA settings...")
      if (usesGraftVfs) {
        // The optional Graft VFS data plane requires 4 KiB pages and does not
        // use SQLite's on-disk WAL. Physical worktrees retain Eidos's normal
        // WAL settings so `graft add` can capture committed WAL frames.
        db.pragma("page_size = 4096")
        db.pragma("journal_mode = MEMORY")
        this.logger.log("Graft VFS PRAGMAs applied (4k, MEMORY).")
      } else {
        const pragmaList = generatePragmaList()
        pragmaList.forEach((pragma) => {
          this.logger.log(`Executing PRAGMA: ${pragma}`)
          db.pragma(pragma)
        })
        this.logger.log("Standard PRAGMA settings applied successfully.")
      }
    } catch (err) {
      this.logger.error("Failed to apply PRAGMA settings:", err)
    }

    // Load Simple extension if dictionary exists
    if (fs.existsSync(this.options.simple.dictPath)) {
      try {
        this.logger.log("Attempting to enable simple extension...")
        this.loadSimpleExtension(db, this.options.simple)
        this.logger.log("Simple extension enabled successfully.")
      } catch (err) {
        this.logger.error("Failed to enable simple extension:", err)
      }
    } else {
      this.logger.warn(
        "Simple dictionary file not found, skipping simple extension enablement:",
        this.options.simple.dictPath
      )
    }

    // Load custom extensions if space path is provided
    if (this.options.spacePath) {
      try {
        this.logger.log("Scanning for custom SQLite extensions...")
        const customExtensions = scanCustomExtensions(
          this.options.spacePath,
          "desktop"
        )
        if (customExtensions.length > 0) {
          this.logger.log(
            `Found ${customExtensions.length} custom extensions, loading...`
          )
          loadCustomExtensions(db, customExtensions, "desktop")
        } else {
          this.logger.log("No custom extensions found.")
        }
      } catch (err) {
        this.logger.error("Failed to load custom extensions:", err)
      }
    }
  }

  private loadVecExtension(db: SqliteDatabase) {
    if (this.options.vec?.libPath) {
      db.loadExtension(this.options.vec.libPath)
      const { sqlite_version, vec_version } = db
        .prepare(
          "select sqlite_version() as sqlite_version, vec_version() as vec_version;"
        )
        .get() as any
      this.logger.log(
        `sqlite_version=${sqlite_version}, vec_version=${vec_version}`
      )
      const result = db
        .prepare("select vec_f32(?) as result")
        .get("[1.0,2.0,3.0]")
      this.logger.log("result", result)
    }
  }

  public reopenDatabase(
    config: NodeDomainDbInfo["config"],
    usesGraftVfs: boolean
  ): SqliteDatabase {
    const spaceInfo = config.spaceInfo
    if (!spaceInfo) throw new Error("Space info not found")
    return this.openDatabase(spaceInfo, config, usesGraftVfs)
  }

  private openDatabase(
    spaceInfo: SpaceInfo,
    config: NodeDomainDbInfo["config"],
    usesGraftVfs: boolean
  ): SqliteDatabase {
    const { db } = this.createDatabaseConnection(
      spaceInfo,
      config,
      usesGraftVfs
    )
    this.initializeDatabaseConnection(db, usesGraftVfs)
    this.loadVecExtension(db)
    this.attachDatabase(db, usesGraftVfs)
    return db
  }

  private loadSimpleExtension(
    db: SqliteDatabase,
    options: {
      libPath: string
      dictPath: string
    }
  ) {
    db.loadExtension(options.libPath)
    const row = db
      .prepare("select simple_query('pinyin') as query")
      .get() as any
    this.logger.log(row.query)
    db.prepare("select jieba_dict(?)").run(options.dictPath)
  }

  private ensureAuxDatabaseInitialized(
    filePath: string,
    alias: "raw" | "inbox"
  ) {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // Open the auxiliary database directly to initialize schema
      const auxDb = new Database(filePath)
      if (alias === "raw") {
        auxDb.exec(CREATE_TABLES_SQL)
        auxDb.exec(INIT_DATA_SQL)
        this.logger.log(
          "[attachDatabase] Initialized raw database schema:",
          filePath
        )
      } else if (alias === "inbox") {
        auxDb.exec(`
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            channel_id TEXT,
            body TEXT NOT NULL,
            content_type TEXT DEFAULT 'json',
            timestamp_ms INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            metadata TEXT,
            processed INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
          )
        `)
        this.logger.log(
          "[attachDatabase] Initialized inbox database schema:",
          filePath
        )
      }
      auxDb.close()
    } catch (err) {
      this.logger.error(
        `[attachDatabase] Failed to initialize ${alias} database:`,
        err
      )
    }
  }

  private attachDatabase(db: SqliteDatabase, usesGraftVfs: boolean) {
    if (!this.options.spacePath) {
      return
    }

    const attached = db.prepare("PRAGMA database_list").all() as any[]
    this.logger.log("[attachDatabase] usesGraftVfs:", usesGraftVfs)

    const attachIfNeeded = (filePath: string, alias: string) => {
      if (attached.some((d) => d.name === alias)) return
      if (!this.options.graft?.enabled && !fs.existsSync(filePath)) {
        this.logger.log(
          `[attachDatabase] ${alias} database not found, skipping:`,
          filePath
        )
        return
      }

      try {
        let attachPath = filePath
        if (usesGraftVfs) {
          const defaultVfs = process.platform === "win32" ? "win32" : "unix"
          const normalized = filePath.replace(/\\/g, "/")
          attachPath = normalized.startsWith("/")
            ? `file://${normalized}?vfs=${defaultVfs}`
            : `file:///${normalized}?vfs=${defaultVfs}`
        }
        this.logger.log(
          `[attachDatabase] Attaching ${alias} database:`,
          attachPath
        )
        db.prepare(`ATTACH DATABASE ? AS ${alias}`).run(attachPath)
        this.logger.log(
          `[attachDatabase] ${alias} database attached successfully.`
        )
      } catch (err) {
        this.logger.error(
          `[attachDatabase] Failed to attach ${alias} database:`,
          err
        )
      }
    }

    const rawPath = path.join(this.options.spacePath, ".eidos", "raw.sqlite3")
    this.ensureAuxDatabaseInitialized(rawPath, "raw")
    attachIfNeeded(rawPath, "raw")

    // Verify raw schema
    try {
      const rawTables = db
        .prepare(
          "SELECT name FROM raw.sqlite_master WHERE type='table' LIMIT 5"
        )
        .all()
      this.logger.log(
        "[attachDatabase] Raw tables:",
        rawTables.map((t: any) => t.name)
      )
    } catch (verifyErr) {
      this.logger.error(
        "[attachDatabase] Failed to verify raw schema:",
        verifyErr
      )
    }

    const inboxPath = path.join(
      this.options.spacePath,
      ".eidos",
      "inbox.sqlite3"
    )
    this.ensureAuxDatabaseInitialized(inboxPath, "inbox")
    attachIfNeeded(inboxPath, "inbox")
  }
}
