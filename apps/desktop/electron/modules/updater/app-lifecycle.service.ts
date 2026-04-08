/**
 * App Lifecycle Service - Manages app lifecycle operations via IPC
 */

import { Injectable, Inject } from "../../common/di"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import { UpdaterService } from "./updater.service"

@Injectable()
@IpcService("app-lifecycle")
export class AppLifecycleService extends IpcServiceBase {
  constructor(@Inject(UpdaterService) private updaterService: UpdaterService) {
    super()
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

  /**
   * Reload the application
   */
  reloadApp(): void {
    // This will be handled by main process event listener
    // Keeping for IPC compatibility
  }

  /**
   * Quit the application
   */
  quitApp(): void {
    // This will be handled by main process event listener
    // Keeping for IPC compatibility
  }
}
