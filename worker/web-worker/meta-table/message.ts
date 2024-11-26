import { BaseTable, BaseTableImpl } from "./base"
import { ChatTableName, MessageTableName } from "@/lib/sqlite/const"


export type ChatMessage = {
    id: string
    chat_id: string
    role: string
    content: string
    created_at?: string
}

export class MessageTable extends BaseTableImpl<ChatMessage> implements BaseTable<ChatMessage> {
    name = MessageTableName
    createTableSql = `
  CREATE TABLE IF NOT EXISTS ${MessageTableName} (
    id TEXT PRIMARY KEY,
    chat_id TEXT,
    role TEXT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chat_id) REFERENCES ${ChatTableName}(id)
  );

  CREATE TEMP TRIGGER IF NOT EXISTS ${MessageTableName}_insert_trigger
  AFTER INSERT ON ${MessageTableName}
  BEGIN
    SELECT eidos_meta_table_event_insert(
      '${MessageTableName}',
      json_object(
        'id', new.id,
        'chat_id', new.chat_id,
        'role', new.role,
        'content', new.content,
        'created_at', new.created_at
      )
    );
  END;
  `
}
