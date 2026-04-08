/**
 * Logger Module - Global logging service module
 *
 * This module provides LoggerService as a global singleton.
 * Import it in AppModule (root) to make LoggerService available everywhere.
 *
 * In NestJS-style DI, "global" modules are achieved by:
 * 1. Providing the service in the root module
 * 2. Or using @Global() decorator (NestJS-specific)
 *
 * With Inversify, we use defaultScope: "Singleton" in container config,
 * so LoggerService is automatically a singleton across the app.
 */

import { Module } from "../../common/di"
import { LoggerService, LOGGER_TOKEN } from "./logger.service"

/**
 * Logger Module
 *
 * Provides LoggerService as a global singleton.
 * Import in AppModule to make it available throughout the app.
 */
@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}

// Re-exports
export { LoggerService, LOGGER_TOKEN, type Logger } from "./logger.service"
