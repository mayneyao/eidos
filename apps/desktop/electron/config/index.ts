import { app } from "electron"
import fs from "fs"
import os from "os"
import path from "path"
import { EventEmitter } from "events"
import type { AIFormValues } from "@/packages/ai/config"
import type { CustomTheme } from "@/apps/web-app/store/theme-store"
import { getSpaceRegistry } from "../space-registry"

// Account configuration (eidos.space only)
export interface AccountConfig {
  user?: any // eidos.space user info
}

// Sync provider configuration (all providers are S3-compatible, including eidos.space)
export interface SyncProviderConfig {
  id: string // Unique identifier (e.g., 'eidos.space', 'my-minio')
  name: string // Display name
  endpoint: string // S3 endpoint URL
  bucketName: string // Bucket name
  region?: string // Optional region
}

// Sync configuration - supports multiple providers like git remotes
export interface SyncConfig {
  // Multiple providers, keyed by provider ID
  providers: Record<string, SyncProviderConfig>
  // Default provider to use when not specified
  defaultProvider?: string
}

export interface AppConfig {
  // the folder where the data is stored (deprecated, use space registry instead)
  dataFolder?: string
  // the api agent config
  apiAgentConfig: {
    url: string
    enabled: boolean
  }
  ai: AIFormValues
  // Security configuration
  security: {
    webSecurity: boolean
    crossOriginDomains: string[]
  }
  // Sync configuration (independent from account)
  sync: SyncConfig
  // Auto-update configuration
  autoUpdate: {
    enabled: boolean
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
}

const emptyConfig: AppConfig = {
  dataFolder: undefined, // Deprecated, use space registry instead
  apiAgentConfig: {
    url: "",
    enabled: false,
  },
  ai: {
    localModels: [],
    llmProviders: [],
    autoLoadEmbeddingModel: false,
    embeddingModel: "",
    translationModel: "",
    codingModel: "",
    version: 0,
  },
  security: {
    webSecurity: true,
    crossOriginDomains: [],
  },
  sync: {
    providers: {},
    defaultProvider: undefined,
  },
  autoUpdate: {
    enabled: true,
  },
  theme: {
    currentThemeName: "Default",
    customThemes: [],
  },
  lastOpenedSpace: undefined,
  user: undefined,
  account: undefined,
  windowState: undefined,
}

export class ConfigManager extends EventEmitter {
  private configPath: string
  private config: AppConfig
  private isGlobalConfig: boolean

  constructor(configPath: string, isGlobalConfig: boolean = false) {
    super()
    this.configPath = configPath
    this.isGlobalConfig = isGlobalConfig
    this.config = this.loadConfig()
    // Ensure AI config has version field for synchronization
    this.ensureDefaultAIConfig()
    // Migrate legacy config to new structure
    this.migrateLegacyConfig()
  }

  private loadConfig(): AppConfig {
    let loadedConfig = JSON.parse(JSON.stringify(emptyConfig)) // Deep clone defaults
    if (fs.existsSync(this.configPath)) {
      try {
        const rawData = fs.readFileSync(this.configPath, "utf-8")
        const parsedData = JSON.parse(rawData)

        // Deep merge ensuring 'sync' and 'account' exists
        loadedConfig = {
          ...loadedConfig, // Start with defaults
          ...parsedData, // Overlay saved config
          sync: {
            // Merge the sync object explicitly
            ...(loadedConfig.sync || {}), // Start with default sync object structure
            ...(parsedData.sync || {}), // Overlay saved sync settings
          },
          account: {
            // Merge the account object explicitly
            ...(loadedConfig.account || {}), // Start with default account object structure
            ...(parsedData.account || {}), // Overlay saved account settings
          },
        }
      } catch (error) {
        console.error(
          "Error loading or parsing config file:",
          this.configPath,
          error
        )
        // Fallback to deep clone of default config if loading/parsing fails
        loadedConfig = JSON.parse(JSON.stringify(emptyConfig))
      }
    }
    return loadedConfig
  }

  // Ensure that the loaded AI config has version field for synchronization
  private ensureDefaultAIConfig(): void {
    let needsSave = false
    // Ensure ai object exists
    if (typeof this.config.ai !== "object" || this.config.ai === null) {
      console.warn("AI config section missing, initializing with defaults.")
      this.config.ai = JSON.parse(JSON.stringify(emptyConfig.ai)) // Deep clone default AI
      needsSave = true
    } else {
      // Ensure version field exists
      if (typeof this.config.ai.version !== "number") {
        console.warn("AI config version missing or invalid, applying default.")
        this.config.ai.version = emptyConfig.ai.version
        needsSave = true
      }
    }
    if (needsSave) {
      this.saveConfig()
    }
  }

