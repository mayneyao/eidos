import { opfsManager } from "@/lib/opfs"
import { FileTableName } from "@/lib/sqlite/const"
import { getUuid } from "@/lib/utils"

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

  async saveFile2OPFS(url: string, _name?: string): Promise<IFile | null> {
    if (typeof url === "string") {
      const fileId = getUuid()
      const blob = await fetch(url).then((res) => res.blob())
      const name = _name || url.split("/").pop()!
      const file = new File([blob], name, { type: blob.type })
      const space = this.dataSpace.dbName
      const paths = await opfsManager.addFile(
        ["spaces", space, "files"],
        file,
        _name ? _name : fileId
      )
      if (!paths) {
        throw new Error("add file failed")
      }
      const path = paths.join("/")
      const size = file.size
      const fileObj = this.add({
        id: fileId,
        name,
        path,
        size,
        mime: file.type,
      })
      return fileObj
    }
    return null
  }
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

  list(): Promise<IFile[]> {
    const res = this.dataSpace.exec2(`SELECT * FROM ${this.name};`)
    return res as Promise<IFile[]>
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
  /**
   * get blob url of file
   * in script or extension environment we can't access opfs file directly, so we need to use blob url to access it.
   * @param id file id
   * @returns
   */
  async getBlobURL(id: string): Promise<string | null> {
    const file = await this.get(id)
    if (!file) {
      throw new Error("file not found")
    }
    const f = await opfsManager.getFileByPath(file.path)
    return URL.createObjectURL(f)
  }

  async walk(): Promise<any[]> {
    const allFiles = await opfsManager.walk([
      "spaces",
      this.dataSpace.dbName,
      "files",
    ])
    return allFiles
  }
}
