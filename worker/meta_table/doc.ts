import { DocTableName } from "@/lib/sqlite/const"

import { DataSpace } from "../DataSpace"
import { BaseTable } from "./base"

interface IDoc {
  id: string
  content: string
}

export class DocTable implements BaseTable<IDoc> {
  name = DocTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    content TEXT
  );
`
  constructor(private dataSpace: DataSpace) {
    this.dataSpace.exec(this.createTableSql)
  }

  async add(data: IDoc) {
    await this.dataSpace.exec2(`INSERT INTO ${this.name} VALUES (?, ?)`, [
      data.id,
      data.content,
    ])
    return data
  }

  async get(id: string) {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${this.name} WHERE id = ? LIMIT 1`,
      [id]
    )
    if (res.length === 0) {
      return null
    }
    return {
      id,
      title: res[0].title,
      content: res[0].content,
    }
  }

  async set(id: string, data: IDoc) {
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET content = ? WHERE id = ?`,
      [data.content, id]
    )
    return true
  }

  async del(id: string) {
    this.dataSpace.exec(`DELETE FROM ${this.name} WHERE id = ?`, [id])
    return true
  }
}
