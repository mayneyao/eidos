import path from "path"
import { app } from "electron"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import { getConfigManager } from "./config-manager"

/**
 * Config Service - Manages application configuration
 * Handles user settings, data folder, and config file paths
 */
@IpcService("config")
export class ConfigService extends IpcServiceBase {
  /**
   * Get the application data folder path
   */
  getAppDataFolder(): string {
    return getConfigManager().get("dataFolder")
  }

  /**
   * Get a config value by key
   */
  getConfig(key: string): any {
    return getConfigManager().get(key)
  }

  /**
   * Set a config value
   */
  setConfig(key: string, value: any): void {
    getConfigManager().set(key, value)
  }

  /**
   * Get AI configuration
   */
  getAiConfig(): any {
    return getConfigManager().get("ai")
  }

  /**
   * Get the path to user config file
   */
  getUserConfigPath(): string {
    return path.join(app.getPath("userData"), "config.json")
  }
}

// Export singleton instance
export const configService = new ConfigService()
