import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import {
  getCliBinaryPath,
  installCli,
  isCliInstalled,
  uninstallCli,
} from "./cli-installer"

/**
 * CLI Service - Manages CLI installation and status
 */
@IpcService("cli")
export class CliService extends IpcServiceBase {
  /**
   * Check if CLI is installed
   */
  async isInstalled(): Promise<boolean> {
    return isCliInstalled()
  }

  /**
   * Install the CLI
   */
  async install(): Promise<{ success: boolean; message: string }> {
    return installCli()
  }

  /**
   * Uninstall the CLI
   */
  async uninstall(): Promise<{ success: boolean; message: string }> {
    return uninstallCli()
  }

  /**
   * Get the CLI binary path
   */
  async getPath(): Promise<string | null> {
    return getCliBinaryPath()
  }
}

// Export singleton instance
export const cliService = new CliService()
