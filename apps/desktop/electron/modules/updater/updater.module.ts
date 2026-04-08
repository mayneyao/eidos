/**
 * Updater Module - Auto-update and app lifecycle management
 *
 * Provides:
 * - UpdaterService: Auto-update functionality via electron-updater
 * - AppLifecycleService: IPC handlers for app lifecycle operations
 */

import { Module } from "../../common/di"
import { UpdaterService } from "./updater.service"
import { AppLifecycleService } from "./app-lifecycle.service"

@Module({
  providers: [UpdaterService, AppLifecycleService],
  exports: [UpdaterService, AppLifecycleService],
})
export class UpdaterModule {}

export { UpdaterService } from "./updater.service"
export { AppLifecycleService } from "./app-lifecycle.service"
