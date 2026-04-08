/**
 * Data-Space Module - SQLite database operations and sync
 *
 * This module provides:
 * - DataSpace lifecycle management
 * - Process pool for worker processes
 * - IPC handlers for database operations
 * - Relay message operations
 *
 * Note: This module has no imports to avoid circular dependencies.
 * Dependencies are resolved at runtime using helper functions.
 */

import { Module } from "../../common/di"
import { ConfigModule } from "../config/config.module"
import { LoggerModule } from "../logger/logger.module"
import { DataSpaceManager } from "./data-space-manager.service"
import { DataSpaceProcessPool } from "./data-space-process-pool.service"
import { DataSpaceIpcService } from "./data-space-ipc.service"
import { RelayService } from "./relay.service"

@Module({
  imports: [ConfigModule, LoggerModule],
  providers: [
    DataSpaceProcessPool,
    DataSpaceManager,
    DataSpaceIpcService,
    RelayService,
  ],
  exports: [DataSpaceManager, DataSpaceProcessPool, RelayService],
})
export class DataSpaceModule {}

// Re-exports for convenience
export { DataSpaceManager } from "./data-space-manager.service"
export { DataSpaceProcessPool } from "./data-space-process-pool.service"
export { DataSpaceIpcService } from "./data-space-ipc.service"
export { RelayService } from "./relay.service"
