/**
 * OpenData Module - Open data management and adapter execution
 *
 * This module provides:
 * - OpenDataManager lifecycle management
 * - Adapter loading and execution
 * - Data store management
 * - Raw data storage
 *
 * Dependencies:
 * - WindowModule: For accessing main window
 */

import { Module } from "../../common/di"
import { WindowModule } from "../window/window.module"
import { OpenDataService } from "./opendata.service"

@Module({
  imports: [WindowModule],
  providers: [OpenDataService],
  exports: [OpenDataService],
})
export class OpenDataModule {}

export { OpenDataService } from "./opendata.service"
