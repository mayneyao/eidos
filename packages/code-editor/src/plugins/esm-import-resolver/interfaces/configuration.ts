import type { PluginConfig } from './plugin'

/**
 * Configuration manager interface
 */
export interface ConfigurationManager {
  /**
   * Get current configuration
   */
  getConfig(): PluginConfig
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<PluginConfig>): void
  
  /**
   * Reset configuration to defaults
   */
  resetConfig(): void
  
  /**
   * Validate configuration
   */
  validateConfig(config: Partial<PluginConfig>): ConfigValidationResult
  
  /**
   * Load configuration from storage
   */
  loadConfig(): Promise<PluginConfig>
  
  /**
   * Save configuration to storage
   */
  saveConfig(config: PluginConfig): Promise<void>
  
  /**
   * Subscribe to configuration changes
   */
  onConfigChange(callback: ConfigChangeCallback): () => void
  
  /**
   * Get default configuration
   */
  getDefaultConfig(): PluginConfig
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /** Whether configuration is valid */
  valid: boolean
  
  /** Validation errors */
  errors: ConfigValidationError[]
  
  /** Validation warnings */
  warnings: ConfigValidationWarning[]
  
  /** Normalized configuration */
  normalizedConfig?: PluginConfig
}

/**
 * Configuration validation error
 */
export interface ConfigValidationError {
  /** Field path */
  field: string
  
  /** Error message */
  message: string
  
  /** Error code */
  code: string
  
  /** Current value */
  value: any
  
  /** Expected value or type */
  expected?: string
}

/**
 * Configuration validation warning
 */
export interface ConfigValidationWarning {
  /** Field path */
  field: string
  
  /** Warning message */
  message: string
  
  /** Warning code */
  code: string
  
  /** Current value */
  value: any
  
  /** Suggested value */
  suggested?: any
}

/**
 * Configuration change callback
 */
export type ConfigChangeCallback = (
  newConfig: PluginConfig,
  oldConfig: PluginConfig,
  changedFields: string[]
) => void

/**
 * Configuration storage interface
 */
export interface ConfigStorage {
  /**
   * Get configuration from storage
   */
  get(key: string): Promise<any>
  
  /**
   * Set configuration in storage
   */
  set(key: string, value: any): Promise<void>
  
  /**
   * Remove configuration from storage
   */
  remove(key: string): Promise<void>
  
  /**
   * Clear all configuration
   */
  clear(): Promise<void>
  
  /**
   * Check if key exists in storage
   */
  has(key: string): Promise<boolean>
}

/**
 * Configuration schema for validation
 */
export interface ConfigSchema {
  /** Schema version */
  version: string
  
  /** Field definitions */
  fields: Record<string, ConfigFieldSchema>
  
  /** Required fields */
  required: string[]
  
  /** Default values */
  defaults: Partial<PluginConfig>
}

/**
 * Configuration field schema
 */
export interface ConfigFieldSchema {
  /** Field type */
  type: 'boolean' | 'string' | 'number' | 'array' | 'object'
  
  /** Field description */
  description: string
  
  /** Default value */
  default?: any
  
  /** Minimum value (for numbers) */
  min?: number
  
  /** Maximum value (for numbers) */
  max?: number
  
  /** Allowed values (enum) */
  enum?: any[]
  
  /** Pattern for string validation */
  pattern?: RegExp
  
  /** Array item type */
  items?: ConfigFieldSchema
  
  /** Object properties */
  properties?: Record<string, ConfigFieldSchema>
  
  /** Whether field is required */
  required?: boolean
  
  /** Custom validation function */
  validate?: (value: any) => string | null
}

/**
 * Configuration presets
 */
export interface ConfigPreset {
  /** Preset name */
  name: string
  
  /** Preset description */
  description: string
  
  /** Preset configuration */
  config: Partial<PluginConfig>
  
  /** Preset tags */
  tags: string[]
  
  /** Whether preset is built-in */
  builtin: boolean
}

/**
 * Built-in configuration presets
 */
export enum ConfigPresetType {
  /** Default configuration */
  DEFAULT = 'default',
  
  /** Performance optimized */
  PERFORMANCE = 'performance',
  
  /** Development mode */
  DEVELOPMENT = 'development',
  
  /** Production mode */
  PRODUCTION = 'production',
  
  /** Minimal configuration */
  MINIMAL = 'minimal',
  
  /** Full features enabled */
  FULL = 'full'
}

/**
 * Configuration migration interface
 */
export interface ConfigMigration {
  /** Migration version */
  version: string
  
  /** Source version */
  from: string
  
  /** Target version */
  to: string
  
  /** Migration function */
  migrate: (oldConfig: any) => PluginConfig
  
  /** Migration description */
  description: string
}