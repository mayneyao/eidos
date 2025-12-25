import fs from "node:fs"
import path from "node:path"
import { BaseServerDatabase } from "@/packages/core/sqlite/interface"
import {
  parseGraftAudit,
  parseGraftInfo,
  parseGraftStatus,
  parseGraftTags,
  parseGraftVolumes,
} from "@/packages/sync/graft/helpers"
import Database from "@eidos.space/better-sqlite3"
import { getSpaceRegistry } from "@eidos.space/space-manager"

import { applyGraftConfigToEnv } from "../sync/helper"
import { isVFSInitialized, setVFSInitialized } from "./initializer"

export class NodeBaseServerDatabase extends BaseServerDatabase {
  protected db: Database.Database
  protected spaceInfo?: any
  protected graftOptions?: any

  constructor(db: Database.Database, spaceInfo?: any, graftOptions?: any) {
    super()
    this.db = db
    this.spaceInfo = spaceInfo
    this.graftOptions = graftOptions
  }

  get isWalMode() {
    return !this.isSyncEnabled
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

  transaction(func: (db: BaseServerDatabase) => void) {
    const transaction = this.db!.transaction(() => func(this))
    transaction()
    return
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
        res = stmt.all(_bind)
      } else {
        if (_bind == null) {
          return stmt.run()
        }
        try {
          return stmt.run(_bind)
        } catch (error) {
          console.error("Error executing statement:", error)
          console.error("SQL:", sql)
          console.error("Bind:", _bind)
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

  // Helper methods for subclasses
  getGraftInfo() {
    return {
      graft_snapshot: this.db.pragma("graft_snapshot"),
      graft_pages: this.db.pragma("graft_pages"),
      graft_version: this.db.pragma("graft_version"),
      graft_sync_errors: this.db.pragma("graft_sync_errors"),
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
      throw new Error("Command is only available in sync mode.")
    }
    const rawResult = this.db.pragma(command)

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

  async tags() {
    return this.graftCommand("graft_tags", parseGraftTags)
  }

  async volumes() {
    return this.graftCommand("graft_volumes", parseGraftVolumes)
  }

  async info() {
    return this.graftCommand("graft_info", parseGraftInfo)
  }

  async clone(remoteLogId?: string) {
    if (remoteLogId) {
      return this.graftCommand(`graft_clone = "${remoteLogId}"`)
    }
    return this.graftCommand("graft_clone")
  }

  async audit() {
    return this.graftCommand("graft_audit", parseGraftAudit)
  }

  async version() {
    return Promise.resolve({
      graft_version: this.db.pragma("graft_version"),
    })
  }

  async convertToGraft(remote: string): Promise<any> {
    if (this.isSyncEnabled) {
      throw new Error("Already in sync mode.")
    }

    const spaceInfo = this.spaceInfo
    const credentials = this.graftOptions?.credentials
    const graftLibPath = this.graftOptions?.libPath

    if (!spaceInfo || !credentials || !graftLibPath) {
      throw new Error("Missing required configuration for conversion")
    }

    // 1. Checkpoint current DB
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)")

    // 2. Ensure 4k page size (Graft requirement)
    try {
      const currentPageSizeRes = this.db.pragma("page_size")
      const currentPageSize =
        Array.isArray(currentPageSizeRes) && currentPageSizeRes.length > 0
          ? (Object.values(currentPageSizeRes[0])[0] as number)
          : 4096

      console.log(`Current database page size: ${currentPageSize}`)

      if (currentPageSize !== 4096) {
        console.log(
          "Converting database page size to 4096 (Disabling WAL temporarily)..."
        )
        // IMPORTANT: Must disable WAL to change page_size
        this.db.pragma("journal_mode = DELETE")
        this.db.pragma("page_size = 4096")
        this.db.exec("VACUUM")
        console.log("VACUUM completed, page size is now 4096")
      }
    } catch (e) {
      console.error("Failed to check or convert page size:", e)
      // Non-fatal, try to continue
    }

    // 3. Path to existing db
    const dbPath = path.join(spaceInfo.path, ".eidos", "db.sqlite3")
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found: ${dbPath}`)
    }

    // 3. Close current connection
    this.db.close()

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
    fs.mkdirSync(graftDirPath, { recursive: true })

    // 5. Setup graft environment
    // Update remote in spaceInfo for applyGraftConfigToEnv
    const updatedSpaceInfo = {
      ...spaceInfo,
      sync: {
        enabled: true,
        remote,
      },
    }
    applyGraftConfigToEnv(updatedSpaceInfo, credentials)

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

    // 7. Open graft connection
    this.db = new Database("file:main?vfs=graft")

    // IMPORTANT: Set 4k alignment and memory mode immediately
    this.db.pragma("page_size = 4096")
    this.db.pragma("journal_mode = MEMORY")
    this.isSyncEnabled = true

    console.log(`Starting graft import from: ${dbPath}`)
    const res = this.db.pragma(`graft_import = "${dbPath}"`)
    console.log("Graft import result strength:", res)

    // Force a snapshot to sync internal VFS state to disk
    this.db.pragma("graft_snapshot")

    // 8. Update space registry
    try {
      const registry = getSpaceRegistry()
      registry.setSpaceSync(spaceInfo.id, {
        enabled: true,
        remote: remote,
      })
    } catch (e) {
      console.error("Failed to update space registry:", e)
    }

    return { success: true }
  }
}
