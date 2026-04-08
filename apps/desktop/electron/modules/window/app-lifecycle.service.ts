/**
 * App Lifecycle Service - Manages app lifecycle operations
 */

import { app, ipcMain } from "electron"

import { Injectable, Inject, IpcInjectable } from "../../common/di"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { UpdaterService } from "../updater/updater.service"
import { TrayService } from "./tray.service"
import { DataSpaceManager } from "../data-space"
import { OpenDataService } from "../opendata"
import { TerminalService } from "../terminal/terminal.module"
import { GlobalShortcutsService } from "./global-shortcuts.service"
import { WindowService } from "./window.service"

@IpcInjectable("app-lifecycle")
export class AppLifecycleService extends IpcServiceBase {
  private forceQuit = false

  constructor(
    @Inject(UpdaterService) private updaterService: UpdaterService,
    @Inject(TrayService) private trayService: TrayService,
    @Inject(DataSpaceManager) private dataSpaceManager: DataSpaceManager,
    @Inject(OpenDataService) private openDataService: OpenDataService,
    @Inject(TerminalService) private terminalService: TerminalService,
    @Inject(GlobalShortcutsService)
    private globalShortcutsService: GlobalShortcutsService,
    @Inject(WindowService) private windowService: WindowService
  ) {
    super()
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
  setupLifecycleHandlers(): void {
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
      // Cleanup OpenDataService via DI
      try {
        this.openDataService.closeAll()
      } catch {}
      // Cleanup DI terminal service
      try {
        this.terminalService.cleanup()
      } catch {}
    })

    // Before quit - final cleanup
    app.on("before-quit", () => {
      // Cleanup OpenDataService via DI
      try {
        this.openDataService.closeAll()
      } catch {}
      // Cleanup DI terminal service
      try {
        this.terminalService.cleanup()
      } catch {}
      this.forceQuit = true
    })
  }

  /**
   * Register IPC handlers for app lifecycle
   */
  registerIpcHandlers(): void {
    // Register app-lifecycle handlers
    ipcMain.handle("app-lifecycle:reloadApp", async () => {
      app.relaunch()
      this.windowService.getMainWindow()?.reload()
    })

    ipcMain.handle("app-lifecycle:quitApp", async () => {
      this.forceQuit = true
      // Destroy tray via DI
      try {
        this.trayService.destroyTray()
      } catch {}
      // Close dataspace via DI if available
      try {
        this.dataSpaceManager.getDataSpace()?.close()
      } catch {}
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
    this.updaterService.quitAndInstall()
  }
}
