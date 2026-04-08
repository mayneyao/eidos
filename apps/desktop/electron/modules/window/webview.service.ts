import { ipcMain, shell, webContents } from "electron"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"

import { Injectable, container } from "../../common/di"

/**
 * Webview Service - Handles webview-related IPC
 * Note: This uses ipcMain.on instead of ipcMain.handle for event-based communication
 */
@IpcService("webview")
@Injectable()
export class WebviewService extends IpcServiceBase {
  /**
   * Register the webview-dom-ready handler
   * This uses ipcMain.on (event-based) instead of handle (request-response)
   */
  register(): void {
    super.register()

    // Handle webview DOM ready - sets up window open handler
    ipcMain.on("webview-dom-ready", (_, id) => {
      const wc = webContents.fromId(id)
      wc?.setWindowOpenHandler(({ url }) => {
        const protocol = new URL(url).protocol
        // Only allow http and https protocol external links to open in system browser
        if (["https:", "http:"].includes(protocol)) {
          shell.openExternal(url)
        }
        // Deny other types of window open requests to maintain app security
        return { action: "deny" }
      })
    })
  }
}

// Backward compatibility
export const webviewService = {
  register() {
    container.get(WebviewService).register()
  },
}
