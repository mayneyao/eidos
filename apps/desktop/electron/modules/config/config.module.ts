/**
 * Config Module - Configuration management module
 */

import { Module } from "../../common/di"
import { ConfigService } from "./config.service"
import { ConfigManager } from "./config-manager"

@Module({
  providers: [ConfigService, ConfigManager],
  exports: [ConfigService, ConfigManager],
})
export class ConfigModule {}

// Re-export for convenience
export { ConfigService } from "./config.service"
export { ConfigManager, type AppConfig } from "./config-manager"
