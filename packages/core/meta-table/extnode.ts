import { ExtNodeTableName } from "../sqlite/const"
import { BaseTableImpl, type BaseTable } from "./base"

export interface IExtNode {
  id: string
  blob?: Buffer
  text?: string
  type: string
  created_at?: string
  updated_at?: string
}

export class ExtNodeTable
  extends BaseTableImpl<IExtNode>
  implements BaseTable<IExtNode>
{
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

  async setText(id: string, text: string): Promise<boolean> {
    await this.dataSpace.exec2(
      `
      UPDATE ${this.name}
      SET text = ?
      WHERE id = ? AND text != ?
    `,
      [text, id, text]
    )
    return true
  }
}
