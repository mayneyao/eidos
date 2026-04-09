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
import { AdapterLoaderService } from "./adapters/adapter-loader.service"
import { BrowserExplorerService } from "./explorer/browser-explorer.service"
import { BrowserRunnerService } from "./runner/browser-runner.service"
import { DataPersisterService } from "./persistence/data-persister.service"
import { DataStoreService } from "./store/datastore.service"
import { OpenDataService } from "./opendata.service"

@Module({
  providers: [
    DataStoreService,
    DataPersisterService,
    AdapterLoaderService,
    BrowserRunnerService,
    BrowserExplorerService,
    OpenDataService,
  ],
  exports: [OpenDataService],
})
export class OpenDataModule {}

export { OpenDataService } from "./opendata.service"
export { AdapterLoaderService } from "./adapters/adapter-loader.service"
export { BrowserRunnerService } from "./runner/browser-runner.service"
export { BrowserExplorerService } from "./explorer/browser-explorer.service"
export { DataPersisterService } from "./persistence/data-persister.service"
export { DataStoreService } from "./store/datastore.service"
