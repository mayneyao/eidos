import { EmbeddingTableName } from "@/lib/sqlite/const"

import { BaseTable, BaseTableImpl } from "./base"

export interface IEmbedding {
  id: string
  embedding: string
  model: string
  rawContent: string
  sourceType: "doc" | "table" | "file"
  source: string
}

export class EmbeddingTable
  extends BaseTableImpl
  implements BaseTable<IEmbedding>
{
  name: string = EmbeddingTableName
  createTableSql = `
CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    embedding TEXT,
    model TEXT,
    rawContent TEXT,
    sourceType TEXT,
    source TEXT
);
`
  add(data: IEmbedding): Promise<IEmbedding> {
    this.dataSpace.exec(
      `INSERT INTO ${this.name} (id, embedding, model, rawContent, sourceType, source) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.embedding,
        data.model,
        data.rawContent,
        data.sourceType,
        data.source,
      ]
    )
    return Promise.resolve(data)
  }
  get(id: string): Promise<IEmbedding | null> {
    throw new Error("Method not implemented.")
  }
  set(id: string, data: Partial<IEmbedding>): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
  del(id: string): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
}
