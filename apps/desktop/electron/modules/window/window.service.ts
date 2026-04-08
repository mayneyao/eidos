import type { BrowserWindow } from "electron"
import {
  app,
  BrowserWindow as ElectronBrowserWindow,
  ipcMain,
  shell,
} from "electron"
import os from "node:os"
import path from "path"
import { debounce } from "@/lib/lodash"

import { Injectable, Inject, container } from "../../common/di"
import { ConfigManager } from "../config/config-manager"
import type { TrayService } from "./tray.service"
import type { AppLifecycleService } from "./app-lifecycle.service"
import { setupGeolocationHandler } from "./geolocation"

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

    win.on("resize", persistWindowState)
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
      }
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
        win.webContents.reload()
      }
    })

    // Handle external links - open in default browser instead of new window
    win.webContents.setWindowOpenHandler(({ url }) => {
      const protocol = new URL(url).protocol
      // Only allow http and https protocol external links to open in system browser
      if (["https:", "http:"].includes(protocol)) {
        shell.openExternal(url)
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
      if (!appLifecycleService.isForceQuit()) {
        if (process.platform === "darwin") {
          event.preventDefault()
          this.mainWindow?.hide()
        } else {
          appLifecycleService.setForceQuit(true)
          // Get tray service from container and destroy it
          try {
            container.get(TrayService).destroyTray()
          } catch {}
          app.quit()
        }
      }
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
