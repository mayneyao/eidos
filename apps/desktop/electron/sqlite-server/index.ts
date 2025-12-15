import fs from "fs"
import { BaseServerDatabase } from "@/packages/core/sqlite/interface"
import { parseGraftNew, parseGraftStatus } from "@/packages/sync/graft/helpers"
import Database from "@eidos.space/better-sqlite3"

import {
  loadCustomExtensions,
  scanCustomExtensions,
} from "@/apps/desktop/electron/sqlite-server/sqlite-extension"

import type { SyncBucketCredentials } from "../credentials"
import type { SpaceInfo } from "../space-registry";
import { applyGraftConfigToEnv } from "../sync/helper"
import { generatePragmaList } from "./config"
import path from "path"

export interface NodeDomainDbInfo {
  type: "node"
  config: {
    options?: Database.Options
    spaceInfo?: SpaceInfo
    updateVolumeId?: (volumeId: string) => void
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
    remote?: string
    credentials?: SyncBucketCredentials
    volumeId?: string
    isVFSInitialized?: boolean
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

export let isVFSInitialized = false;


export class NodeServerDatabase extends BaseServerDatabase {
  isSyncEnabled: boolean = false
  db: Database.Database | null = null
  options: NodeServerDatabaseOptions | null = null
  logger: any = console

  constructor(
    config: NodeDomainDbInfo["config"],
    options: NodeServerDatabaseOptions
  ) {
    super()
    this.logger.log("Initializing NodeServerDatabase...")
    // this.logger.log('Options:', options);
    // this.logger.log('Config:', config);
    this.options = options
    this.logger = options.logger || console
    const spaceInfo = config.spaceInfo
    if (!spaceInfo) {
      throw new Error('Space info not found')
    }
    try {
      this.isSyncEnabled = options.graft?.enabled ?? false
      if (this.isSyncEnabled && options.graft?.credentials) {
        applyGraftConfigToEnv(spaceInfo, options.graft?.credentials)
      }
      if (isVFSInitialized) {
       console.warn('====== VFS is already initialized ======')
      }
      // 1. Register Graft VFS if necessary
      if (
        options.graft?.enabled &&
        options.graft?.libPath &&
        options.graft?.credentials && 
        !isVFSInitialized
      ) {
        // Use a short-lived memory db just to load the extension library
        // This is necessary to register the 'graft' VFS system-wide
        const vfsRegistrationDb = new Database(":memory:")
        try {
          this.logger.log(
            "Loading graft extension library to register VFS:",
            options.graft.libPath
          )
          vfsRegistrationDb.loadExtension(options.graft.libPath)
          this.logger.log(
            "Graft extension library loaded, VFS should be registered."
          )
        } catch (err: any) {
          this.logger.error("Failed to load graft extension library:", err)
          // This is likely a fatal error for sync functionality
          throw new Error(
            `Failed to load graft VFS extension from ${options.graft.libPath}: ${err.message}`
          )
        } finally {
          vfsRegistrationDb.close()
          isVFSInitialized = true;
        }
      } else if (options.graft?.enabled) {
        this.logger.warn(
          "enableSync is true, but graft.libPath is not provided. Sync functionality will likely fail."
        )
      } else {
        this.logger.log(
          "Graft extension path not provided (sync likely disabled)."
        )
      }
      this.logger.log(
        `Sync mode check: enableSync=${this.isSyncEnabled},  graftLibPathProvided=${!!options.graft?.libPath}, result=${this.isSyncEnabled}`
      )

      const dbPath = spaceInfo.path == ':memory:' ?  ':memory:' : path.join(spaceInfo.path, '.eidos','db.sqlite3')


      const dbUri = this.isSyncEnabled ? `file:main?vfs=graft` : dbPath
      // 3. Create the main database connection
      this.logger.log("Creating main database instance...", dbUri)
      // Make sure to pass original config options if any were intended
      this.db = new Database(dbUri, config.options)
      this.logger.log("Main database instance created.")

      if (this.isSyncEnabled) {
        let volumeId = spaceInfo.sync?.volumeId
        if (!volumeId) {
          // initialize a new volume
          const parsedRes = this.db.pragma("graft_new")
          const graftInfo = parseGraftNew(parsedRes)
          volumeId = graftInfo?.volumeId

          // if exists .eidos/db.sqlite3, import it to the graft
          const dbPath = path.join(spaceInfo.path, '.eidos', 'db.sqlite3');
          if (fs.existsSync(dbPath)) {
            this.db.pragma(`graft_import = "${dbPath}";`);
            this.logger.log(`Imported db.sqlite3 to graft`)
          }
          // write volumeId to .eidos/volume.id
          config.updateVolumeId?.(volumeId!)
        }
        this.loadGraftExtension(this.db, volumeId!)
        this.logger.log(`Graft volume switched to ${volumeId}`)
      }
      // check this.db is open
      if (!this.db?.open) {
        throw new Error("Database is not open")
      }
      // execute a query to check if the database is open
      const result = this.db?.prepare("select 1 as result").get()
      this.logger.log("Database is open:", result)
      // 4. Initialize the main database connection (Extensions, Pragmas)
      this._initializeDatabaseConnection(options, this.isSyncEnabled)

      // 5. Load the Vec extension
      this.loadVecExtension(this.db)
      this.logger.log("NodeServerDatabase initialized successfully.")
    } catch (error) {
      this.logger.error(
        "Error during NodeServerDatabase initialization:",
        error
      )
      // Clean up if necessary (e.g., close this.db if partially opened)
      if (this.db && this.db.open) {
        try {
          this.db.close()
          this.logger.log(
            "Closed partially opened database due to initialization error."
          )
        } catch (closeError) {
          this.logger.error(
            "Error closing database during error handling:",
            closeError
          )
        }
      }
      throw error // Re-throw the error to signal failure
    }
  }

  get isWalMode() {
    return !this.isSyncEnabled
  }

  loadVecExtension(db: Database.Database) {
    if (this.options?.vec?.libPath) {
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

  loadSimpleExtension(
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

  loadGraftExtension(db: Database.Database, volumeId: string) {
    db.pragma(`graft_switch = "${volumeId}"`)
    const status = db.pragma("graft_status")
    this.logger.log(
      `Graft volume switched to ${volumeId}, status: ${JSON.stringify(status)}`
    )
    console.log("GRAFT_CONFIG=", process.env.GRAFT_CONFIG)
    console.log("AWS_ACCESS_KEY_ID=", process.env.AWS_ACCESS_KEY_ID)
    console.log("AWS_SECRET_ACCESS_KEY=", process.env.AWS_SECRET_ACCESS_KEY)
    console.log("AWS_REGION=", process.env.AWS_REGION)
    console.log("AWS_ENDPOINT=", process.env.AWS_ENDPOINT)
  }

  // Helper function to initialize the connection (load extensions, apply pragmas)
  private _initializeDatabaseConnection(
    options: {
      simple: { libPath: string; dictPath: string }
      spacePath?: string
      // Add other options if needed by initialization steps
    },
    skipPragma?: boolean
  ) {
    this.logger.log(
      "Initializing database connection settings (extensions, pragmas)..."
    )
    if (!this.db) {
      // This should ideally not happen if called after successful DB creation
      throw new Error(
        "Database not initialized before calling _initializeDatabaseConnection"
      )
    }

    // Load Simple extension if dictionary exists
    if (fs.existsSync(options.simple.dictPath)) {
      try {
        this.logger.log("Attempting to enable simple extension...")
        this.loadSimpleExtension(this.db, options.simple)
        this.logger.log("Simple extension enabled successfully.")
      } catch (err) {
        this.logger.error("Failed to enable simple extension:", err)
        // Decide if this is fatal. For now, just log and continue.
        // Consider re-throwing if simple extension is critical:
        // throw new Error(`Failed to enable simple extension: ${err.message}`);
      }
    } else {
      this.logger.warn(
        "Simple dictionary file not found, skipping simple extension enablement:",
        options.simple.dictPath
      )
    }

    // Load custom extensions if space path is provided
    if (options.spacePath) {
      try {
        this.logger.log("Scanning for custom SQLite extensions...")
        const customExtensions = scanCustomExtensions(
          options.spacePath,
          "desktop"
        )
        if (customExtensions.length > 0) {
          this.logger.log(
            `Found ${customExtensions.length} custom extensions, loading...`
          )
          loadCustomExtensions(this.db, customExtensions, "desktop")
        } else {
          this.logger.log("No custom extensions found.")
        }
      } catch (err) {
        this.logger.error("Failed to load custom extensions:", err)
        // Don't throw error for custom extensions - they're optional
      }
    }

    // Apply Pragma settings
    try {
      if (!skipPragma) {
        this.logger.log("Applying PRAGMA settings...")
        const pragmaList = generatePragmaList()
        pragmaList.forEach((pragma) => {
          this.logger.log(`Executing PRAGMA: ${pragma}`)
          if (!this.db) throw new Error("Database is not initialized.")
          // Ensure pragma string is correctly formatted if it contains values
          this.db.pragma(pragma)
        })
        this.logger.log("PRAGMA settings applied successfully.")
      }
    } catch (err) {
      this.logger.error("Failed to apply PRAGMA settings:", err)
      // Decide if this is fatal. For now, just log and continue.
      // Consider re-throwing if pragmas are critical:
      // throw new Error(`Failed to apply PRAGMA settings: ${err.message}`);
    }
  }

  prepare(sql: string) {
    if (!this.db) throw new Error("Database is not initialized.")
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
    if (!this.db) {
      this.logger.warn("Attempted to close an uninitialized database.")
      return // Or throw error depending on desired behavior
    }
    this.db.close()
  }

  private graftCommand(command: string, resultParser?: (result: any) => any) {
    if (!this.isSyncEnabled) {
      throw new Error("Command is only available in sync mode.")
    }
    if (!this.db) throw new Error("Database is not initialized.")
    const rawResult = this.db.pragma(command)

    // process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
    // console.log(`Set AWS_ACCESS_KEY_ID=${credentials.accessKeyId}`);
    // process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
    // console.log(`Set AWS_SECRET_ACCESS_KEY=${credentials.secretAccessKey}`);
    // process.env.AWS_REGION = 'auto';
    // console.log(`Set AWS_REGION=auto`);
    // process.env.AWS_ENDPOINT = credentials.endpoint;
    // console.log(`Set AWS_ENDPOINT=${credentials.endpoint}`);

    console.log(`[${command}] Raw result:`, rawResult)
    if (
      !rawResult ||
      !Array.isArray(rawResult) ||
      rawResult.length === 0 ||
      typeof rawResult[0] !== "object" ||
      rawResult[0] === null
    ) {
      this.logger.error("Unexpected command format:", rawResult)
      // Return a structured error or throw? Returning promise for now.
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

  async status() {
    return this.graftCommand("graft_status", parseGraftStatus)
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

  async snapshot() {
    return this.graftCommand("graft_snapshot")
  }

  async volumes(){
    return this.graftCommand("graft_volumes")
  }

  getGraftInfo(db: Database.Database) {
    return {
      graft_snapshot: db.pragma("graft_snapshot"),
      graft_pages: db.pragma("graft_pages"),
      graft_version: db.pragma("graft_version"),
      graft_sync_errors: db.pragma("graft_sync_errors"),
    }
  }

  getLocksInfo() {
    if (!this.db) throw new Error("Database is not initialized.")
    return {
      lockingMode: this.db.pragma("locking_mode"),
      walSize: this.db.pragma("wal_size"),
      pageSize: this.db.pragma("page_size"),
      cacheSize: this.db.pragma("cache_size"),
      busyTimeout: this.db.pragma("busy_timeout"),
      foreignKeys: this.db.pragma("foreign_keys"),
    }
  }

  async selectObjects(
    sql: string,
    bind?: any[]
  ): Promise<{ [columnName: string]: any }[]> {
    if (!this.db) throw new Error("Database is not initialized.")
    const stmt = this.db.prepare(sql)
    if (bind != null) {
      return stmt.all(bind) as { [columnName: string]: any }[]
    }
    return stmt.all() as { [columnName: string]: any }[]
  }

  transaction(func: (db: BaseServerDatabase) => void) {
    if (!this.db) throw new Error("Database is not initialized.")
    // Use non-null assertion operator since the check above guarantees non-nullability
    const transaction = this.db!.transaction(() => func(this))
    transaction()
    return
  }

  async exec(opts: {
    sql: string
    bind?: any[]
    rowMode?: "array" | "object"
  }): Promise<any> {
    if (!this.db) throw new Error("Database is not initialized.")
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
        this.logger.error("Error preparing statement:", error)
        this.logger.error("SQL:", sql)
        this.logger.error("Bind:", _bind)
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
          this.logger.error("SQL:", sql)
          this.logger.error("Bind:", _bind)
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
    if (!this.db) throw new Error("Database is not initialized.")
    this.db.function(
      opt.name,
      {
        deterministic: true,
      },
      opt.xFunc
    )
  }
}
