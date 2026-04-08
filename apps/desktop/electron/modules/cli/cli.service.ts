/**
 * CLI Service - Manages CLI installation and status
 */

import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject } from "../../common/di"
import { CliInstaller } from "./cli-installer"

/**
 * CLI Service - Provides CLI management via IPC
 *
 * IPC Channels:
 * - cli:isInstalled: Check if CLI is installed
 * - cli:install: Install CLI to PATH
 * - cli:uninstall: Uninstall CLI from PATH
 * - cli:getPath: Get CLI binary path
 */
@IpcInjectable("cli")
export class CliService extends IpcServiceBase {
  constructor(@Inject(CliInstaller) private cliInstaller: CliInstaller) {
    super()
  }

  /**
   * Check if CLI is installed
   * IPC: cli:isInstalled
   */
  async isInstalled(): Promise<boolean> {
    return this.cliInstaller.isCliInstalled()
  }

  /**
   * Install the CLI
   * IPC: cli:install
   */
  async install(): Promise<{ success: boolean; message: string }> {
    return this.cliInstaller.installCli()
  }

  /**
   * Uninstall the CLI
   * IPC: cli:uninstall
   */
  async uninstall(): Promise<{ success: boolean; message: string }> {
    return this.cliInstaller.uninstallCli()
  }

  /**
   * Get the CLI binary path
   * IPC: cli:getPath
   */
  async getPath(): Promise<string | null> {
    return this.cliInstaller.getCliBinaryPath()
  }
}
