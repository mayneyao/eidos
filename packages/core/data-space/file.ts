import type { FileSystemType } from "@/lib/storage/eidos-file-system"
import { EidosFileSystemManager } from "@/lib/storage/eidos-file-system"
import type { IFile } from "../meta-table/file"
import { DataSpaceWithDatabase } from "./db"

// Extension class to add file-related methods
export class DataSpaceWithFile extends DataSpaceWithDatabase {
  // File operations
  public async addFile(file: IFile) {
    return await this.file.add(file)
  }

  public async uploadDir(
    dirHandle: FileSystemDirectoryHandle,
    _parentPath?: string[]
  ) {
    const fs = new EidosFileSystemManager(dirHandle)
    console.log(fs)
    const files = await fs.walk([])
    console.log(files)
    const count = files.length
    console.log(count)
    await this.file.uploadDir(dirHandle, count, 0, _parentPath)
    this.blockUIMsg(null)
    return
  }

  public async getFileById(id: string) {
    return await this.file.get(id)
  }

  public async getFileByPath(path: string) {
    return await this.file.getFileByPath(path)
  }

  public async delFile(id: string) {
    return await this.file.del(id)
  }

  public async delFileByPath(path: string) {
    const file = await this.file.getFileByPath(path)
    if (!file) {
      return
    }
    return await this.file.del(file.id)
  }

  public async deleteFileByPathPrefix(prefix: string) {
    return await this.file.deleteFileByPathPrefix(prefix)
  }

  public async updateFileVectorized(id: string, isVectorized: boolean) {
    return await this.file.updateVectorized(id, isVectorized)
  }

  public async saveFile2EFS(url: string, subDir: string[] = [], name?: string) {
    return await this.file.saveFile2EFS(url, subDir, name)
  }

  public async listFiles() {
    return await this.file.list()
  }

  public async walkFiles() {
    return await this.file.walk()
  }

  public async transformFileSystem(
    sourceFs: FileSystemType,
    targetFs: FileSystemType
  ) {
    return await this.file.transformFileSystem(sourceFs, targetFs)
  }
}
