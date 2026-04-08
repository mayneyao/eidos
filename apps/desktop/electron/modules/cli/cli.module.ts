/**
 * CLI Module - CLI installation and management
 */

import { Module } from "../../common/di"
import { CliService } from "./cli.service"
import { CliInstaller } from "./cli-installer"

/**
 * CLI Module
 *
 * Provides CLI installation, uninstallation, and status checking.
 * No external dependencies - completely self-contained.
 */
@Module({
  providers: [CliService, CliInstaller],
  exports: [CliService, CliInstaller],
})
export class CliModule {}

export { CliService } from "./cli.service"
export { CliInstaller } from "./cli-installer"
