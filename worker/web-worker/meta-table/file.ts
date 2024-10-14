import { FileTableName } from "@/lib/sqlite/const"
import {
  EidosFileSystemManager,
  FileSystemType,
  getExternalFolderManager,
  getFsRootHandle,
} from "@/lib/storage/eidos-file-system"
import { getUuid } from "@/lib/utils"

import { BaseTable, BaseTableImpl } from "./base"

export interface IFile {
  id: string
  name: string
  path: string
  size: number
  mime: string
  created_at?: string
  is_vectorized?: boolean // whether the file is vectorized, when file is vectorized, it will be stored in `eidos__embeddings` table
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
    is_vectorized INTEGER DEFAULT 0 NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);  
`

  /**
   * save file to efs
   * @param url a url of file
   * @param subDir sub directory of file, default is [], which means save file to spaces/\<space\>/files/, if subDir is ["a","b"], then save file to spaces/\<space\>/files/a/b/
   * @param _name file name, default is null, which means use the file name in url
   * @returns
   */
  async saveFile2EFS(
    url: string,
    subDir: string[],
    _name?: string
  ): Promise<IFile | null> {
    if (typeof url === "string") {
      const fileId = getUuid()
      const blob = await fetch(url).then((res) => res.blob())
      const name = _name || url.split("/").pop()!
      const file = new File([blob], name, { type: blob.type })
      const space = this.dataSpace.dbName
      const dirs = ["spaces", space, "files", ...subDir]
      const paths = await this.dataSpace.efsManager?.addFile(dirs, file, _name ? _name : fileId)
      if (!paths) {
        throw new Error("add file failed")
      }
      const path = paths.join("/")
      const size = file.size
      const oldFile = await this.getFileByPath(path)
      if (oldFile) {
        return oldFile
      }
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
    return this.getBlobURLbyPath(file.path)
  }

  async getBlobURLbyPath(path: string): Promise<string | null> {
    const f = await this.dataSpace.efsManager?.getFileByPath(path)
    if (!f) {
      throw new Error("file not found")
    }
    return URL.createObjectURL(f)
  }

  async getBlobByPath(path: string) {
    let fileManager = this.dataSpace.efsManager
    let f: File | null = null
    if (path.startsWith("/@/")) {
      const extFolderName = path.split("/")[2]
      fileManager = await getExternalFolderManager(extFolderName)
      const paths = decodeURIComponent(path).split("/").filter(Boolean).slice(2)
      f = await fileManager.getFile(paths)
    } else {
      if (!fileManager) {
        throw new Error("file manager not found")
      }
      f = await fileManager.getFileByPath(path)
    }
    const blob = new Blob([f], { type: f.type })
    return blob
  }

  async walk(): Promise<any[]> {
    const fileManager = this.dataSpace.efsManager
    if (!fileManager) {
      throw new Error("file manager not found")
    }
    const allFiles = await fileManager.walk([
      "spaces",
      this.dataSpace.dbName,
      "files",
    ])
    console.log('allFiles', allFiles)
    return allFiles
  }

  // transform file system
  async transformFileSystem(
    sourceFs: FileSystemType,
    targetFs: FileSystemType
  ) {
    // // create temp table to record log
    // this.dataSpace.exec(
    //   `CREATE TABLE IF NOT EXISTS file_system_transform_log (
    //     current INTEGER,
    //     total INTEGER,
    //     msg TEXT,
    //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    //   );`
    // )
    const callback = async (data: {
      current: number
      total: number
      msg: string
    }) => {
      // this.dataSpace.exec(
      //   `INSERT INTO file_system_transform_log (current,total,msg) VALUES (?,?,?);`,
      //   [data.current, data.total, data.msg]
      // )
      console.log(`current: ${data.current}/${data.total} ${data.msg}`)
      this.dataSpace.blockUIMsg(
        `current: ${data.current}/${data.total} ${data.msg}`,
        {
          progress: (data.current / data.total) * 100,
        }
      )
      if (data.current === data.total) {
        this.dataSpace.blockUIMsg(null)
      }
    }
    if (sourceFs !== targetFs) {
      // if fsType changed, we need to move files to new fs
      const sourceFsManager = new EidosFileSystemManager(
        await getFsRootHandle(sourceFs)
      )
      const targetFsManager = new EidosFileSystemManager(
        await getFsRootHandle(targetFs)
      )
      const ignoreSqlite = targetFs === FileSystemType.OPFS
      await sourceFsManager.copyTo(
        targetFsManager,
        {
          ignoreSqlite,
        },
        callback
      )
    }
  }

  async uploadDir(
    dirHandle: FileSystemDirectoryHandle,
    total: number,
    current: number,
    _parentPath?: string[]
  ) {
    const space = this.dataSpace.dbName
    let parentPath = _parentPath || ["spaces", space, "files"]
    // walk dirHandle upload to /extensions/<name>/
    if (!this.dataSpace.efsManager) {
      throw new Error("file manager not found")
    }
    await this.dataSpace.efsManager.addDir(parentPath, dirHandle.name)
    parentPath = [...parentPath, dirHandle.name]
    for await (const [key, value] of dirHandle.entries()) {
      if (value.kind === "directory") {
        await this.uploadDir(
          value as FileSystemDirectoryHandle,
          total,
          current,
          parentPath
        )
      } else if (value.kind === "file") {
        try {
          const file = await (value as FileSystemFileHandle).getFile()
          const fileId = getUuid()

          const paths = await this.dataSpace.efsManager.addFile(parentPath, file)
          if (!paths) {
            throw new Error("add file failed")
          }
          const { name, size, type: mime } = file
          const path = paths.join("/")
          const fileInfo: IFile = {
            id: fileId,
            name,
            size,
            mime,
            path,
          }
          // TODO: handle duplicate file
          await this.add(fileInfo)
        } catch (error) {
        } finally {
          current++
          this.dataSpace.blockUIMsg(`uploading ${name}`, {
            progress: (current / total) * 100,
          })
        }
      }
    }
  }
}
