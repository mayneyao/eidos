import { ExtNodeTableName } from "../sqlite/const";
import type { BaseTable } from "./base";
import { BaseTableImpl } from "./base";

export interface IExtNode {
  id: string
  blob?: Buffer
  text?: string
  type: string
  created_at?: string
  updated_at?: string
}

export class ExtNodeTable extends BaseTableImpl<IExtNode> implements BaseTable<IExtNode> {
  name = ExtNodeTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    blob BLOB,
    text TEXT,
    type TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_${this.name}_type ON ${this.name}(type);

  CREATE TRIGGER IF NOT EXISTS update_time_trigger__${this.name}
  AFTER UPDATE ON ${this.name}
  FOR EACH ROW
  BEGIN
    UPDATE ${this.name} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;
  `

  async addExtNode(data: Omit<IExtNode, "created_at" | "updated_at">) {
    return this.add(data)
  }

  async updateExtNode(id: string, data: Partial<Omit<IExtNode, "id" | "created_at" | "updated_at">>) {
    return this.set(id, data)
  }

  async getExtNodesByType(type: string): Promise<IExtNode[]> {
    return this.list({ type })
  }

  async getExtNode(id: string): Promise<IExtNode | null> {
    return this.get(id)
  }
  async getBlob(id: string): Promise<Buffer | null> {
    const extNode = await this.get(id)
    return extNode?.blob || null
  }

  async getText(id: string): Promise<string | null> {
    const extNode = await this.get(id)
    return extNode?.text || null
  }


  async setBlob(id: string, blob: Buffer): Promise<boolean> {
    return this.set(id, { blob })
  }


  async setType(id: string, type: string): Promise<boolean> {
    return this.set(id, { type })
  }

  async setText(id: string, text: string): Promise<boolean> {
    return this.set(id, { text })
  }

} 