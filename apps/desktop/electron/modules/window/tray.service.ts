import { Menu, Tray, app, nativeImage } from "electron"
import electronLog from "electron-log"
import path from "path"

import { Injectable, container } from "../../common/di"
import type { WindowService } from "./window.service"

/**
 * Tray Service - Manages system tray icon and menu
 *
 * Responsibilities:
 * - Create and destroy system tray icon
 * - Handle tray menu actions (show, quit)
 */
@Injectable()
export class TrayService {
  private tray: Tray | null = null
  private onQuitCallback: (() => void) | null = null
  private windowService: WindowService | null = null

  setWindowService(windowService: WindowService): void {
    this.windowService = windowService
  }

  /**
   * Create system tray icon and menu
   */
  createTray(onQuit?: () => void): void {
    // macOS doesn't use tray icon
    if (process.platform === "darwin") {
      return
    }

    this.onQuitCallback = onQuit || null

    try {
      const iconPath = path.join(process.env.VITE_PUBLIC || "", "logo.png")
      electronLog.info("Tray icon path:", iconPath)

      const icon = nativeImage.createFromPath(iconPath)
      this.tray = new Tray(icon)

      const contextMenu = Menu.buildFromTemplate([
        {
          label: "show",
          click: () => this.windowService?.showWindow(),
        },
        {
          label: "exit",
          click: () => {
            this.onQuitCallback?.()
            app.quit()
          },
        },
      ])

      this.tray.setToolTip("Eidos")
      this.tray.setContextMenu(contextMenu)

      // Handle tray click to show window
      this.tray.on("click", () => {
        this.windowService?.showWindow()
      })

      electronLog.info("Tray created successfully")
    } catch (error) {
      electronLog.error("Error creating tray:", error)
    }
  }

  /**
   * Destroy tray icon
   */
  destroyTray(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }

  /**
   * Check if tray is created
   */
  isTrayCreated(): boolean {
    return this.tray !== null
  }
}

// Backward compatibility exports
export interface TrayManagerOptions {
  getWindow: () => Electron.BrowserWindow | null
  onQuit: () => void
}

export function createTray(options: TrayManagerOptions): void {
  container.get(TrayService).createTray(options.onQuit)
}

export function destroyTray(): void {
  container.get(TrayService).destroyTray()
}
