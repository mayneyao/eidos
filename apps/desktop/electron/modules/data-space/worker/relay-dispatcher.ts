import path from "path"
import fs from "fs"
import Database, { type SqliteDatabase } from "./sqlite-server/better-sqlite3"

export interface RelayMessage {
  id: string
  channel_id: string
  body: any
  content_type: string
  timestamp_ms: number
  attempts: number
  metadata?: any
}

export class RelayDispatcher {
  private db: SqliteDatabase

  constructor(spacePath: string) {
    const dbPath = path.join(spacePath, ".eidos", "inbox.sqlite3")
    if (!fs.existsSync(dbPath)) {
      // Create empty DB if not exists (though RelayClient should have created it)
      const eidosDir = path.join(spacePath, ".eidos")
      if (!fs.existsSync(eidosDir)) {
        fs.mkdirSync(eidosDir, { recursive: true })
      }
    }
    this.db = new Database(dbPath)
  }

  // Maximum retry attempts before message is considered dead
  private readonly MAX_RETRY_ATTEMPTS = 3

  public getPendingMessages(
    channelId?: string,
    limit: number = 10
  ): RelayMessage[] {
    let query = `
      SELECT id, channel_id, body, content_type, timestamp_ms, attempts, metadata 
      FROM messages 
      WHERE processed = 0 
        AND attempts < ${this.MAX_RETRY_ATTEMPTS}
    `
    const params: any[] = []
    if (channelId) {
      query += ` AND channel_id = ? `
      params.push(channelId)
    }
    query += ` ORDER BY created_at ASC LIMIT ? `
    params.push(limit)

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as any[]
    return rows.map((row) => ({
      id: row.id,
      channel_id: row.channel_id,
      body: this.tryParseJson(row.body),
      content_type: row.content_type || "json",
      timestamp_ms: row.timestamp_ms,
      attempts: row.attempts,
      metadata: this.tryParseJson(row.metadata),
    }))
  }

  public ackMessages(ids: string[]) {
    if (ids.length === 0) return
    const stmt = this.db.prepare("DELETE FROM messages WHERE id = ?")
    const deleteMany = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(id)
      }
    })
    deleteMany(ids)
  }

  public retryMessages(ids: string[]) {
    if (ids.length === 0) return
    const stmt = this.db.prepare(`
      UPDATE messages 
      SET attempts = attempts + 1 
      WHERE id = ? AND attempts < ${this.MAX_RETRY_ATTEMPTS}
    `)
    const updateMany = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(id)
      }
    })
    updateMany(ids)
  }

  /**
   * Get dead letter messages (exceeded max retry attempts)
   */
  public getDeadLetterMessages(
    channelId?: string,
    limit: number = 10
  ): RelayMessage[] {
    let query = `
      SELECT id, channel_id, body, content_type, timestamp_ms, attempts, metadata 
      FROM messages 
      WHERE processed = 0 
        AND attempts >= ${this.MAX_RETRY_ATTEMPTS}
    `
    const params: any[] = []
    if (channelId) {
      query += ` AND channel_id = ? `
      params.push(channelId)
    }
    query += ` ORDER BY created_at ASC LIMIT ? `
    params.push(limit)

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as any[]
    return rows.map((row) => ({
      id: row.id,
      channel_id: row.channel_id,
      body: this.tryParseJson(row.body),
      content_type: row.content_type || "json",
      timestamp_ms: row.timestamp_ms,
      attempts: row.attempts,
      metadata: this.tryParseJson(row.metadata),
    }))
  }

  /**
   * Delete dead letter messages
   */
  public deleteDeadLetterMessages(ids: string[]) {
    if (ids.length === 0) return
    const stmt = this.db.prepare(`
      DELETE FROM messages 
      WHERE id = ? AND attempts >= ${this.MAX_RETRY_ATTEMPTS}
    `)
    const deleteMany = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(id)
      }
    })
    deleteMany(ids)
  }

  /**
   * Get message counts for a channel (pending and dead letter)
   */
  public getChannelCounts(channelId: string): {
    pending: number
    deadLetter: number
  } {
    const pendingStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages 
      WHERE channel_id = ? AND processed = 0 AND attempts < ${this.MAX_RETRY_ATTEMPTS}
    `)
    const deadStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages 
      WHERE channel_id = ? AND processed = 0 AND attempts >= ${this.MAX_RETRY_ATTEMPTS}
    `)

    const pending = (pendingStmt.get(channelId) as any)?.count || 0
    const deadLetter = (deadStmt.get(channelId) as any)?.count || 0

    return { pending, deadLetter }
  }

  /**
   * Get total message counts across all channels
   */
  public getTotalCounts(): { pending: number; deadLetter: number } {
    const pendingStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages 
      WHERE processed = 0 AND attempts < ${this.MAX_RETRY_ATTEMPTS}
    `)
    const deadStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages 
      WHERE processed = 0 AND attempts >= ${this.MAX_RETRY_ATTEMPTS}
    `)

    const pending = (pendingStmt.get() as any)?.count || 0
    const deadLetter = (deadStmt.get() as any)?.count || 0

    return { pending, deadLetter }
  }

  public close() {
    this.db.close()
  }

  private tryParseJson(val: any) {
    if (typeof val !== "string") return val
    try {
      return JSON.parse(val)
    } catch {
      return val
    }
  }
}
