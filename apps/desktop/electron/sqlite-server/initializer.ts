import fs from "fs"
import Database from "@eidos.space/better-sqlite3"
import path from "path"

import {
  loadCustomExtensions,
  scanCustomExtensions,
} from "./sqlite-extension"
import type { SyncBucketCredentials } from "../credentials"
import type { SpaceInfo } from "../space-registry";
import { applyGraftConfigToEnv } from "../sync/helper"
import { generatePragmaList } from "./config"
import { parseGraftNew, parseGraftStatus } from "@/packages/sync/graft/helpers"

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

export class NodeDatabaseInitializer {
  private logger: any = console
  private options: NodeServerDatabaseOptions

  constructor(options: NodeServerDatabaseOptions) {
    this.options = options
    this.logger = options.logger || console
  }

  /**
   * Initialize the database with all necessary extensions and configurations
   */
  async initializeDatabase(config: NodeDomainDbInfo["config"]): Promise<{
    db: Database.Database
    isSyncEnabled: boolean
    volumeId?: string
  }> {
    const spaceInfo = config.spaceInfo
    if (!spaceInfo) {
      throw new Error('Space info not found')
    }

    try {
      const isSyncEnabled = this.options.graft?.enabled ?? false

      if (isSyncEnabled && this.options.graft?.credentials) {
        applyGraftConfigToEnv(spaceInfo, this.options.graft?.credentials)
      }

      // Initialize VFS if needed
      if (isSyncEnabled && this.options.graft?.libPath && !isVFSInitialized) {
        this.initializeVFS()
      }

      // Create database connection
      const { db, volumeId } = this.createDatabaseConnection(spaceInfo, config, isSyncEnabled)

      // Initialize database connection (extensions, pragmas)
      this.initializeDatabaseConnection(db)

      // Load Vec extension
      this.loadVecExtension(db)

      this.logger.log("Database initialized successfully.")

      return { db, isSyncEnabled, volumeId }
    } catch (error) {
      this.logger.error("Error during database initialization:", error)
      throw error
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
      isVFSInitialized = true;
    }
  }

  private createDatabaseConnection(
    spaceInfo: SpaceInfo,
    config: NodeDomainDbInfo["config"],
    isSyncEnabled: boolean
  ): { db: Database.Database; volumeId?: string } {
    const dbPath = spaceInfo.path == ':memory:' ? ':memory:' : path.join(spaceInfo.path, '.eidos', 'db.sqlite3')
    const dbUri = isSyncEnabled ? `file:main?vfs=graft` : dbPath

    this.logger.log("Creating database instance...", dbUri)
    const db = new Database(dbUri, config.options)
    this.logger.log("Database instance created.")

    let volumeId: string | undefined

    if (isSyncEnabled) {
      volumeId = spaceInfo.sync?.volumeId
      if (!volumeId) {
        // initialize a new volume
        const parsedRes = db.pragma("graft_new")
        const graftInfo = parseGraftNew(parsedRes)
        volumeId = graftInfo?.volumeId

        // if exists .eidos/db.sqlite3, import it to the graft
        const existingDbPath = path.join(spaceInfo.path, '.eidos', 'db.sqlite3');
        if (fs.existsSync(existingDbPath)) {
          db.pragma(`graft_import = "${existingDbPath}";`);
          this.logger.log(`Imported db.sqlite3 to graft`)
        }
        // write volumeId to .eidos/volume.id
        config.updateVolumeId?.(volumeId!)
      }
      this.loadGraftExtension(db, volumeId!)
      this.logger.log(`Graft volume switched to ${volumeId}`)
    }

    // Verify database is open
    if (!db?.open) {
      throw new Error("Database is not open")
    }
    const result = db?.prepare("select 1 as result").get()
    this.logger.log("Database is open:", result)

    return { db, volumeId }
  }

  private initializeDatabaseConnection(db: Database.Database) {
    this.logger.log("Initializing database connection settings (extensions, pragmas)...")

    // Load Simple extension if dictionary exists
    if (fs.existsSync(this.options.simple.dictPath)) {
      try {
        this.logger.log("Attempting to enable simple extension...")
        this.loadSimpleExtension(db, this.options.simple)
        this.logger.log("Simple extension enabled successfully.")
      } catch (err) {
        this.logger.error("Failed to enable simple extension:", err)
        // Non-fatal error for simple extension
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
        // Non-fatal error for custom extensions
      }
    }

    // Apply Pragma settings
    try {
      this.logger.log("Applying PRAGMA settings...")
      const pragmaList = generatePragmaList()
      pragmaList.forEach((pragma) => {
        this.logger.log(`Executing PRAGMA: ${pragma}`)
        db.pragma(pragma)
      })
      this.logger.log("PRAGMA settings applied successfully.")
    } catch (err) {
      this.logger.error("Failed to apply PRAGMA settings:", err)
      // Non-fatal error for pragmas
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

  private loadGraftExtension(db: Database.Database, volumeId: string) {
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
}
