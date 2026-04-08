import fs from "fs/promises"
import { dialog, shell } from "electron"
import electronLog from "electron-log"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"

/**
 * File System Service - Handles file system operations and dialogs
 */
@IpcService("file-system")
export class FileSystemService extends IpcServiceBase {
  /**
   * Show folder selection dialog
   */
  async selectFolder(): Promise<string | undefined> {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    })

    if (result.canceled) {
      return undefined
    }
    return result.filePaths[0]
  }

  /**
   * Show a path in the file manager
   */
  async showInFileManager(
    filePath: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!filePath) {
      electronLog.warn("No path provided")
      return { success: false, error: "No path provided" }
    }

    try {
      const stats = await fs.stat(filePath)
      if (stats.isFile()) {
        shell.showItemInFolder(filePath)
      } else {
        shell.openPath(filePath)
      }
    } catch (error) {
      electronLog.error("Error accessing path:", error)
      return { success: false, error: "Failed to access path" }
    }

    return { success: true }
  }

  /**
   * Open a URL in the default browser
   */
  async openUrl(url: string): Promise<{ success: boolean; error?: string }> {
    if (!url || typeof url !== "string") {
      electronLog.warn("Invalid URL provided")
      return { success: false, error: "Invalid URL provided" }
    }

    try {
      await shell.openExternal(url)
      electronLog.info(`URL opened successfully: ${url}`)
      return { success: true }
    } catch (error) {
      electronLog.error(`Error opening URL: ${error}`)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}

// Export singleton instance
export const fileSystemService = new FileSystemService()
