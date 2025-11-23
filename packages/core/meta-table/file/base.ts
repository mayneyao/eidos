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
  updated_at?: string
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

}

