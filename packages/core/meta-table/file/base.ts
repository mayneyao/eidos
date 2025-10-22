import { FileTableName } from "../../sqlite/const"
import type { BaseTable } from "../base"
import { BaseTableImpl } from "../base"
import { FileNotFoundError } from "./errors"

export interface IFile {
  id: string
  name: string
  path: string
  size: number
  mime: string
  created_at?: string
  is_vectorized?: boolean // whether the file is vectorized, when file is vectorized, it will be stored in `eidos__embeddings` table
}

export class BaseFileTable extends BaseTableImpl<IFile> implements BaseTable<IFile> {
  name = FileTableName
  createTableSql = `
CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    name TEXT,
    path TEXT UNIQUE,
    size INTEGER,
    mime TEXT,
    is_vectorized INTEGER DEFAULT 0 NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);  
`

  async add(data: IFile): Promise<IFile> {
    this.dataSpace.exec(
      `INSERT INTO ${this.name} (id,name,path,size,mime) VALUES (? , ? , ? , ? , ?);`,
      [data.id, data.name, data.path, data.size, data.mime]
    )
    return data
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

  /**
   * Get file by path (alias for getFileByPath)
   * @param path File path
   * @returns File metadata or null if not found
   */
  async getByPath(path: string): Promise<IFile | null> {
    return this.getFileByPath(path)
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

  async updateVectorized(id: string, is_vectorized: boolean): Promise<boolean> {
    try {
      this.dataSpace.exec(
        `UPDATE ${this.name} SET is_vectorized = ? WHERE id = ?;`,
        [is_vectorized ? 1 : 0, id]
      )
      return Promise.resolve(true)
    } catch (error) {
      return Promise.resolve(false)
    }
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

