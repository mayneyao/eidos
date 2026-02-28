import type { BaseTable } from "./base"
import { BaseTableImpl } from "./base"
import { QueueTableName } from "../sqlite/const"

export type QueueStatus = "pending" | "processing" | "completed" | "failed"

export interface IQueueItem {
  id: string
  payload: Record<string, any>
  status: QueueStatus
  attempts: number
  error?: string
  created_at?: string
  updated_at?: string
}

export class QueueTable
  extends BaseTableImpl<IQueueItem>
  implements BaseTable<IQueueItem>
{
  name = QueueTableName

  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${QueueTableName} (
    id TEXT PRIMARY KEY,
    payload TEXT,
    status TEXT,
    attempts INTEGER DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  `

  JSONFields: string[] = ["payload"]

  async enqueue(item: IQueueItem): Promise<IQueueItem> {
    item.status = item.status || "pending"
    item.attempts = item.attempts || 0
    await this.dataSpace.exec2(
      `INSERT INTO ${this.name} (id, payload, status, attempts) VALUES (?, ?, ?, ?);`,
      [item.id, JSON.stringify(item.payload), item.status, item.attempts]
    )
    return item
  }

  async dequeue(): Promise<IQueueItem | null> {
    return await this.dataSpace.db.transaction(async (db) => {
      const pendingItems = await this.dataSpace.exec2(
        `SELECT * FROM ${this.name} WHERE status = ? ORDER BY created_at ASC LIMIT 1;`,
        ["pending"]
      )
      if (pendingItems.length === 0) {
        return null
      }
      const item = pendingItems[0]
      const newAttempts = (item.attempts || 0) + 1
      await this.dataSpace.exec2(
        `UPDATE ${this.name} SET status = ?, attempts = ? WHERE id = ?;`,
        ["processing", newAttempts, item.id]
      )
      const updatedRows = await this.dataSpace.exec2(
        `SELECT * FROM ${this.name} WHERE id = ?;`,
        [item.id]
      )
      return updatedRows.length > 0 ? this.toJson(updatedRows[0]) : null
    })
  }

  async complete(itemId: string): Promise<boolean> {
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET status = ? WHERE id = ?;`,
      ["completed", itemId]
    )
    return true
  }

  async fail(itemId: string, errorMessage?: string): Promise<boolean> {
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET status = ?, error = ? WHERE id = ?;`,
      ["failed", errorMessage || "", itemId]
    )
    return true
  }

  async retryFailed(): Promise<number> {
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET status = ? WHERE status = ?;`,
      ["pending", "failed"]
    )
    const res = await this.dataSpace.exec2(
      `SELECT COUNT(*) as count FROM ${this.name} WHERE status = ?;`,
      ["pending"]
    )
    return res[0]?.count || 0
  }

  async listQueue(status?: QueueStatus): Promise<IQueueItem[]> {
    let sql = `SELECT * FROM ${this.name}`
    const params: any[] = []
    if (status) {
      sql += ` WHERE status = ?`
      params.push(status)
    }
    const rows = await this.dataSpace.exec2(sql, params)
    return rows.map((row: any) => this.toJson(row))
  }
}
