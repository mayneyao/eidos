import { ipcMain, webContents, BrowserWindow } from "electron"
import { IpcServiceBase } from "@eidos.space/electron-ipc"

import { IpcInjectable, Injectable, container } from "../../common/di"

/**
 * Webview Service - Handles webview-related IPC
 * Note: This uses ipcMain.on instead of ipcMain.handle for event-based communication
 */
@IpcInjectable("webview")
export class WebviewService extends IpcServiceBase {
  /**
   * Register the webview-dom-ready handler
   * This uses ipcMain.on (event-based) instead of handle (request-response)
   */
  register(): void {
    super.register()

    // Handle webview DOM ready - sets up window open handler
    ipcMain.on("webview-dom-ready", (event, id) => {
      const wc = webContents.fromId(id)
      if (!wc) {
        console.warn("[WebviewService] WebContents not found for id:", id)
        return
      }

      // Get the main window from the sender (renderer process)
      const senderWin = BrowserWindow.fromWebContents(event.sender)
      if (!senderWin) {
        console.warn("[WebviewService] Could not get BrowserWindow from sender")
        return
      }

      console.log(
        "[WebviewService] Setting up window open handler for webview:",
        id
      )

      wc.setWindowOpenHandler(({ url }) => {
        console.log("[WebviewService] Window open requested:", url)
        const protocol = new URL(url).protocol
        // Open http/https links in new tab via renderer
        if (["https:", "http:"].includes(protocol)) {
          senderWin.webContents.send("browser.view:newTab", { url })
          console.log("[WebviewService] Sent newTab event to renderer:", url)
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