  // Migrate legacy config to new structure
  private migrateLegacyConfig(): void {
    let needsSave = false

    // Migrate legacy 'user' to 'account.user' if account doesn't exist
    if (this.config.user !== undefined && this.config.account === undefined) {
      console.log("Migrating legacy 'user' to 'account.user'")
      this.config.account = {
        user: this.config.user,
      }
      // Keep legacy 'user' for backward compatibility
      needsSave = true
    }

    // Remove old 'provider' field from account if exists (new design doesn't have it)
    if (this.config.account && "provider" in this.config.account) {
      console.log("Removing legacy 'provider' from account config")
      delete (this.config.account as any).provider
      needsSave = true
    }

    // Migrate legacy sync config to new multi-provider structure
    if (this.config.sync) {
      const oldSync = this.config.sync as any

      // Check if this is old format (has 'provider' string field)
      if (
        oldSync.provider &&
        typeof oldSync.provider === "string" &&
        !oldSync.providers
      ) {
        console.log(
          "Migrating legacy sync config to new multi-provider structure"
        )

        const providers: Record<string, SyncProviderConfig> = {}
        let defaultProvider: string | undefined

        // Migrate old provider to new structure
        // Note: eidos.space is built-in and not stored in config
        if (oldSync.provider === "eidos.space") {
          // eidos.space is built-in, not stored in config
          // Just set it as default, credentials come from OAuth
          defaultProvider = "eidos.space"
        } else if (oldSync.provider === "custom" && oldSync.customConfig) {
          // Create a default custom provider
          providers["custom"] = {
            id: "custom",
            name: "Custom S3",
            endpoint: oldSync.customConfig.endpoint,
            bucketName: oldSync.customConfig.bucketName,
            region: oldSync.customConfig.region,
          }
          defaultProvider = "custom"
        }

        this.config.sync = {
          providers,
          defaultProvider,
        }
        needsSave = true
      }
    }

    // Ensure sync object exists
    if (!this.config.sync) {
      this.config.sync = JSON.parse(JSON.stringify(emptyConfig.sync))
      needsSave = true
    }

    // Ensure sync.providers exists
    if (!this.config.sync.providers) {
      this.config.sync.providers = {}
      needsSave = true
    }

    if (needsSave) {
      this.saveConfig()
      console.log("Config migration completed")
    }
  }

