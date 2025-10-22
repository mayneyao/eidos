import {
  EidosFileSystemManager,
  FileSystemType,
  getFsRootHandle,
} from "@/lib/storage/eidos-file-system"
import type { BaseFileTable } from "./base"
import { FileSystemError } from "./errors"

// Mixin to add file system transformation operations
type Constructor<T = {}> = new (...args: any[]) => T & BaseFileTable

export function WithFileSystem<T extends Constructor>(Base: T) {
  return class FileSystemFileTableMixin extends Base {
    async walk(): Promise<any[]> {
      const fileManager = this.dataSpace.efsManager
      if (!fileManager) {
        throw new FileSystemError("file manager not found")
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
  }
}

