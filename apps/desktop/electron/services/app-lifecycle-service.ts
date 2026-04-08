import { app } from "electron"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import type { AppUpdater } from "./updater"

interface AppLifecycleOptions {
  appUpdater: AppUpdater
  onReloadApp: () => void
  onQuitApp: () => void
}

/**
 * App Lifecycle Service - Manages app lifecycle operations
 * Handles updates, reloads, and quitting
 */
@IpcService("app-lifecycle")
export class AppLifecycleService extends IpcServiceBase {
  private appUpdater: AppUpdater
  private onReloadApp: () => void
  private onQuitApp: () => void

  constructor(options: AppLifecycleOptions) {
    super()
    this.appUpdater = options.appUpdater
    this.onReloadApp = options.onReloadApp
    this.onQuitApp = options.onQuitApp
  }

  /**
   * Check for available updates
   */
  checkForUpdates(): void {
    this.appUpdater.checkForUpdatesManually()
  }

  /**
   * Quit and install updates
   */
  quitAndInstall(): void {
    this.appUpdater.quitAndInstall()
  }

  /**
   * Reload the application
   */
  reloadApp(): void {
    this.onReloadApp()
  }

  /**
   * Quit the application
   */
  quitApp(): void {
    this.onQuitApp()
  }
}
