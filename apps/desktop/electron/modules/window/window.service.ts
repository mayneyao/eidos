import type { BrowserWindow } from "electron"
import {
  app,
  BrowserWindow as ElectronBrowserWindow,
  dialog,
  ipcMain,
  shell,
} from "electron"
import os from "node:os"
import path from "path"
import { debounce } from "@/lib/lodash"

import { Injectable, Inject, container } from "../../common/di"
import { ConfigManager } from "../config/config-manager"
import { TrayService } from "./tray.service"
import type { AppLifecycleService } from "./app-lifecycle.service"
import { setupGeolocationHandler } from "./geolocation"
import { BrowserService } from "../browser/browser.service"

const defaultViewOptions = {
  webPreferences: {
    preload: path.join(__dirname, "./preload.mjs"),
    nodeIntegration: true,
    contextIsolation: true,
    webviewTag: true,
    webSecurity: true,
  },
}

/**
 * Window Service - Manages the main BrowserWindow lifecycle
 *
 * Responsibilities:
 * - Create and manage main window
 * - Persist window state (size, position, maximized)
 * - Handle window control IPC (minimize, maximize, close)
 * - Manage window event handlers
 */
@Injectable()
export class WindowService {
  private mainWindow: BrowserWindow | null = null
  private port: number = 13127
  private closeApproved = false
  private closeCheckInProgress = false
  private closeRequestCounter = 0
  private reloadCheckInProgress = false

  constructor(@Inject(ConfigManager) private configManager: ConfigManager) {}

  /**
   * Set the port for loading URLs
   */
  setPort(port: number): void {
    this.port = port
  }

  /**
   * Create the main application window
   */
  createWindow(spaceId?: string): BrowserWindow {
    const savedWindowState = this.configManager.get("windowState")

    let baseWindowConfig: Electron.BrowserWindowConstructorOptions = {
      width: savedWindowState?.width ?? 1440,
      height: savedWindowState?.height ?? 900,
      x: savedWindowState?.x,
      y: savedWindowState?.y,
      ...defaultViewOptions,
    }

    const platform = process.platform

    // Platform-specific configurations
    switch (platform) {
      case "darwin":
        baseWindowConfig = {
          ...baseWindowConfig,
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 16, y: 10 },
          vibrancy: "under-window",
          visualEffectState: "active",
          transparent: true,
        }
        break
      case "win32":
      case "linux":
        baseWindowConfig = {
          ...baseWindowConfig,
          autoHideMenuBar: true,
          frame: false,
        }
        break
    }

    const win = new ElectronBrowserWindow(baseWindowConfig)
    this.mainWindow = win

    // Set up window state persistence
    this.setupWindowStatePersistence(win)

    // Set up geolocation permission handler
    setupGeolocationHandler(win)

    // Load the appropriate URL
    this.loadWindowUrl(win, spaceId)

    // Set up IPC handlers
    this.setupIpcHandlers(win)

    // Set up window event handlers
    this.setupWindowEventHandlers(win)

