import { TreeTableName } from "@/lib/sqlite/const"

import { DataSpace } from "../DataSpace"
import { BaseTable } from "./base"

export interface ITreeNode {
  id: string
  name: string
  type: "table" | "doc" | "subDoc"
  parentId?: string
}

export class TreeTable implements BaseTable<ITreeNode> {
  name = TreeTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${TreeTableName} (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    parentId TEXT NULL
  );
  `
  constructor(private dataSpace: DataSpace) {
    this.dataSpace.exec(this.createTableSql)
  }

  add(data: ITreeNode): Promise<ITreeNode> {
    this.dataSpace.exec(
      `INSERT INTO ${TreeTableName} (id,name,type,parentId) VALUES (? , ? , ? , ?);`,
      [data.id, data.name, data.type, data.parentId]
    )
    return Promise.resolve(data)
  }

  async get(id: string): Promise<ITreeNode | null> {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${TreeTableName} where id = ?;`,
      [id]
    )
    if (res.length === 0) {
      return null
    }
    return res[0] as ITreeNode
  }

  set(id: string, data: ITreeNode): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
  del(id: string): Promise<boolean> {
    throw new Error("Method not implemented.")
  }

  async list(query?: string, withSubNode?: boolean): Promise<ITreeNode[]> {
    let sql = `SELECT * FROM ${TreeTableName} `
    if (query) {
      sql += ` WHERE name like ?`
    }
    if (query && !withSubNode) {
      sql += ` AND parentId is null;`
    }
    const bind = query ? [`%${query}%`] : undefined
    console.log(sql, bind)
    const res = await this.dataSpace.exec2(sql, bind)
    return res.map((row) => row as ITreeNode)
  }
}
