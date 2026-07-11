import type { GraftPragmaExecutor } from "@eidos.space/graft-client"
import path from "path"

import { Injectable } from "../../common/di"
import { getResourcePath } from "../../utils/resources"
import Database, {
  type SqliteDatabase,
} from "../data-space/worker/sqlite-server/better-sqlite3"
import { createGraftDbUri } from "../data-space/worker/sqlite-server/graft-uri"
import { graftSqlitePragmaStatement } from "./graft-sqlite-pragma"

let graftVfsRegistered = false

@Injectable()
export class GraftSqliteExecutor implements GraftPragmaExecutor {
  private readonly connections = new Map<string, SqliteDatabase>()

  async execute(
    repositoryPath: string,
    pragma: string,
    argument?: string
  ): Promise<unknown> {
    const connection = this.connection(repositoryPath)
    const raw = connection.pragma(
      graftSqlitePragmaStatement(pragma, argument),
      { simple: true }
    )
    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error(`Graft ${pragma} returned an empty JSON response`)
    }
    try {
      return JSON.parse(raw) as unknown
    } catch {
      throw new Error(`Graft ${pragma} returned malformed JSON`)
    }
  }

  close(repositoryPath?: string) {
    if (repositoryPath !== undefined) {
      const connection = this.connections.get(repositoryPath)
      connection?.close()
      this.connections.delete(repositoryPath)
      return
    }
    for (const connection of this.connections.values()) connection.close()
    this.connections.clear()
  }

  private connection(repositoryPath: string): SqliteDatabase {
    const existing = this.connections.get(repositoryPath)
    if (existing?.open) return existing

    this.ensureGraftVfs()
    const controlDbPath = path.join(repositoryPath, ".graft", "control.sqlite")
    const connection = new Database(createGraftDbUri(controlDbPath))
    this.connections.set(repositoryPath, connection)
    return connection
  }

  private ensureGraftVfs() {
    if (graftVfsRegistered) return
    const registration = new Database(":memory:")
    try {
      registration.loadExtension(getResourcePath("dist-sqlite-ext/libgraft"))
      graftVfsRegistered = true
    } finally {
      registration.close()
    }
  }
}
