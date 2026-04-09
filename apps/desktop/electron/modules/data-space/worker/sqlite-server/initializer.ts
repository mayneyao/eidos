// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "./env"

import fs from "fs"
import path from "path"
import Database from "better-sqlite3"

import type { SyncCredentials } from "@eidos.space/sync"
import type { SpaceInfo } from "@eidos.space/space-manager"
import {
  applyGraftConfigToEnv,
  isInitializationOperation,
} from "../sync/helper"
import { generatePragmaList } from "./config"
import { loadCustomExtensions, scanCustomExtensions } from "./sqlite-extension"

export interface NodeDomainDbInfo {
  type: "node"
  config: {
    options?: Database.Options
    spaceInfo?: SpaceInfo
    remoteLogId?: string
  }
}

interface NodeServerDatabaseOptions {
  remoteLogId?: string
  // for full text search
  simple: {
    libPath: string
    dictPath: string
  }
  // for sync
  graft?: {
    libPath: string
    enabled?: boolean
    remote?: string
    credentials?: SyncCredentials
    isVFSInitialized?: boolean
    provider?: string
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
    db: Database.Database
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
      const isSyncEnabled = this.options.graft?.enabled ?? false

      let isInit = false
      if (isSyncEnabled && this.options.graft?.credentials) {
        isInit = isInitializationOperation(spaceInfo)
        this.logger.log("isInit", isInit)
        applyGraftConfigToEnv(spaceInfo, this.options.graft?.credentials)
      }

      // Initialize VFS if needed
      if (isSyncEnabled && this.options.graft?.libPath && !isVFSInitialized) {
        this.initializeVFS()
      }

      // Create database connection
      const { db } = this.createDatabaseConnection(
        spaceInfo,
        config,
        isSyncEnabled
      )

      if (isInit) {
        this.initializeWithRemoteSpace(db)
      }

      // Initialize database connection (extensions, pragmas)
      this.initializeDatabaseConnection(db)

      // Load Vec extension
      this.loadVecExtension(db)

      // Attach rawdata database if configured
      this.attachDatabase(db)

      this.logger.log("Database initialized successfully.")

      return { db, isSyncEnabled }
    } catch (error) {
      this.logger.error("Error during database initialization:", error)
      throw error
    }
  }

  private initializeWithRemoteSpace(db: Database.Database) {
    if (!this.options.remoteLogId) {
      this.logger.warn(
        "Remote log id not found, skipping remote space initialization"
      )
      return
    }
    this.logger.log(
      "Initializing with remote space...",
      this.options.remoteLogId
    )

    db.pragma(`graft_clone = "${this.options.remoteLogId}"`)
    db.pragma(`graft_pull`)
    db.pragma(`graft_hydrate`)
    this.logger.log("Remote space initialized successfully.")
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
  ): { db: Database.Database } {
    const dbPath =
      spaceInfo.path == ":memory:"
        ? ":memory:"
        : path.join(spaceInfo.path, ".eidos", "db.sqlite3")
    const dbUri = isSyncEnabled ? `file:main?vfs=graft` : dbPath

    this.logger.log("Creating database instance...", dbUri)
    const db = new Database(dbUri, config.options)
    this.logger.log("Database instance created.")

    // Verify database is open
    if (!db?.open) {
      throw new Error("Database is not open")
    }
    const result = db?.prepare("select 1 as result").get()
    this.logger.log("Database is open:", result)

    return { db }
  }

  private initializeDatabaseConnection(db: Database.Database) {
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

  private loadVecExtension(db: Database.Database) {
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
    db: Database.Database,
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

  private attachDatabase(db: Database.Database) {
    if (!this.options.spacePath) {
      return
    }

    // Derive raw path from spacePath
    // Expected location: spacePath/.eidos/raw.sqlite3
    const rawPath = path.join(this.options.spacePath, ".eidos", "raw.sqlite3")

    if (fs.existsSync(rawPath)) {
      try {
        this.logger.log("Attaching raw database...", rawPath)
        db.prepare(`ATTACH DATABASE ? AS raw`).run(rawPath)
        this.logger.log("Raw database attached successfully.")
      } catch (err) {
        this.logger.error("Failed to attach raw database:", err)
      }
    } else {
      this.logger.log("Raw database not found, skipping attach:", rawPath)
    }

    // Derive inbox path from spacePath
    // Expected location: spacePath/.eidos/inbox.db
    const inboxPath = path.join(
      this.options.spacePath,
      ".eidos",
      "inbox.sqlite3"
    )

    if (fs.existsSync(inboxPath)) {
      try {
        this.logger.log("Attaching inbox database...", inboxPath)
        db.prepare(`ATTACH DATABASE ? AS inbox`).run(inboxPath)
        this.logger.log("Inbox database attached successfully.")
      } catch (err) {
        this.logger.error("Failed to attach inbox database:", err)
      }
    } else {
      this.logger.log("Inbox database not found, skipping attach:", inboxPath)
    }
  }
}
