import { TodoTableName } from "@/lib/sqlite/const"

import { BaseTable } from "./base"

export class FileTable implements BaseTable {
  name = TodoTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${TodoTableName} (
    content TEXT,
    done BOOLEAN,
    doc_id TEXT,
    list_id TEXT,
    node_key TEXT
  );`
}
