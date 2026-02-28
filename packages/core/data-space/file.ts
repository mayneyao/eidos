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
   *
   * NOTE: File watcher is now disabled for database updates.
   *
   * Design change: To maintain consistency between database and file sync,
   * we no longer automatically update the eidos__files table when local files change.
   *
   * - Files are still auto-synced to cloud via FileSynchronizer
   * - Database records are only updated through explicit API calls (upload, etc.)
   * - This ensures database (Graft) remains the source of truth
   *
   * The watcher loop is kept for debugging/observability but does not modify database state.
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

    // Watch for changes (observability only, no database updates)
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
          // Log for observability but DO NOT auto-update database
          // Files are synced via FileSynchronizer, database updates are explicit
          console.log("[FileWatcher] File changed (synced to cloud):", fullPath)
        } else {
          // Log for observability but DO NOT auto-update database
          console.log("[FileWatcher] File deleted:", fullPath)
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("File watcher cancelled")
      } else {
        console.error("File watcher error:", error)
      }
    }
  }

  /**
   * Sync file metadata to database
   * This is now an explicit operation, not triggered by file system events
   * Called when files are uploaded through the API
   */
  public async syncFileToDatabase(path: string): Promise<IFile | null> {
    try {
      // remove .eidos/ prefix if present
      const normalizedPath = path.startsWith("~/.eidos/")
        ? path
        : `~/.eidos/${path}`
      const stats = await this.fs.stat(normalizedPath)
      if (stats.isDirectory) return null

      const filename = normalizedPath.split("/").pop()!
      const filePathInSpace = normalizedPath.replace("~/.eidos/", "")
      const existing = await this.getFileByPath(filePathInSpace)

      // Get mime type from filename
      const mimeResult = getMimeType(filename)
      const mime =
        (typeof mimeResult === "string" ? mimeResult : null) ||
        "application/octet-stream"

      const fileInfo: IFile = {
        id: existing ? existing.id : getUuid(),
        name: filename,
        path: filePathInSpace,
        size: stats.size,
        mime: mime,
        updated_at: new Date(stats.mtimeMs).toISOString(),
      }

      if (existing) {
        // Update
        await this.db.exec({
          sql: `UPDATE ${this.file.name} SET size = ?, updated_at = ? WHERE id = ?`,
          bind: [fileInfo.size, fileInfo.updated_at, fileInfo.id],
        })
      } else {
        // Insert
        await this.file.add(fileInfo)
      }

      return fileInfo
    } catch (error) {
      console.error("Sync file to database error:", error)
      return null
    }
  }

  /**
   * Remove file metadata from database
   * Explicit operation for when files are deleted through the API
   */
  public async removeFileFromDatabase(path: string): Promise<void> {
    try {
      const filePathInSpace = path.startsWith("~/.eidos/")
        ? path.replace("~/.eidos/", "")
        : path
      await this.delFileByPath(filePathInSpace)
    } catch (error) {
      console.error("Remove file from database error:", error)
    }
  }
}
