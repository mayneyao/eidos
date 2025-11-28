import { DocTableName } from "../../sqlite/const";

import type { BaseTable } from "../base";
import { BaseTableImpl } from "../base";


export interface IDoc {
  id: string
  content: string
  markdown: string
  is_day_page?: boolean
  created_at?: string
  updated_at?: string
  meta?: string // JSON string for display configuration
  [key: string]: any // Allow for future extensions
}

export interface DocMeta {
  displayProperties?: string[] // Array of property names to display
  [key: string]: any // Allow for future extensions
}


export class BaseDocTable extends BaseTableImpl<IDoc> implements BaseTable<IDoc> {
  name = DocTableName

  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    content TEXT,
    markdown TEXT,
    is_day_page BOOLEAN DEFAULT 0,
    meta TEXT DEFAULT '{}', -- JSON string for display configuration
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TRIGGER IF NOT EXISTS update_time_trigger__${this.name}
  AFTER UPDATE ON ${this.name}
  FOR EACH ROW
  BEGIN
    UPDATE ${this.name} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

  CREATE INDEX IF NOT EXISTS idx_${this.name}_markdown_trigram ON ${this.name}(markdown) WHERE markdown IS NOT NULL;
`

}
