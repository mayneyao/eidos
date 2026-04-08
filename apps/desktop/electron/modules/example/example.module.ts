/**
 * Example Module - A complete example of NestJS-style DI module
 *
 * This module demonstrates:
 * - Service with dependency injection
 * - IPC service exposure
 * - Cross-module dependencies
 */

import { Module } from "../../common/di"
import { ConfigModule } from "../config/config.module"
import { FileSystemModule } from "../file-system/file-system.module"
import { ExampleService } from "./example.service"

/**
 * Example Module
 *
 * Imports ConfigModule and FileSystemModule as dependencies,
 * provides ExampleService which uses both.
 */
@Module({
  imports: [ConfigModule, FileSystemModule],
  providers: [ExampleService],
  exports: [ExampleService],
})
export class ExampleModule {}

export { ExampleService } from "./example.service"
