/**
 * Config Service - IPC service for configuration management
 */

import { app } from "electron"
import path from "path"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject, Injectable } from "../../common/di"
import { ConfigManager } from "./config-manager"
import type { AppConfig } from "./config-manager"

/**
 * Config Service - Manages application configuration via IPC
 */
@IpcInjectable("config")
export class ConfigService extends IpcServiceBase {
  constructor(@Inject(ConfigManager) private configManager: ConfigManager) {
    super()
  }

  /**
   * Get the application data folder path
   */
  getAppDataFolder(): string | undefined {
    return this.configManager.get("dataFolder")
  }

  /**
   * Get a config value by key
   */
  getConfig<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.configManager.get(key)
  }

  /**
   * Set a config value
   */
  setConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.configManager.set(key, value)
  }

  /**
   * Get AI configuration
   */
  getAiConfig(): any {
    return this.configManager.get("ai")
  }

  /**
   * Get the path to user config file
   */
  getUserConfigPath(): string {
    return path.join(app.getPath("userData"), "config.json")
  }
}
