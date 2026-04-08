/**
 * App Module - Root module for Eidos Desktop
 *
 * This is the root module that bootstraps the entire DI-based application.
 * It imports all feature modules and provides global services.
 */

import { Module } from "./common/di"
import { ConfigModule } from "./modules/config/config.module"
import { FileSystemModule } from "./modules/file-system/file-system.module"
import { SyncModule } from "./modules/sync/sync.module"
import { LicenseModule } from "./modules/license/license.module"
import { ExampleModule } from "./modules/example/example.module"

/**
 * App Module - Root module
 *
 * Imports:
 * - ConfigModule: Configuration management
 * - FileSystemModule: File operations
 * - SyncModule: Data synchronization
 * - LicenseModule: License management
 * - ExampleModule: DI demonstration (can be removed)
 */
@Module({
  imports: [
    ConfigModule,
    FileSystemModule,
    SyncModule,
    LicenseModule,
    ExampleModule,
  ],
  providers: [],
  exports: [],
})
export class AppModule {}
