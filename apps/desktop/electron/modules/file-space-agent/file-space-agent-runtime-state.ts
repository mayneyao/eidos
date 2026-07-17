import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

import type { FileSpaceAgentMessage, FileSpaceAgentRun } from "./types"

export interface FileSpaceAgentRuntimeSnapshot {
  run: FileSpaceAgentRun
  message: FileSpaceAgentMessage
}

/**
 * Machine-local, high-frequency Agent state. Completed semantic output is
 * promoted to the portable JSONL journal and removed from this database.
 */
export class FileSpaceAgentRuntimeStateStore {
  private database: Database.Database | null = null

  constructor(private readonly rootPath: string) {}

  save(snapshot: FileSpaceAgentRuntimeSnapshot): void {
    const database = this.getDatabase()
    database
      .prepare(
        `INSERT INTO active_runs (
          run_id, conversation_id, run_json, message_json, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(conversation_id) DO UPDATE SET
          run_id = excluded.run_id,
          run_json = excluded.run_json,
          message_json = excluded.message_json,
          updated_at = excluded.updated_at`
      )
      .run(
        snapshot.run.id,
        snapshot.run.conversationId,
        JSON.stringify(snapshot.run),
        JSON.stringify(snapshot.message),
        snapshot.run.updatedAt
      )
  }

  getConversation(
    conversationId: string
  ): FileSpaceAgentRuntimeSnapshot | null {
    const row = this.getDatabase()
      .prepare(
        "SELECT run_json, message_json FROM active_runs WHERE conversation_id = ?"
      )
      .get(conversationId) as
      | { run_json: string; message_json: string }
      | undefined
    if (!row) return null
    try {
      const run = JSON.parse(row.run_json) as FileSpaceAgentRun
      const message = JSON.parse(row.message_json) as FileSpaceAgentMessage
      if (
        run.conversationId !== conversationId ||
        message.role !== "assistant" ||
        message.id !== run.messageId
      ) {
        return null
      }
      return { run, message }
    } catch {
      return null
    }
  }

  deleteRun(runId: string): void {
    this.getDatabase()
      .prepare("DELETE FROM active_runs WHERE run_id = ?")
      .run(runId)
  }

  deleteConversation(conversationId: string): void {
    this.getDatabase()
      .prepare("DELETE FROM active_runs WHERE conversation_id = ?")
      .run(conversationId)
  }

  close(): void {
    this.database?.close()
    this.database = null
  }

  private getDatabase(): Database.Database {
    if (this.database) return this.database
    fs.mkdirSync(this.rootPath, { recursive: true, mode: 0o700 })
    const database = new Database(path.join(this.rootPath, "runtime.sqlite"))
    database.pragma("journal_mode = WAL")
    database.pragma("synchronous = NORMAL")
    database.exec(`
      CREATE TABLE IF NOT EXISTS active_runs (
        run_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL UNIQUE,
        run_json TEXT NOT NULL,
        message_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    this.database = database
    return database
  }
}
