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

@IpcInjectable("app-lifecycle")
export class AppLifecycleService extends IpcServiceBase {
  constructor(
    @Inject(UpdaterService) private updaterService: UpdaterService,
    @Inject(TrayService) private trayService: TrayService,
    @Inject(DataSpaceManager) private dataSpaceManager: DataSpaceManager,
    @Inject(OpenDataService) private openDataService: OpenDataService,
    @Inject(TerminalService) private terminalService: TerminalService,
    @Inject(GlobalShortcutsService)
    private globalShortcutsService: GlobalShortcutsService
  ) {
    super()
  }

  /**
   * Set up app lifecycle event handlers
   */
  setupLifecycleHandlers(
    onBeforeQuit: () => void,
    onWindowAllClosed: () => void
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
      // Cleanup OpenDataService via DI
      try {
        this.openDataService.closeAll()
      } catch {}
      // Cleanup DI terminal service
      try {
        this.terminalService.cleanup()
      } catch {}
      onWindowAllClosed()
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
      onBeforeQuit()
    })
  }

  /**
   * Register IPC handlers that need access to main process state
   */
  registerIpcHandlers(
    getForceQuit: () => boolean,
    setForceQuit: (value: boolean) => void,
    getMainWindow: () => Electron.BrowserWindow | null
  ): void {
    // Register app-lifecycle handlers
    ipcMain.handle("app-lifecycle:reloadApp", async () => {
      app.relaunch()
      getMainWindow()?.reload()
    })

    ipcMain.handle("app-lifecycle:quitApp", async () => {
      setForceQuit(true)
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
