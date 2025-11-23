import type { IFile } from "../meta-table/file"
import { FSManager } from "../sdk/fs"
import { DataSpaceWithDatabase } from "./db"
import { getUuid } from "@/lib/utils"
import { lookup as getMimeType } from "@/lib/mime/mime"

// Extension class to add file-related methods
export class DataSpaceWithFile extends DataSpaceWithDatabase {
  private fileWatcherController: AbortController | null = null

  // File operations
  public async getFileByPath(path: string) {
    return await this.file.getFileByPath(path)
  }

  public async delFileByPath(path: string) {
    const file = await this.file.getFileByPath(path)
    if (!file) {
      return
    }
    return await this.file.del(file.id)
  }



  /**
   * External file system operations (~/ and @/)
   * API follows Node.js fs/promises
   */
  get fs() {
    return new FSManager(this)
  }

  /**
   * Initialize file watcher for .eidos/files/
   */
  public async initFileWatcher() {
    const fileDir = "~/.eidos/files/"
    // Ensure dir exists
    try {
      await this.fs.mkdir(fileDir, { recursive: true })
    } catch (e) {
      // Ignore if already exists or other error
    }

    // Cancel existing watcher if any
    if (this.fileWatcherController) {
      this.fileWatcherController.abort()
    }

    // Create new controller for this watcher
    this.fileWatcherController = new AbortController()

    // Watch for changes
    this.watchLoop(fileDir, this.fileWatcherController.signal)
  }

  /**
   * Stop file watcher to avoid resource consumption
   */
  public unwatchFileWatcher() {
    if (this.fileWatcherController) {
      this.fileWatcherController.abort()
      this.fileWatcherController = null
    }
  }

  private async watchLoop(fileDir: string, signal?: AbortSignal) {
    try {
      for await (const event of this.fs.watch(fileDir, { signal })) {
        if (!event.filename) continue

        const fullPath = `${fileDir}${event.filename}`

        // Handle rename (add/delete) and change
        // We check existence to distinguish add vs delete
        const exists = await this.fs.exists(fullPath)

        if (exists) {
          await this.syncFile(fullPath)
        } else {
          // remove .eidos/ prefix
          const path = fullPath.replace("~/.eidos/", "")
          await this.delFileByPath(path)
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("File watcher cancelled")
      } else {
        console.error("File watcher error:", error)
      }
    }
  }

  private async syncFile(path: string) {
    try {

      // remove .eidos/ prefix
      const stats = await this.fs.stat(path)
      if (stats.isDirectory) return

      const filename = path.split("/").pop()!
      // Try to find existing file by path

      const filePathInSpace = path.replace("~/.eidos/", "")
      const existing = await this.getFileByPath(filePathInSpace)

      // Get mime type from filename
      const mimeResult = getMimeType(filename)
      const mime = (typeof mimeResult === 'string' ? mimeResult : null) || 'application/octet-stream'

      const fileInfo: IFile = {
        id: existing ? existing.id : getUuid(), // Keep existing ID or generate new
        name: filename, // Use filename as name
        path: filePathInSpace,
        size: stats.size,
        mime: mime,
        updated_at: new Date(stats.mtimeMs).toISOString()
      }

      if (existing) {
        // Update
        // BaseFileTable doesn't have update method exposed easily, but we can use SQL
        // Or we can delete and add? No, ID preservation is important.
        // Let's use exec directly or add update method to FileTable.
        // For now, I'll use a direct SQL update
        await this.db.exec({
          sql: `UPDATE ${this.file.name} SET size = ?, updated_at = ? WHERE id = ?`,
          bind: [fileInfo.size, fileInfo.updated_at, fileInfo.id]
        })
      } else {
        // Insert
        await this.file.add(fileInfo)
      }
    } catch (error) {
      console.error("Sync file error:", error)
    }
  }


}
