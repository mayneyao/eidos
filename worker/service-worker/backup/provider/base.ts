import {
  EidosFileSystemManager,
  efsManager,
} from "@/lib/storage/eidos-file-system"
import { nonNullable } from "@/lib/utils"

export abstract class BaseBackupServer {
  async pull(directoryPath: string) {
    const start = Date.now()
    console.log("start pull", directoryPath)
    // Get all files in the directory
    const localFiles = await this.walkLocalDirectory(directoryPath)
    const remoteFiles = await this.walk(directoryPath)
    // Find files that exist in the local directory but not in the remote directory
    const filesToDownload = remoteFiles.filter(
      (file) => !localFiles.includes(file)
    )
    // Find files that exist in the remote directory but not in the local directory
    const filesToDelete = localFiles.filter(
      (file) => !remoteFiles.includes(file)
    )
    console.log("filesToDownload", filesToDownload)
    console.log("filesToDelete", filesToDelete)
    try {
      // Upload new or modified files to the remote directory
      for (const filePath of filesToDownload) {
        const fileContent = await this.getFile(filePath)
        if (fileContent) {
          console.log("download file", filePath)
          await this.save2LocalFile(filePath, fileContent)
        }
      }
      // Delete files from the remote directory that no longer exist in the local directory
      for (const file of filesToDelete) {
        console.log("delete file", file)
        await this.deleteLocalFile(file)
      }
    } catch (error) {
      console.error(error)
    }

    // save db.sqlite3 file
    const dbFilePath = directoryPath + "/db.sqlite3"
    const fileContent = await this.getFile(dbFilePath)
    if (fileContent) {
      await this.save2LocalFile(dbFilePath, fileContent)
    }
    const end = Date.now()
    const cost = end - start
    console.log(`finish pull ${directoryPath} use ${cost}ms`)
  }

  private async getOPFSManager() {
    const opfsRoot = await navigator.storage.getDirectory()
    return new EidosFileSystemManager(opfsRoot)
  }

  private async getOPFSDatabaseFile(directoryPath: string) {
    const opfsManager = await this.getOPFSManager()
    const dbFilePath = directoryPath + "/db.sqlite3"
    const opfsDBFile = await opfsManager.getFileByPath(dbFilePath)
    return opfsDBFile
  }

  async push(directoryPath: string) {
    const start = Date.now()
    console.log("start sync", directoryPath)
    // before push, copy db.sqlite3 file from opfs to nfs.
    const dbFilePath = directoryPath + "/db.sqlite3"
    const opfsManager = await this.getOPFSManager()
    await opfsManager.copyFile(dbFilePath.split("/"), efsManager)
    // Get all files in the directory
    const localFiles = await this.walkLocalDirectory(directoryPath)
    const remoteFiles = await this.walk(directoryPath)
    // Find files that exist in the local directory but not in the remote directory
    const filesToUpload = localFiles.filter(
      (file) => !remoteFiles.includes(file)
    )
    // Find files that exist in the remote directory but not in the local directory
    const filesToDelete = remoteFiles.filter(
      (file) => !localFiles.includes(file)
    )
    // Upload new or modified files to the remote directory
    for (const filePath of filesToUpload) {
      const fileContent = await this.getLocalFile(filePath)
      if (fileContent) {
        console.log("upload file", filePath)
        await this.uploadFile(filePath, fileContent)
      }
    }

    // Delete files from the remote directory that no longer exist in the local directory
    for (const file of filesToDelete) {
      console.log("delete file", file)
      await this.deleteFile(file)
    }

    // check db.sqlite3 file last modified time
    const opfsDBFile = await this.getOPFSDatabaseFile(directoryPath)

    if (opfsDBFile) {
      const lastModifiedTime = await this.getLastModifiedTime(dbFilePath)
      console.log("lastModifiedTime[server]", lastModifiedTime)
      console.log("lastModifiedTime[opfs]", new Date(opfsDBFile.lastModified))
      const shouldUpload = this.shouldUpload(
        new Date(opfsDBFile.lastModified),
        lastModifiedTime!
      )
      if (shouldUpload) {
        console.log("need update db.sqlite3", dbFilePath)
        await this.uploadFile(dbFilePath, opfsDBFile)
      }
    }
    const end = Date.now()
    const cost = end - start
    console.log(`finish sync ${directoryPath} use ${cost}ms`)
  }

  async getLocalFile(path: string): Promise<File | null> {
    return efsManager.getFileByPath(path)
  }

  async walkLocalDirectory(directory: string): Promise<string[]> {
    const paths = directory.split("/")
    const files = await efsManager.walk(paths)
    return files.map((file) => file.join("/"))
  }

  async save2LocalFile(path: string, file: File) {
    const paths = path.split("/").filter(nonNullable)
    paths.pop()
    return efsManager.addFile(paths, file)
  }
  async deleteLocalFile(path: string) {
    const paths = path.split("/").filter(nonNullable)
    return efsManager.deleteEntry(paths)
  }

  shouldUpload(
    localFileLastModifiedTime: Date,
    remoteFileLastModifiedTime: Date
  ): boolean {
    console.log(
      localFileLastModifiedTime,
      remoteFileLastModifiedTime,
      localFileLastModifiedTime > remoteFileLastModifiedTime
    )
    return localFileLastModifiedTime > remoteFileLastModifiedTime
  }

  abstract walk(directory: string): Promise<string[]>

  abstract uploadFile(path: string, file: File): Promise<void>

  abstract getFile(path: string): Promise<File | null>

  abstract deleteFile(path: string): Promise<void>

  abstract getLastModifiedTime(file: string): Promise<Date | null>
}
