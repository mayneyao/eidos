/**
 * Updater Module - Auto-update management
 *
 * Provides:
 * - UpdaterService: Auto-update functionality via electron-updater
 */

import { Module } from "../../common/di"
import { UpdaterService } from "./updater.service"

@Module({
  providers: [UpdaterService],
  exports: [UpdaterService],
})
export class UpdaterModule {}

export { UpdaterService } from "./updater.service"
