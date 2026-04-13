import { ipcMain, webContents, BrowserWindow, shell } from "electron"
import { IpcServiceBase } from "@eidos.space/electron-ipc"

import { IpcInjectable, Injectable, container, Inject } from "../../common/di"
import { ConfigManager } from "../config/config-manager"

/**
 * Webview Service - Handles webview-related IPC
 * Note: This uses ipcMain.on instead of ipcMain.handle for event-based communication
 */
@IpcInjectable("webview")
export class WebviewService extends IpcServiceBase {
  constructor(@Inject(ConfigManager) private configManager: ConfigManager) {
    super()
  }

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
        if (["https:", "http:"].includes(protocol)) {
          // Check browser config to determine where to open the link
          const browserConfig = this.configManager.get("browser")
          if (browserConfig?.openLinksInBuiltInBrowser !== false) {
            // Open in built-in browser
            senderWin.webContents.send("browser.view:newTab", { url })
            console.log("[WebviewService] Sent newTab event to renderer:", url)
          } else {
            // Open in system default browser
            shell.openExternal(url)
            console.log("[WebviewService] Opened in system browser:", url)
          }
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