    return win
  }

  /**
   * Get the main window instance
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  /**
   * Get the main window web contents
   */
  getMainWindowWebContents() {
    return this.mainWindow?.webContents || null
  }

  /**
   * Show the main window
   */
  showWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.show()
    }
  }

  /**
   * Hide the main window
   */
  hideWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.hide()
    }
  }

  /**
   * Check if window is destroyed
   */
  isWindowDestroyed(): boolean {
    return !this.mainWindow || this.mainWindow.isDestroyed()
  }

  /**
   * Check if window is minimized
   */
  isWindowMinimized(): boolean {
    return this.mainWindow?.isMinimized() ?? false
  }

  /**
   * Restore window from minimized state
   */
  restoreWindow(): void {
    if (this.mainWindow?.isMinimized()) {
      this.mainWindow.restore()
    }
  }

  /**
   * Focus the main window
   */
  focusWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.focus()
    }
  }

  /**
   * Set up window state persistence
   */
  private setupWindowStatePersistence(win: BrowserWindow): void {
    const saveWindowState = () => {
      if (win.isDestroyed()) return
      const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
      this.configManager.set("windowState", {
        ...bounds,
        isMaximized: win.isMaximized(),
      })
    }

    // Debounce to avoid excessive config writes during resize/move
    const persistWindowState = debounce(saveWindowState, 200)

    const savedWindowState = this.configManager.get("windowState")
    if (savedWindowState?.isMaximized) {
      win.maximize()
    }

    win.on("resize", () => {
      persistWindowState()
      // Update main window find overlay position on resize
      try {
        const {
          OverlayService,
        } = require("../browser/services/overlay.service")
        const overlayService = container.get(OverlayService)
        overlayService.updateMainWindowFindOverlayPosition()
      } catch {
        // OverlayService might not be available yet, ignore
      }
    })
    win.on("move", persistWindowState)
    win.on("close", saveWindowState)
  }

  /**
   * Load the appropriate URL for the window
   */
  private loadWindowUrl(win: BrowserWindow, spaceId?: string): void {
    if (spaceId) {
      if (process.env.VITE_DEV_SERVER_URL) {
        const devUrl = new URL(process.env.VITE_DEV_SERVER_URL)
        const devSubdomainUrl = `http://${spaceId}.eidos.localhost:${devUrl.port}/`
        console.log(
          `🌐 Development mode: Loading subdomain URL: ${devSubdomainUrl}`
        )
        win.loadURL(devSubdomainUrl)
        win.webContents.openDevTools()
      } else {
        const prodSubdomainUrl = `http://${spaceId}.eidos.localhost:${this.port}/`
        console.log(
          `🌐 Production mode: Loading subdomain URL: ${prodSubdomainUrl}`
        )
        win.loadURL(prodSubdomainUrl)
      }
    } else if (process.env.VITE_DEV_SERVER_URL) {
      console.log(
        `🌐 Loading window with Vite dev server URL: ${process.env.VITE_DEV_SERVER_URL}`
      )
      win.loadURL(process.env.VITE_DEV_SERVER_URL)
      win.webContents.openDevTools()
    } else {
      const localhostUrl = `http://localhost:${this.port}`
      console.log(`🌐 Loading window with localhost URL: ${localhostUrl}`)
      win.loadURL(localhostUrl)
    }
  }

  /**
   * Set up IPC handlers for window control
   */
  private setupIpcHandlers(win: BrowserWindow): void {
    // Remove existing handlers to avoid duplicates on reload
    ipcMain.removeAllListeners("window-control")

    ipcMain.on("window-control", (_, action: string) => {
      switch (action) {
        case "minimize":
          win.minimize()
          break
        case "maximize":
          win.maximize()
          break
        case "unmaximize":
          win.unmaximize()
          break
        case "close":
          win.close()
          break
        case "focus":
          win.focus()
          break
      }
    })

    // Handle find overlay close from overlay view
    ipcMain.on("browser.find:close", (_, viewId: string) => {
      win.webContents.send("browser.find:close", viewId)
    })
  }

  /**
   * Set up window event handlers
   */
  private setupWindowEventHandlers(win: BrowserWindow): void {
    win.on("maximize", () =>
      win.webContents.send("window-state-changed", "maximized")
    )

    win.on("unmaximize", () =>
      win.webContents.send("window-state-changed", "restored")
    )

    // Intercept reload shortcuts
    win.webContents.on("before-input-event", (event, input) => {
      const isReloadShortcut =
        (input.key.toLowerCase() === "r" && (input.control || input.meta)) ||
        input.key === "F5"

      if (isReloadShortcut && !input.alt) {
        event.preventDefault()
        void this.reloadMainWindow()
      }
    })

    // Handle external links - open in new tab or system browser based on config
    win.webContents.setWindowOpenHandler(({ url }) => {
      console.log("[WindowService] Window open handler triggered:", url)
      const protocol = new URL(url).protocol
      if (["https:", "http:"].includes(protocol)) {
        // Check browser config to determine where to open the link
        const browserConfig = this.configManager.get("browser")
        if (browserConfig?.openLinksInBuiltInBrowser !== false) {
          // Open in built-in browser
          win.webContents.send("browser.view:newTab", { url })
          console.log("[WindowService] Sent newTab event:", url)
        } else {
          // Open in system default browser
          shell.openExternal(url)
          console.log("[WindowService] Opened in system browser:", url)
        }
      }
      // Deny other types of window open requests to maintain app security
      return { action: "deny" }
    })

    // Clean up reference when window is closed
    win.on("closed", () => {
      this.mainWindow = null
    })
  }

  /**
   * Set up app activate handler (macOS dock click)
   */
  setupActivateHandler(): void {
    app.on("activate", () => {
      this.showWindow()
    })
  }

  /**
   * Set up window close handler
   * - macOS: Hide window instead of closing (dock icon stays)
   * - Windows/Linux: Quit app and destroy tray
   */
  setupCloseHandler(appLifecycleService: AppLifecycleService): void {
    if (!this.mainWindow) return

    this.mainWindow.on("close", (event) => {
      if (this.closeApproved) return

      if (!appLifecycleService.isForceQuit() && process.platform === "darwin") {
        event.preventDefault()
        this.mainWindow?.hide()
        return
      }

      event.preventDefault()
      if (this.closeCheckInProgress) return
      this.closeCheckInProgress = true
      void this.finishCloseAfterPendingWrites(appLifecycleService).finally(
        () => {
          this.closeCheckInProgress = false
        }
      )
    })
  }

  private async finishCloseAfterPendingWrites(
    appLifecycleService: AppLifecycleService
  ): Promise<void> {
    const win = this.mainWindow
    if (!win || win.isDestroyed()) return

    const saved = await this.requestPendingWriteFlush(win)
    if (!saved) {
      const { response } = await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["Keep Eidos Open", "Discard Unsaved Changes"],
        defaultId: 0,
        cancelId: 0,
        title: "Unable to save current file",
        message: "Eidos could not save all pending file changes.",
        detail:
          "Keep Eidos open to resolve the error, or discard the unsaved changes and quit.",
        noLink: true,
      })
      if (response === 0) {
        appLifecycleService.setForceQuit(false)
        win.show()
        return
      }
    }

    this.closeApproved = true
    appLifecycleService.setForceQuit(true)
    try {
      container.get(TrayService).destroyTray()
    } catch {}
    app.quit()
  }

  public async reloadMainWindow(): Promise<boolean> {
    const win = this.mainWindow
    if (!win || win.isDestroyed() || this.reloadCheckInProgress) return false

    this.reloadCheckInProgress = true
    try {
      const saved = await this.requestPendingWriteFlush(win)
      if (!saved) {
        const { response } = await dialog.showMessageBox(win, {
          type: "warning",
          buttons: ["Keep Eidos Open", "Discard Unsaved Changes and Reload"],
          defaultId: 0,
          cancelId: 0,
          title: "Unable to save current file",
          message: "Eidos could not save all pending file changes.",
          detail:
            "Keep Eidos open to resolve the error, or discard the unsaved changes and reload.",
          noLink: true,
        })
        if (response === 0) return false
      }

      try {
        container.get(BrowserService).closeAll()
      } catch {}
      win.webContents.reload()
      return true
    } finally {
      this.reloadCheckInProgress = false
    }
  }

  private requestPendingWriteFlush(win: BrowserWindow): Promise<boolean> {
    if (win.webContents.isDestroyed()) return Promise.resolve(true)

    const requestId = `${Date.now()}-${++this.closeRequestCounter}`
    const responseChannel = `window:flush-pending-writes:complete:${requestId}`
    return new Promise((resolve) => {
      let settled = false
      const finish = (success: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        ipcMain.removeListener(responseChannel, handleResponse)
        resolve(success)
      }
      const handleResponse = (
        event: Electron.IpcMainEvent,
        success: unknown
      ) => {
        if (event.sender !== win.webContents) return
        finish(success === true)
      }
      const timeout = setTimeout(() => finish(false), 5000)
      ipcMain.on(responseChannel, handleResponse)
      win.webContents.send("window:flush-pending-writes", requestId)
    })
  }
}

// Backward compatibility function
export function createWindow(spaceId?: string, port?: number): BrowserWindow {
  const windowService = container.get(WindowService)
  if (port) {
    windowService.setPort(port)
  }
  return windowService.createWindow(spaceId)
}
