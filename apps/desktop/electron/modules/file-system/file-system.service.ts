/**
 * File System Service - Handles file system operations and dialogs
 */

import fs from "fs/promises"
import { dialog, shell } from "electron"
import electronLog from "electron-log"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable } from "../../common/di"

/**
 * File System Service - Manages file operations via IPC
 */
@IpcInjectable("file-system")
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

  /**
   * Read file content
   */
  async readFile(
    filePath: string,
    encoding: BufferEncoding = "utf-8"
  ): Promise<string> {
    return fs.readFile(filePath, encoding)
  }

  /**
   * Write file content
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, "utf-8")
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Create directory
   */
  async createDirectory(dirPath: string, recursive = true): Promise<void> {
    await fs.mkdir(dirPath, { recursive })
  }

  /**
   * Show save file dialog
   */
  async showSaveDialog(
    options: {
      defaultPath?: string
      filters?: Array<{ name: string; extensions: string[] }>
    } = {}
  ): Promise<{ canceled: boolean; filePath?: string }> {
    const result = await dialog.showSaveDialog(options)
    return {
      canceled: result.canceled,
      filePath: result.filePath,
    }
  }

  /**
   * Show open file dialog
   */
  async showOpenDialog(
    options: {
      properties?: Array<"openFile" | "openDirectory" | "multiSelections">
      filters?: Array<{ name: string; extensions: string[] }>
    } = {}
  ): Promise<{ canceled: boolean; filePaths: string[] }> {
    const result = await dialog.showOpenDialog(options)
    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    }
  }
}
