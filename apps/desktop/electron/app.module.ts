/**
 * App Module - Root module for Eidos Desktop
 *
 * This is the root module that bootstraps the entire DI-based application.
 * It imports all feature modules and provides global services.
 */

import { Module } from "./common/di"
import { LoggerModule } from "./modules/logger/logger.module"
import { ConfigModule } from "./modules/config/config.module"
import { FileSystemModule } from "./modules/file-system/file-system.module"
import { SyncModule } from "./modules/sync/sync.module"
import { LicenseModule } from "./modules/license/license.module"
import { NetworkModule } from "./modules/network/network.module"
import { CliModule } from "./modules/cli/cli.module"
import { TerminalModule } from "./modules/terminal/terminal.module"
import { ContextMenuModule } from "./modules/context-menu/context-menu.module"
import { SpaceManagementModule } from "./modules/space-management/space-management.module"
import { DataSpaceModule } from "./modules/data-space"
import { WindowModule } from "./modules/window"
import { RawDataModule } from "./modules/rawdata"
import { ApiServerModule } from "./modules/api-server/api-server.module"
import { UpdaterModule } from "./modules/updater/updater.module"
import { ExampleModule } from "./modules/example/example.module"

/**
 * App Module - Root module
 *
 * Imports:
 * - LoggerModule: Global logging service (must be first)
 * - ConfigModule: Configuration management
 * - FileSystemModule: File operations
 * - SyncModule: Data synchronization
 * - LicenseModule: License management
 * - NetworkModule: HTTP fetch operations
 * - CliModule: CLI installation and management
 * - TerminalModule: Terminal session management
 * - ContextMenuModule: Native context menu display
 * - SpaceManagementModule: Space CRUD and switching
 * - DataSpaceModule: SQLite database operations and sync
 * - WindowModule: BrowserWindow management and related services
 * - RawDataModule: Raw data management and adapter execution
 * - ApiServerModule: HTTP server for API and static files
 * - UpdaterModule: Auto-update and app lifecycle
 * - ExampleModule: DI demonstration (can be removed)
 */
@Module({
  imports: [
    LoggerModule, // Global logger, must be first
    ConfigModule,
    FileSystemModule,
    SyncModule,
    LicenseModule,
    NetworkModule,
    CliModule,
    TerminalModule,
    ContextMenuModule,
    SpaceManagementModule,
    DataSpaceModule,
    WindowModule,
    RawDataModule,
    ApiServerModule,
    UpdaterModule,
    ExampleModule,
  ],
  providers: [],
  exports: [],
})
export class AppModule {}
