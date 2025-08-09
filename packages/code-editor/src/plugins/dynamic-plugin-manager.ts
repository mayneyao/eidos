/**
 * Enhanced Plugin Manager for Code Editor with Dynamic Configuration
 * Uses plugin registry for decoupled plugin management
 */

import type * as monaco from 'monaco-editor'
import type { EditorPlugin } from './base-types'
import { pluginRegistry } from './plugin-registry'

export interface DynamicPluginConfig {
  [pluginId: string]: {
    enabled?: boolean
    [key: string]: any
  }
}

/**
 * Dynamic Plugin Manager that can be reconfigured at runtime
 */
export class DynamicPluginManager {
  private plugins = new Map<string, EditorPlugin>()
  private currentConfig: DynamicPluginConfig = {}
  private initialized = false

  constructor() { }

  /**
   * Update plugin configuration and reinitialize affected plugins
   */
  async updateConfiguration(config: DynamicPluginConfig): Promise<void> {
    console.log('🔄 Updating plugin configuration:', config)

    // Compare with current config to see what changed
    const changes = this.detectConfigChanges(this.currentConfig, config)

    console.log('📋 Configuration changes detected:', {
      toDispose: changes.toDispose,
      toInitialize: changes.toInitialize,
      hasChanges: changes.toDispose.length > 0 || changes.toInitialize.length > 0
    })

    // Skip if no changes needed
    if (changes.toDispose.length === 0 && changes.toInitialize.length === 0) {
      console.log('✅ No plugin configuration changes needed, skipping update')
      return
    }

    // Dispose plugins that are no longer enabled or have changed configuration
    for (const pluginName of changes.toDispose) {
      console.log(`🗑️ Disposing plugin: ${pluginName}`)
      await this.disposePlugin(pluginName)
    }

    // Initialize or reconfigure plugins
    for (const pluginName of changes.toInitialize) {
      console.log(`🔌 Initializing plugin: ${pluginName}`)
      await this.initializePlugin(pluginName, config)
    }

    this.currentConfig = { ...config }
    this.initialized = true
    console.log('✅ Plugin configuration update complete')
  }

  /**
   * Detect what plugins need to be disposed/initialized based on config changes
   */
  private detectConfigChanges(
    oldConfig: DynamicPluginConfig,
    newConfig: DynamicPluginConfig
  ): { toDispose: string[], toInitialize: string[] } {
    const toDispose: string[] = []
    const toInitialize: string[] = []

    // Get all plugin IDs from both configs
    const allPluginIds = new Set([
      ...Object.keys(oldConfig),
      ...Object.keys(newConfig)
    ])

    for (const pluginId of allPluginIds) {
      const oldPluginConfig = oldConfig[pluginId]
      const newPluginConfig = newConfig[pluginId]

      // Check if plugin should be disposed
      if (oldPluginConfig && (!newPluginConfig || newPluginConfig.enabled === false)) {
        toDispose.push(pluginId)
      }
      // Check if plugin should be initialized/reconfigured
      else if (newPluginConfig && newPluginConfig.enabled !== false) {
        if (!oldPluginConfig || !this.deepEqual(oldPluginConfig, newPluginConfig)) {
          // Dispose first if it exists, then initialize with new config
          if (oldPluginConfig) {
            toDispose.push(pluginId)
          }
          toInitialize.push(pluginId)
        }
      }
    }

    return { toDispose, toInitialize }
  }

  /**
   * Deep equality check for plugin configurations
   * More reliable than JSON.stringify for object comparison
   */
  private deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) {
      return true
    }

    if (obj1 == null || obj2 == null) {
      return obj1 === obj2
    }

    if (typeof obj1 !== typeof obj2) {
      return false
    }

    if (typeof obj1 !== 'object') {
      return obj1 === obj2
    }

    // Handle arrays
    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
      return false
    }

    if (Array.isArray(obj1)) {
      if (obj1.length !== obj2.length) {
        return false
      }
      for (let i = 0; i < obj1.length; i++) {
        if (!this.deepEqual(obj1[i], obj2[i])) {
          return false
        }
      }
      return true
    }

    // Handle objects
    const keys1 = Object.keys(obj1)
    const keys2 = Object.keys(obj2)

    if (keys1.length !== keys2.length) {
      return false
    }

    for (const key of keys1) {
      if (!keys2.includes(key)) {
        return false
      }
      if (!this.deepEqual(obj1[key], obj2[key])) {
        return false
      }
    }

    return true
  }

  /**
   * Initialize a specific plugin based on its configuration
   */
  private async initializePlugin(pluginId: string, allConfigs: DynamicPluginConfig): Promise<void> {
    try {
      // Ensure any existing plugin is disposed first
      const existingPlugin = this.plugins.get(pluginId)
      if (existingPlugin) {
        console.log(`🔄 Disposing existing ${pluginId} plugin before reinitializing`)
        existingPlugin.dispose()
        this.plugins.delete(pluginId)
      }

      // Get plugin config
      const pluginConfig = allConfigs[pluginId]
      if (!pluginConfig || pluginConfig.enabled === false) {
        return
      }

      // Create plugin using registry
      const plugin = pluginRegistry.createPlugin(pluginId, pluginConfig)
      if (!plugin) {
        console.error(`❌ Failed to create plugin: ${pluginId} (not registered?)`)
        return
      }

      // Initialize plugin
      await plugin.initialize()
      this.plugins.set(pluginId, plugin)

      const pluginInfo = pluginRegistry.getPluginInfo(pluginId)
      console.log(`✅ ${pluginInfo?.displayName || pluginId} plugin initialized`)
    } catch (error) {
      console.error(`❌ Failed to initialize ${pluginId} plugin:`, error)
    }
  }

  /**
   * Dispose a specific plugin
   */
  private async disposePlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName)
    if (plugin) {
      plugin.dispose()
      this.plugins.delete(pluginName)
      console.log(`🗑️ ${pluginName} plugin disposed`)
    }
  }

  /**
   * Get a specific plugin
   */
  getPlugin(name: string): EditorPlugin | undefined {
    return this.plugins.get(name)
  }

  /**
   * Get all active plugins
   */
  getAllPlugins(): EditorPlugin[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Dispose all plugins
   */
  dispose(): void {
    console.log('🔌 Disposing Dynamic Plugin Manager')
    this.plugins.forEach(plugin => plugin.dispose())
    this.plugins.clear()
    this.initialized = false
    this.currentConfig = {}
    console.log('✅ Dynamic Plugin Manager disposed')
  }

  /**
   * Setup model listeners for all active plugins that support it
   */
  setupModelListeners(model: monaco.editor.ITextModel): void {
    this.plugins.forEach((plugin, name) => {
      // Check if plugin has setupModelListeners method (like ESM plugin)
      if ('setupModelListeners' in plugin && typeof plugin.setupModelListeners === 'function') {
        console.log(`🔗 Setting up model listeners for ${name} plugin`)
          ; (plugin as any).setupModelListeners(model)
      }
    })
  }
}