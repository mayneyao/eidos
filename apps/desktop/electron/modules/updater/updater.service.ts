/**
 * Updater Service - Auto-update functionality using electron-updater
 */

import { Injectable, Inject } from "../../common/di"
import { autoUpdater } from "electron-updater"
import type { BrowserWindow } from "electron"
import { MainWindowProvider } from "../space-management/space-management.module"
import { ConfigManager } from "../config/config.module"
import { LoggerService } from "../logger/logger.module"

@Injectable()
export class UpdaterService {
  private mainWindow: BrowserWindow | null = null

  constructor(
    @Inject(MainWindowProvider) private windowProvider: MainWindowProvider,
    @Inject(ConfigManager) private configManager: ConfigManager,
    @Inject(LoggerService) private logger: LoggerService
  ) {
    this.logger.setPrefix("Updater")
    this.setupAutoUpdater()
  }

  /**
   * Initialize with window (called after window is created)
   */
  initialize(): void {
    this.mainWindow = this.windowProvider.getWindow()
  }

  private setupAutoUpdater() {
    autoUpdater.logger = {
      info: (message: string) => this.logger.info(message),
      warn: (message: string) => this.logger.warn(message),
      error: (message: string) => this.logger.error(message),
      debug: (message: string) => this.logger.debug(message),
    } as any

    autoUpdater.on("checking-for-update", () => {
      this.logger.info("Checking for update...")
      this.sendStatusToWindow("checking")
    })

    autoUpdater.on("update-available", (info) => {
      this.logger.info("Update available.", info)
      this.sendStatusToWindow("available", info)
    })

    autoUpdater.on("update-not-available", (info) => {
      this.logger.info("Update not available.", info)
      this.sendStatusToWindow("not-available", info)
    })

    autoUpdater.on("error", (err) => {
      this.logger.error("Error in auto-updater.", err)
      this.sendStatusToWindow("error", err)
    })

    autoUpdater.on("download-progress", (progressObj) => {
      const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`
      this.logger.info(logMessage)
      this.sendStatusToWindow("progress", progressObj)
    })

    autoUpdater.on("update-downloaded", (info) => {
      this.logger.info("Update downloaded", info)
      this.sendStatusToWindow("downloaded", info)
      this.notifyUpdateReady(info)
    })
  }

  private sendStatusToWindow(status: string, data?: any) {
    this.mainWindow?.webContents.send("update-status", status, data)
  }

  private notifyUpdateReady(info: any) {
    this.mainWindow?.webContents.send("update-ready", info)
  }

  private applyUpdateChannel(): void {
    const channel = this.configManager.getUpdateChannel()
    autoUpdater.channel = channel === "beta" ? "beta" : "latest"
    // electron-updater's channel setter only sets allowDowngrade, not allowPrerelease.
    // Without this, a stable-version app switching to beta channel will never find
    // prereleases — it falls into the else branch and calls /releases/latest (stable only).
    if (channel === "beta") {
      autoUpdater.allowPrerelease = true
    }
    this.logger.info(`Update channel set to: ${autoUpdater.channel}`)
  }

  /**
   * Check for updates on startup (respects auto-update setting)
   */
  checkForUpdates(): void {
    const isAutoUpdateEnabled = this.configManager.isAutoUpdateEnabled()

    if (isAutoUpdateEnabled) {
      this.logger.info("Auto-update is enabled, checking for updates...")
      this.applyUpdateChannel()
      autoUpdater.checkForUpdatesAndNotify()
    } else {
      this.logger.info("Auto-update is disabled, skipping update check.")
    }
  }

  /**
   * Check for updates manually (ignores auto-update setting)
   */
  checkForUpdatesManually(): void {
    this.logger.info("Manual update check requested, checking for updates...")
    this.applyUpdateChannel()
    this.sendStatusToWindow("checking")
    autoUpdater.checkForUpdatesAndNotify()
  }

  /**
   * Quit and install updates
   */
  quitAndInstall(): void {
    autoUpdater.quitAndInstall()
  }
}