  private saveConfig(): void {
    try {
      const rawData = JSON.stringify(this.config, null, 2)
      // Ensure directory exists before writing
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true })
      fs.writeFileSync(this.configPath, rawData, "utf-8")
    } catch (error) {
      console.error("Error saving config file:", this.configPath, error)
    }
  }

  // Type-safe getter for top-level keys
  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key]
  }

  // Type-safe setter for top-level keys
  public set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    const oldValue = this.config[key]
    if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
      // Avoid saving if no change
      this.config[key] = value
      this.saveConfig()
      console.log("Config changed:", { key, oldValue, newValue: value })
      this.emit("configChanged", { key, oldValue, newValue: value })
    }
  }

  // Getter for auto-update enabled status
  public isAutoUpdateEnabled(): boolean {
    return this.config.autoUpdate?.enabled ?? emptyConfig.autoUpdate.enabled
  }

  // Setter for auto-update enabled status
  public setAutoUpdateEnabled(enabled: boolean): void {
    const oldValue = this.config.autoUpdate.enabled
    if (oldValue !== enabled) {
      this.config.autoUpdate.enabled = enabled
      this.saveConfig()
      console.log("Auto-update enabled status changed:", {
        oldValue,
        newValue: enabled,
      })
      this.emit("configChanged", {
        key: "autoUpdate.enabled",
        oldValue,
        newValue: enabled,
      })
    }
  }

  // Getter for last opened space
  public getLastOpenedSpace(): string | undefined {
    return this.config.lastOpenedSpace
  }

  // Setter for last opened space
  public setLastOpenedSpace(spaceId: string | undefined): void {
    const oldValue = this.config.lastOpenedSpace
    if (oldValue !== spaceId) {
      this.config.lastOpenedSpace = spaceId
      this.saveConfig()
      console.log("Last opened space changed:", { oldValue, newValue: spaceId })
      this.emit("configChanged", {
        key: "lastOpenedSpace",
        oldValue,
        newValue: spaceId,
      })
    }
  }

  // Getter for user
  public getUser(): any {
    return this.config.user
  }

  // Setter for user
  public setUser(user: any): void {
    const oldValue = this.config.user
    if (JSON.stringify(oldValue) !== JSON.stringify(user)) {
      this.config.user = user
      this.saveConfig()
      console.log("User changed:", { oldValue, newValue: user })
      this.emit("configChanged", { key: "user", oldValue, newValue: user })
    }
  }

  // ==================== Account Configuration (eidos.space only) ====================

  // Getter for account user
  public getAccountUser(): any {
    return this.config.account?.user
  }

  // Setter for account user
  public setAccountUser(user: any): void {
    if (!this.config.account) {
      this.config.account = { user: undefined }
    }
    const oldValue = this.config.account.user
    if (JSON.stringify(oldValue) !== JSON.stringify(user)) {
      this.config.account.user = user
      this.saveConfig()
      console.log("Account user changed:", { oldValue, newValue: user })
      this.emit("configChanged", {
        key: "account.user",
        oldValue,
        newValue: user,
      })
    }
  }

  // Get full account config
  public getAccountConfig(): AccountConfig | undefined {
    return this.config.account
  }

  // Set full account config
  public setAccountConfig(config: AccountConfig | undefined): void {
    const oldValue = this.config.account
    if (JSON.stringify(oldValue) !== JSON.stringify(config)) {
      this.config.account = config
      this.saveConfig()
      console.log("Account config changed:", { oldValue, newValue: config })
      this.emit("configChanged", { key: "account", oldValue, newValue: config })
    }
  }

  // ==================== Sync Configuration (Multi-Provider) ====================

  // Get all configured providers
  public getSyncProviders(): Record<string, SyncProviderConfig> {
    return this.config.sync?.providers ?? {}
  }

  // Get a specific provider by ID
  public getSyncProvider(id: string): SyncProviderConfig | undefined {
    return this.config.sync?.providers?.[id]
  }

  // Add or update a provider
  public setSyncProvider(config: SyncProviderConfig): void {
    if (!this.config.sync) {
      this.config.sync = JSON.parse(JSON.stringify(emptyConfig.sync))
    }
    if (!this.config.sync.providers) {
      this.config.sync.providers = {}
    }

    const oldValue = this.config.sync.providers[config.id]
    this.config.sync.providers[config.id] = config

    // If this is the first provider, set it as default
    if (!this.config.sync.defaultProvider) {
      this.config.sync.defaultProvider = config.id
    }

    this.saveConfig()
    console.log("Sync provider added/updated:", {
      id: config.id,
      oldValue,
      newValue: config,
    })
    this.emit("configChanged", {
      key: `sync.providers.${config.id}`,
      oldValue,
      newValue: config,
    })
  }

  // Remove a provider
  public removeSyncProvider(id: string): boolean {
    if (!this.config.sync?.providers?.[id]) {
      return false
    }

    const oldValue = this.config.sync.providers[id]
    delete this.config.sync.providers[id]

    // If removing default provider, clear default
    if (this.config.sync.defaultProvider === id) {
      const remainingProviders = Object.keys(this.config.sync.providers)
      this.config.sync.defaultProvider = remainingProviders[0]
    }

    this.saveConfig()
    console.log("Sync provider removed:", { id, oldValue })
    this.emit("configChanged", {
      key: `sync.providers.${id}`,
      oldValue,
      newValue: undefined,
    })
    return true
  }

  // Get default provider ID
  public getDefaultSyncProvider(): string | undefined {
    return this.config.sync?.defaultProvider
  }

  // Set default provider
  public setDefaultSyncProvider(id: string): void {
    if (!this.config.sync) {
      this.config.sync = JSON.parse(JSON.stringify(emptyConfig.sync))
    }
    if (!this.config.sync.providers?.[id]) {
      throw new Error(`Provider ${id} does not exist`)
    }

    const oldValue = this.config.sync.defaultProvider
    this.config.sync.defaultProvider = id
    this.saveConfig()
    console.log("Default sync provider changed:", { oldValue, newValue: id })
    this.emit("configChanged", {
      key: "sync.defaultProvider",
      oldValue,
      newValue: id,
    })
  }

  // Get full sync config
  public getSyncConfig(): SyncConfig {
    return this.config.sync ?? JSON.parse(JSON.stringify(emptyConfig.sync))
  }

  // Set full sync config
  public setSyncConfig(config: SyncConfig): void {
    const oldValue = this.config.sync
    if (JSON.stringify(oldValue) !== JSON.stringify(config)) {
      this.config.sync = config
      this.saveConfig()
      console.log("Sync config changed:", { oldValue, newValue: config })
      this.emit("configChanged", { key: "sync", oldValue, newValue: config })
    }
  }
}

let configManagerInstance: ConfigManager | null = null

export function getConfigManager(): ConfigManager {
  if (!configManagerInstance) {
    const globalConfigPath = path.join(os.homedir(), ".eidos", "config.json")
    if (fs.existsSync(globalConfigPath)) {
      configManagerInstance = new ConfigManager(globalConfigPath, true)
    } else {
      const userDataPath = app.getPath("userData")
      const configFilePath = path.join(userDataPath, "config.json")
      configManagerInstance = new ConfigManager(configFilePath, false)
    }
  }
  return configManagerInstance
}
