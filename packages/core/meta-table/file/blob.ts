import { getExternalFolderManager } from "@/lib/storage/eidos-file-system"
import type { BaseFileTable } from "./base"
import { FileNotFoundError, FileSystemError } from "./errors"
import { PathHelper } from "./helper"

// Mixin to add blob operations
type Constructor<T = {}> = new (...args: any[]) => T & BaseFileTable

export function WithBlob<T extends Constructor>(Base: T) {
  return class BlobFileTableMixin extends Base {
    /**
     * get blob url of file
     * in script or extension environment we can't access opfs file directly, so we need to use blob url to access it.
     * @param id file id
     * @returns
     */
    async getBlobURL(id: string): Promise<string | null> {
      const file = await this.get(id)
      if (!file) {
        throw new FileNotFoundError(`file not found: ${id}`)
      }
      return this.getBlobURLbyPath(file.path)
    }

    async getBlobURLbyPath(path: string): Promise<string | null> {
      const f = await this.dataSpace.efsManager?.getFileByPath(path)
      if (!f) {
        throw new FileNotFoundError(`file not found at path: ${path}`)
      }
      return URL.createObjectURL(f)
    }

    async getBlobByPath(path: string) {
      let fileManager = this.dataSpace.efsManager
      let f: File | null = null
      if (PathHelper.isExternalPath(path)) {
        const { folderName, relativePath } = PathHelper.parseExternalPath(path)
        fileManager = await getExternalFolderManager(folderName)
        f = await fileManager.getFile(relativePath)
      } else {
        if (!fileManager) {
          throw new FileSystemError("file manager not found")
        }
        f = await fileManager.getFileByPath(path)
      }
      const blob = new Blob([f], { type: f.type })
      return blob
    }
  }
}

