import type { SpaceInfo } from "@eidos.space/space-manager"
import { NodeBaseServerDatabase } from "./base"
import type { SqliteDatabase, SqliteOptions } from "./better-sqlite3"
import { NodeDatabaseInitializer } from "./initializer"

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
    remoteToken?: string
    isVFSInitialized?: boolean
    requireRemoteClone?: boolean
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

export class NodeServerDatabase extends NodeBaseServerDatabase {
  private logger: any = console

  constructor(
    db: SqliteDatabase,
    isSyncEnabled: boolean = false,
    logger?: any,
    spaceInfo?: SpaceInfo,
    graftOptions?: NodeServerDatabaseOptions["graft"],
    usesGraftVfs = false,
    reopenDatabase?: () => SqliteDatabase
  ) {
    super(db, spaceInfo, graftOptions, usesGraftVfs, reopenDatabase)
    this.setSyncEnabled(isSyncEnabled)
    this.logger = logger || console
  }

  static async create(
    config: NodeDomainDbInfo["config"],
    options: NodeServerDatabaseOptions
  ): Promise<NodeServerDatabase> {
    const initializer = new NodeDatabaseInitializer(options)
    const { db, isSyncEnabled, usesGraftVfs } =
      await initializer.initializeDatabase(config)

    return new NodeServerDatabase(
      db,
      isSyncEnabled,
      options.logger,
      config.spaceInfo,
      options.graft,
      usesGraftVfs,
      () => initializer.reopenDatabase(config, usesGraftVfs)
    )
  }
}
