import { ChatTableName } from "@/lib/sqlite/const"
import { BaseTable, BaseTableImpl } from "./base"

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

  CREATE TEMP TRIGGER IF NOT EXISTS ${ChatTableName}_insert_trigger
  AFTER INSERT ON ${ChatTableName}
  BEGIN
    SELECT eidos_meta_table_event_insert(
      '${ChatTableName}',
      json_object(
        'id', new.id,
        'title', new.title,
        'user_id', new.user_id,
        'project_id', new.project_id,
        'created_at', new.created_at
      )
    );
  END;
  `

  async getChatIdsByProjectId(projectId: string): Promise<string[]> {
    const sql = `SELECT id FROM ${this.name} WHERE project_id = ?`;
    const result = await this.dataSpace.exec2(sql, [projectId]);
    return result.map((row: any) => row.id);
  }

  async delete(chatId: string) {
    await this.dataSpace.db.transaction(async () => {
      await this.dataSpace.message.deleteMessagesByChatId(chatId);
      const sql = `DELETE FROM ${this.name} WHERE id = ?`;
      await this.dataSpace.exec2(sql, [chatId]);
    });
  }
}

