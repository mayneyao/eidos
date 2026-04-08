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
 * - WindowService: For accessing main window (via lazy injection)
 */

import { Module } from "../../common/di"
import { OpenDataService } from "./opendata.service"

@Module({
  providers: [OpenDataService],
  exports: [OpenDataService],
})
export class OpenDataModule {}

export { OpenDataService } from "./opendata.service"
