/**
 * Config Manager - DI-compatible version
 *
 * This is the DI-compatible version of ConfigManager.
 * The singleton instance is still exported for backward compatibility.
 */

import { app } from "electron"
import fs from "fs"
import os from "os"
import path from "path"
import { EventEmitter } from "events"
import type { AIFormValues } from "@/packages/ai/config"
import type { CustomTheme } from "@/apps/web-app/store/theme-store"
import { Injectable, container } from "../../common/di"

// Account configuration (eidos.space only)
export interface AccountConfig {
  user?: any // eidos.space user info
}

// Search engine configuration
export interface SearchEngineConfig {
  id: string
  name: string
  url: string
  shortcut?: string // e.g., "google.com", "bing.com"
}

export interface BrowserConfig {
  // Default search engine ID
  defaultSearchEngine: string
  // Whether to open links in built-in browser
  openLinksInBuiltInBrowser: boolean
  // Custom search engines (user-defined)
  customSearchEngines: SearchEngineConfig[]
  // Whether to enable RawData module
  enableRawData: boolean
}

export interface AppConfig {
  // the folder where the data is stored (deprecated, use space registry instead)
  dataFolder?: string
  ai: AIFormValues
  // Security configuration
  security: {
    webSecurity: boolean
    crossOriginDomains: string[]
  }
  // Auto-update configuration
  autoUpdate: {
    enabled: boolean
    channel: "stable" | "beta"
  }
  theme: {
    currentThemeName: string
    customThemes: CustomTheme[]
  }
  // Last opened workspace ID
  lastOpenedSpace?: string
  // User info (legacy, kept for backward compatibility)
  user?: any
  // Account configuration (eidos.space login)
  account?: AccountConfig
  // Persisted window state for desktop shell
  windowState?: {
    width: number
    height: number
    x?: number
    y?: number
    isMaximized?: boolean
  }
  // Browser configuration
  browser: BrowserConfig
}

const emptyConfig: AppConfig = {
  dataFolder: undefined,
  ai: {
    localModels: [],
    llmProviders: [],
    autoLoadEmbeddingModel: false,
    embeddingModel: "",
    translationModel: "",
    codingModel: "",
    agentNotificationSound: true,
    agentPermissionBypass: false,
  },
  security: {
    webSecurity: true,
    crossOriginDomains: [],
  },
  autoUpdate: {
    enabled: true,
    channel: "stable" as const,
  },
  theme: {
    currentThemeName: "Default",
    customThemes: [],
  },
  lastOpenedSpace: undefined,
  user: undefined,
  account: undefined,
  windowState: undefined,
  browser: {
    defaultSearchEngine: "google",
    openLinksInBuiltInBrowser: false,
    customSearchEngines: [],
    enableRawData: false,
  },
}

@Injectable()
export class ConfigManager extends EventEmitter {
  private configPath: string
  private config: AppConfig
  private isGlobalConfig: boolean

  constructor() {
    super()

    // Determine config path
    const globalConfigPath = path.join(os.homedir(), ".eidos", "config.json")
    if (fs.existsSync(globalConfigPath)) {
      this.configPath = globalConfigPath
      this.isGlobalConfig = true
    } else {
      const userDataPath = app.getPath("userData")
      this.configPath = path.join(userDataPath, "config.json")
      this.isGlobalConfig = false
    }

    this.config = this.loadConfig()
    this.ensureDefaultAIConfig()
    this.migrateLegacyConfig()
  }

  private loadConfig(): AppConfig {
    let loadedConfig = JSON.parse(JSON.stringify(emptyConfig))
    if (fs.existsSync(this.configPath)) {
      try {
        const rawData = fs.readFileSync(this.configPath, "utf-8")
        const parsedData = JSON.parse(rawData)
        loadedConfig = {
          ...loadedConfig,
          ...parsedData,
          account: {
            ...(loadedConfig.account || {}),
            ...(parsedData.account || {}),
          },
        }
      } catch (error) {
        console.error("Error loading config:", this.configPath, error)
        loadedConfig = JSON.parse(JSON.stringify(emptyConfig))
      }
    }
    return loadedConfig
  }

  private ensureDefaultAIConfig(): void {
    if (typeof this.config.ai !== "object" || this.config.ai === null) {
      this.config.ai = JSON.parse(JSON.stringify(emptyConfig.ai))
      this.saveConfig()
    }
  }

