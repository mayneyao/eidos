import type Database from "better-sqlite3"

import type { SyncCredentials } from "@eidos.space/sync"
import type { SpaceInfo } from "@eidos.space/space-manager"
import { NodeBaseServerDatabase } from "./base"
import { NodeDatabaseInitializer } from "./initializer"

export interface NodeDomainDbInfo {
  type: "node"
  config: {
    options?: Database.Options
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
    provider?: string
    credentials?: SyncCredentials
    isVFSInitialized?: boolean
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

export class NodeServerDatabase extends NodeBaseServerDatabase {
  private logger: any = console

  constructor(
    db: Database.Database,
    isSyncEnabled: boolean = false,
    logger?: any,
    spaceInfo?: SpaceInfo,
    graftOptions?: NodeServerDatabaseOptions["graft"]
  ) {
    super(db, spaceInfo, graftOptions)
    this.setSyncEnabled(isSyncEnabled)
    this.logger = logger || console
  }

  static async create(
    config: NodeDomainDbInfo["config"],
    options: NodeServerDatabaseOptions
  ): Promise<NodeServerDatabase> {
    const initializer = new NodeDatabaseInitializer(options)
    const { db, isSyncEnabled } = await initializer.initializeDatabase(config)

    return new NodeServerDatabase(
      db,
      isSyncEnabled,
      options.logger,
      config.spaceInfo,
      options.graft
    )
  }
}
