import { ChatTableName, MessageTableName } from "../sqlite/const"
import { createTriggersForFields } from "../sqlite/sql-meta-table-trigger"
import type { Message } from "ai"
import type { BaseTable } from "./base"
import { BaseTableImpl } from "./base"

export type ChatMessage = {
  id: string
  chat_id: string
  role: string
  content: string
  parts: Message["parts"]
  created_at?: string
}

export class MessageTable
  extends BaseTableImpl<ChatMessage>
  implements BaseTable<ChatMessage>
{
  name = MessageTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${MessageTableName} (
    id TEXT PRIMARY KEY,
    chat_id TEXT,
    role TEXT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    parts TEXT,
    FOREIGN KEY(chat_id) REFERENCES ${ChatTableName}(id)
  );

  ${createTriggersForFields(MessageTableName, ["id", "chat_id", "role", "content", "created_at"])}
  `
  JSONFields: string[] = ["parts"]

  async deleteMessagesByChatId(chatId: string) {
    const sql = `DELETE FROM ${this.name} WHERE chat_id = ?`
    await this.dataSpace.exec2(sql, [chatId])
  }

  async deleteByIds(messageIds: string[]) {
    const placeholders = messageIds.map(() => "?").join(",")
    const sql = `DELETE FROM ${this.name} WHERE id IN (${placeholders})`
    await this.dataSpace.exec2(sql, messageIds)
  }

  async clearMessages(chatId: string) {
    const sql = `DELETE FROM ${this.name} WHERE chat_id = ?`
    await this.dataSpace.exec2(sql, [chatId])
  }
}
