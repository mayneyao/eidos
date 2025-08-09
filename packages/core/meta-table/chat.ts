import { ChatTableName } from "../sqlite/const"
import { createInsertTriggerForFields } from "../sqlite/sql-meta-table-trigger"
import type { BaseTable } from "./base";
import { BaseTableImpl } from "./base"
import type { ChatMessage } from "./message"

export type Chat = {
  id: string
  created_at: string
  title: string
  user_id: string
  project_id: string // script(extension) id
}


export class ChatTable extends BaseTableImpl<Chat> implements BaseTable<Chat> {
  name = ChatTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${ChatTableName} (
    id TEXT PRIMARY KEY,
    title TEXT,
    user_id TEXT,
    project_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  ${createInsertTriggerForFields(ChatTableName, [
    'id', 'title', 'user_id', 'project_id', 'created_at'
  ])}
  `

  async getChatIdsByProjectId(projectId: string): Promise<string[]> {
    const sql = `SELECT id FROM ${this.name} WHERE project_id = ?`;
    const result = await this.dataSpace.exec2(sql, [projectId]);
    return result.map((row: any) => row.id);
  }

  async getChatsByProjectId(projectId: string): Promise<Chat[]> {
    const chats = await this.list({ project_id: projectId }, {
      orderBy: "created_at",
      order: "ASC"
    })
    return chats || []
  }

  async getChatById(chatId: string): Promise<Chat & { messages: ChatMessage[] } | null> {
    const chat = await this.get(chatId)
    if (!chat) {
      return null
    }
    const messages = await this.dataSpace.message.list({ chat_id: chatId }, {
      orderBy: "created_at",
      order: "ASC"
    })
    return {
      ...chat,
      messages
    }
  }

  async del(chatId: string) {
    try {
      await this.dataSpace.db.transaction(async () => {
        await this.dataSpace.message.deleteMessagesByChatId(chatId);
        const sql = `DELETE FROM ${this.name} WHERE id = ?`;
        await this.dataSpace.exec2(sql, [chatId]);
      });
      return true
    } catch (error) {
      return false
    }
  }
}

