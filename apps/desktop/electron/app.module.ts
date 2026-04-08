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
    ExampleModule,
  ],
  providers: [],
  exports: [],
})
export class AppModule {}
