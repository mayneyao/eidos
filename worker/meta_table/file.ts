import { FileTableName } from "@/lib/sqlite/const"

import { BaseTable, BaseTableImpl } from "./base"

export interface IFile {
  id: string
  name: string
  path: string
  size: number
  mime: string
  isVectorized?: boolean // whether the file is vectorized, when file is vectorized, it will be stored in `eidos__embeddings` table
}

export class FileTable extends BaseTableImpl implements BaseTable<IFile> {
  name = FileTableName
  createTableSql = `
CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    name TEXT,
    path TEXT UNIQUE,
    size INTEGER,
    mime TEXT,
    isVectorized INTEGER DEFAULT 0 NULL
);  
`
  async add(data: IFile): Promise<IFile> {
    this.dataSpace.exec(
      `INSERT INTO ${this.name} (id,name,path,size,mime) VALUES (? , ? , ? , ? , ?);`,
      [data.id, data.name, data.path, data.size, data.mime]
    )
    return data
  }

  async getFileByPath(path: string): Promise<IFile | null> {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${this.name} WHERE path = ?;`,
      [path]
    )
    if (res.length === 0) {
      return null
    }
    return res[0] as IFile
  }

  async deleteFileByPathPrefix(prefix: string): Promise<boolean> {
    try {
      this.dataSpace.exec(`DELETE FROM ${this.name} WHERE path LIKE ?;`, [
        `${prefix}%`,
      ])
      return Promise.resolve(true)
    } catch (error) {
      return Promise.resolve(false)
    }
  }

  async updateVectorized(id: string, isVectorized: boolean): Promise<boolean> {
    try {
      this.dataSpace.exec(
        `UPDATE ${this.name} SET isVectorized = ? WHERE id = ?;`,
        [isVectorized ? 1 : 0, id]
      )
      return Promise.resolve(true)
    } catch (error) {
      return Promise.resolve(false)
    }
  }

  async get(id: string): Promise<IFile | null> {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${this.name} WHERE id = ?;`,
      [id]
    )
    if (res.length === 0) {
      return null
    }
    return res[0] as IFile
  }
  
  set(id: string, data: Partial<IFile>): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
  del(id: string): Promise<boolean> {
    try {
      this.dataSpace.exec(`DELETE FROM ${this.name} WHERE id = ?;`, [id])
      return Promise.resolve(true)
    } catch (error) {
      return Promise.resolve(false)
    }
  }
}
