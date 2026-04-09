// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "../../data-space/worker/sqlite-server/env"

import { RawData } from "@eidos.space/rawdata"
import Database from "better-sqlite3"
import * as path from "node:path"

import { Injectable } from "../../../common/di"
import { getSpacePath } from "../../../utils/paths"
import { AdapterFsService } from "../adapters/adapter-fs.service"

/**
 * DataStore Service
 * Manages SQLite database and RawData store instances per space
 */
@Injectable()
export class DataStoreService {
  private dataStores: Map<string, RawData> = new Map()
  private databases: Map<string, Database.Database> = new Map()

  /**
   * Get or create database for a space
   */
  getDatabase(spaceId: string): Database.Database {
    if (!this.databases.has(spaceId)) {
      const spacePath = getSpacePath(spaceId)
      const dbPath = path.join(spacePath, ".eidos", "raw.sqlite3")

      // Ensure directory exists
      const fs = new AdapterFsService(spacePath)
      fs.mkdir(path.dirname(dbPath)).catch(() => {})

      const db = new Database(dbPath)
      db.pragma("journal_mode = WAL")
      this.databases.set(spaceId, db)
    }
    return this.databases.get(spaceId)!
  }

  /**
   * Get or create RawData store for a space
   */
  getDataStore(spaceId: string): RawData {
    if (!this.dataStores.has(spaceId)) {
      const db = this.getDatabase(spaceId)
      const store = new RawData(db, { debug: false })
      this.dataStores.set(spaceId, store)
    }
    return this.dataStores.get(spaceId)!
  }

  /**
   * Close all data stores and database connections
   */
  closeAll(): void {
    for (const db of this.databases.values()) {
      db.close()
    }
    this.databases.clear()
    this.dataStores.clear()
  }

  /**
   * Get database path for a space
   */
  getDatabasePath(spaceId: string): string {
    const spacePath = getSpacePath(spaceId)
    return path.join(spacePath, ".eidos", "raw.sqlite3")
  }
}