  private migrateLegacyConfig(): void {
    let needsSave = false

    if (this.config.user !== undefined && this.config.account === undefined) {
      this.config.account = { user: this.config.user }
      needsSave = true
    }

    if (this.config.account && "provider" in this.config.account) {
      delete (this.config.account as any).provider
      needsSave = true
    }

    if ("sync" in this.config) {
      delete (this.config as AppConfig & { sync?: unknown }).sync
      needsSave = true
    }

    // Migrate autoUpdate config to include channel
    if (!this.config.autoUpdate) {
      this.config.autoUpdate = JSON.parse(
        JSON.stringify(emptyConfig.autoUpdate)
      )
      needsSave = true
    } else if (!this.config.autoUpdate.channel) {
      this.config.autoUpdate.channel = emptyConfig.autoUpdate.channel
      needsSave = true
    }

    if (needsSave) {
      this.saveConfig()
    }
  }

  private saveConfig(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true })
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        "utf-8"
      )
    } catch (error) {
      console.error("Error saving config:", this.configPath, error)
    }
  }

  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key]
  }

  public set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    const oldValue = this.config[key]
    if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
      this.config[key] = value
      this.saveConfig()
      this.emit("configChanged", { key, oldValue, newValue: value })
    }
  }

  public isAutoUpdateEnabled(): boolean {
    return this.config.autoUpdate?.enabled ?? emptyConfig.autoUpdate.enabled
  }

  public setAutoUpdateEnabled(enabled: boolean): void {
    const oldValue = this.config.autoUpdate.enabled
    if (oldValue !== enabled) {
      this.config.autoUpdate.enabled = enabled
      this.saveConfig()
      this.emit("configChanged", {
        key: "autoUpdate.enabled",
        oldValue,
        newValue: enabled,
      })
    }
  }

  public getUpdateChannel(): "stable" | "beta" {
    return this.config.autoUpdate?.channel ?? emptyConfig.autoUpdate.channel
  }

  public setUpdateChannel(channel: "stable" | "beta"): void {
    const oldValue = this.config.autoUpdate.channel
    if (oldValue !== channel) {
      this.config.autoUpdate.channel = channel
      this.saveConfig()
      this.emit("configChanged", {
        key: "autoUpdate.channel",
        oldValue,
        newValue: channel,
      })
    }
  }

  public getLastOpenedSpace(): string | undefined {
    return this.config.lastOpenedSpace
  }

  public setLastOpenedSpace(spaceId: string | undefined): void {
    const oldValue = this.config.lastOpenedSpace
    if (oldValue !== spaceId) {
      this.config.lastOpenedSpace = spaceId
      this.saveConfig()
      this.emit("configChanged", {
        key: "lastOpenedSpace",
        oldValue,
        newValue: spaceId,
      })
    }
  }

  public getUser(): any {
    return this.config.user
  }

  public setUser(user: any): void {
    const oldValue = this.config.user
    if (JSON.stringify(oldValue) !== JSON.stringify(user)) {
      this.config.user = user
      this.saveConfig()
      this.emit("configChanged", { key: "user", oldValue, newValue: user })
    }
  }

  public getAccountUser(): any {
    return this.config.account?.user
  }

  public setAccountUser(user: any): void {
    if (!this.config.account) {
      this.config.account = { user: undefined }
    }
    const oldValue = this.config.account.user
    if (JSON.stringify(oldValue) !== JSON.stringify(user)) {
      this.config.account.user = user
      this.saveConfig()
      this.emit("configChanged", {
        key: "account.user",
        oldValue,
        newValue: user,
      })
    }
  }

  public getAccountConfig(): AccountConfig | undefined {
    return this.config.account
  }

  public setAccountConfig(config: AccountConfig | undefined): void {
    const oldValue = this.config.account
    if (JSON.stringify(oldValue) !== JSON.stringify(config)) {
      this.config.account = config
      this.saveConfig()
      this.emit("configChanged", { key: "account", oldValue, newValue: config })
    }
  }
}

// Backward compatibility: singleton instance
let configManagerInstance: ConfigManager | null = null

/**
 * Get the ConfigManager instance.
 * If DI container is initialized and has ConfigManager bound, returns the DI instance.
 * Otherwise, falls back to a singleton instance for backward compatibility.
 */
export function getConfigManager(): ConfigManager {
  // Try to get from DI container first (preferred)
  try {
    if (container.isBound(ConfigManager)) {
      return container.get(ConfigManager)
    }
  } catch {
    // DI container not ready, fall back to singleton
  }

  // Fallback: create singleton instance
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager()
  }
  return configManagerInstance
}
