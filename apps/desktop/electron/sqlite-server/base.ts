import { BaseServerDatabase } from "@/packages/core/sqlite/interface"
import {
  parseGraftInfo,
  parseGraftStatus,
  parseGraftTags,
  parseGraftVolumes,
  parseGraftAudit,
} from "@/packages/sync/graft/helpers"
import type Database from "@eidos.space/better-sqlite3"

export class NodeBaseServerDatabase extends BaseServerDatabase {
  protected db: Database.Database

  constructor(db: Database.Database) {
    super()
    this.db = db
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
}
