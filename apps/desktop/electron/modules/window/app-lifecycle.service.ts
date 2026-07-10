/**
 * App Lifecycle Service - Manages app lifecycle operations
 */

import { app, ipcMain } from "electron"

import { Injectable, Inject, IpcInjectable } from "../../common/di"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { UpdaterService } from "../updater/updater.service"
import { DataSpaceManager } from "../data-space"
import { GlobalShortcutsService } from "./global-shortcuts.service"
import { WindowService } from "./window.service"

@IpcInjectable("app-lifecycle")
export class AppLifecycleService extends IpcServiceBase {
  private forceQuit = false
  private cleanupCallbacks: Array<() => void> = []

  constructor(
    @Inject(UpdaterService) private updaterService: UpdaterService,
    @Inject(DataSpaceManager) private dataSpaceManager: DataSpaceManager,
    @Inject(GlobalShortcutsService)
    private globalShortcutsService: GlobalShortcutsService,
    @Inject(WindowService) private windowService: WindowService
  ) {
    super()
  }

  /**
   * Register a callback to be called during cleanup (window-all-closed)
   */
  onCleanup(callback: () => void): void {
    this.cleanupCallbacks.push(callback)
  }

  /**
   * Get the main window reference
   */
  getMainWindow(): Electron.BrowserWindow | null {
    return this.windowService.getMainWindow()
  }

  /**
   * Check if force quit is enabled
   */
  isForceQuit(): boolean {
    return this.forceQuit
  }

  /**
   * Set force quit state
   */
  setForceQuit(value: boolean): void {
    this.forceQuit = value
  }

  /**
   * Set up app lifecycle event handlers
   */
  setupLifecycleHandlers(
    onBeforeQuit?: () => void,
    onWindowAllClosed?: () => void
  ): void {
    // Window all closed - cleanup resources
    app.on("window-all-closed", () => {
      // Close dataspace via DI if available
      try {
        this.dataSpaceManager.getDataSpace()?.close()
      } catch {}
      // Cleanup global shortcuts via DI
      try {
        this.globalShortcutsService.destroy()
      } catch {}
      // Call registered cleanup callbacks
      this.cleanupCallbacks.forEach((cb) => {
        try {
          cb()
        } catch {}
      })
      onWindowAllClosed?.()
    })

    // Mark quit intent before windows close. Final cleanup waits until the quit
    // is committed so a pending-file save failure can still keep Eidos open.
    app.on("before-quit", () => {
      this.forceQuit = true
    })
    app.on("will-quit", () => {
      onBeforeQuit?.()
    })
  }

  /**
   * Register IPC handlers for app lifecycle
   */
  registerIpcHandlers(): void {
    // Register app-lifecycle handlers
    ipcMain.handle("app-lifecycle:reloadApp", async () => {
      return this.windowService.reloadMainWindow()
    })

    ipcMain.handle("app-lifecycle:quitApp", async () => {
      this.forceQuit = true
      app.quit()
    })
  }

  /**
   * Check for available updates
   */
  checkForUpdates(): void {
    this.updaterService.checkForUpdatesManually()
  }

  /**
   * Quit and install updates
   */
  quitAndInstall(): void {
    this.forceQuit = true
    this.updaterService.quitAndInstall()
  }
}
