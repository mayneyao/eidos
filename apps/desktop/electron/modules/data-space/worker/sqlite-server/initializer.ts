import fs from "fs"
import path from "path"
import Database, {
  type SqliteDatabase,
  type SqliteOptions,
} from "./better-sqlite3"
import { createGraftDbUri } from "./graft-uri"

import type { SyncCredentials } from "@eidos.space/sync"
import type { SpaceInfo } from "@eidos.space/space-manager"
import { CREATE_TABLES_SQL, INIT_DATA_SQL } from "@eidos.space/rawdata"
import {
  applyGraftConfigToEnv,
  isInitializationOperation,
} from "../sync/helper"
import { generatePragmaList } from "./config"
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
    enabled?: boolean
    syncEnabled?: boolean
    remote?: string
    credentials?: SyncCredentials
    isVFSInitialized?: boolean
    provider?: string
    requireRemoteClone?: boolean
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

      let isInit = false
      if (isGraftEnabled) {
        isInit = isInitializationOperation(spaceInfo)
        this.logger.log("isInit", isInit)
      }
      let remoteUri: string | undefined
      if (isRemoteSyncEnabled) {
        if (!this.options.graft?.credentials) {
          throw new Error("Missing sync credentials for Graft remote sync")
        }
        remoteUri = applyGraftConfigToEnv(
          spaceInfo,
          this.options.graft?.credentials,
          this.options.graft?.remote
        )
      }

      // Initialize VFS if needed
      if (isGraftEnabled && this.options.graft?.libPath && !isVFSInitialized) {
        this.initializeVFS()
      }

      // Create database connection
      const { db } = this.createDatabaseConnection(
        spaceInfo,
        config,
        isGraftEnabled
      )

      if (isInit && isRemoteSyncEnabled) {
        this.initializeWithRemoteSpace(db, remoteUri)
      } else if (isInit && isGraftEnabled) {
        this.initializeLocalRepository(db)
      }

      // Initialize database connection (extensions, pragmas)
      this.initializeDatabaseConnection(db)

      if (!isInit && isRemoteSyncEnabled) {
        this.refreshRemoteRefsOnStartup(db)
      }

      // Load Vec extension
      this.loadVecExtension(db)

      // Attach rawdata database if configured
      this.attachDatabase(db, isGraftEnabled)

      this.logger.log("Database initialized successfully.")

      return { db, isSyncEnabled: isGraftEnabled }
    } catch (error) {
      this.logger.error("Error during database initialization:", error)
      throw error
    }
  }

  private initializeWithRemoteSpace(db: SqliteDatabase, remoteUri?: string) {
    if (!remoteUri) {
      this.logger.warn(
        "Remote URI not found, skipping remote space initialization"
      )
      return
    }
    this.logger.log("Initializing with remote Graft repository...", remoteUri)

    try {
      db.pragma(`graft_clone = ${this.pragmaString(remoteUri)}`)
      this.logger.log("Remote space initialized successfully.")
    } catch (error) {
      if (this.options.graft?.requireRemoteClone) {
        throw error
      }
      this.logger.warn(
        "Remote clone failed; initializing a new local Graft repository:",
        error
      )
      this.initializeLocalRepository(db)
      this.configureOriginRemote(db, remoteUri)
      this.pushInitialBranch(db)
    }
  }

  private initializeLocalRepository(db: SqliteDatabase) {
    this.logger.log("Initializing local Graft repository...")
    db.pragma("graft_init")
    this.createInitialCommit(db)
    this.logger.log("Local Graft repository initialized successfully.")
  }

  private createInitialCommit(db: SqliteDatabase) {
    try {
      db.pragma("graft_add")
      db.pragma(`graft_commit = ${this.pragmaString("Initial version")}`)
    } catch (error) {
      if (!this.isNoRepoChangesError(error)) {
        throw error
      }
      this.logger.log("No initial Graft changes to commit.")
    }
  }

  private pushInitialBranch(db: SqliteDatabase) {
    try {
      db.pragma("graft_push")
      this.logger.log("Initial Graft branch pushed to remote.")
    } catch (error) {
      this.logger.warn("Initial Graft push failed:", error)
    }
  }

  private refreshRemoteRefsOnStartup(db: SqliteDatabase) {
    try {
      db.pragma("graft_fetch")
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

  private configureOriginRemote(db: SqliteDatabase, remoteUri: string) {
    try {
      db.pragma(
        `graft_remote_add = ${this.pragmaString(`origin ${remoteUri}`)}`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes("remote `origin` already exists")) {
        throw error
      }
      db.pragma(
        `graft_remote_set_url = ${this.pragmaString(`origin ${remoteUri}`)}`
      )
    }

    try {
      db.pragma(`graft_branch_upstream = ${this.pragmaString("origin/main")}`)
    } catch (error) {
      this.logger.warn("Failed to set Graft upstream:", error)
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
    isSyncEnabled: boolean
  ): { db: SqliteDatabase } {
    const dbPath =
      spaceInfo.path == ":memory:"
        ? ":memory:"
        : path.join(spaceInfo.path, ".eidos", "db.sqlite3")
    const dbUri = isSyncEnabled ? this.graftDbUri(dbPath) : dbPath

    this.logger.log("Creating database instance...", dbUri)
    const db = new Database(dbUri, config.options)
    this.logger.log("Database instance created.")

    if (isSyncEnabled) {
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

  private graftDbUri(dbPath: string) {
    return createGraftDbUri(dbPath)
  }

  private pragmaString(value: string | number) {
    return `'${String(value).split("'").join("''")}'`
  }

  private initializeDatabaseConnection(db: SqliteDatabase) {
    this.logger.log(
      "Initializing database connection settings (extensions, pragmas)..."
    )

    // Apply Pragma settings FIRST to ensure correct alignment and mode
    try {
      this.logger.log("Applying PRAGMA settings...")
      if (this.options.graft?.enabled) {
        // IMPORTANT: Must be 4k for Graft
        db.pragma("page_size = 4096")
        db.pragma("journal_mode = MEMORY")
        this.logger.log("Graft mode PRAGMAs applied (4k, MEMORY).")
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

  private attachDatabase(db: SqliteDatabase, isSyncEnabled: boolean) {
    if (!this.options.spacePath) {
      return
    }

    const attached = db.prepare("PRAGMA database_list").all() as any[]
    this.logger.log("[attachDatabase] isSyncEnabled:", isSyncEnabled)

    const attachIfNeeded = (filePath: string, alias: string) => {
      if (attached.some((d) => d.name === alias)) return
      if (!isSyncEnabled && !fs.existsSync(filePath)) {
        this.logger.log(
          `[attachDatabase] ${alias} database not found, skipping:`,
          filePath
        )
        return
      }

      try {
        let attachPath = filePath
        if (isSyncEnabled) {
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
