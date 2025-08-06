/**
 * Enhanced Plugin Manager for Code Editor with Dynamic Configuration
 * Supports plugin configuration via React children components
 */

import type * as monaco from 'monaco-editor'
import { ESMImportResolverPlugin, type PluginManagerOptions } from './plugin-manager'
import type { 
  ESMImportResolverProps, 
  AutocompletionPluginProps,
  FormatterPluginProps,
  EditorPlugin 
} from './plugin-components'

export interface DynamicPluginConfig {
  esmResolver?: ESMImportResolverProps
  autocompletion?: AutocompletionPluginProps
  formatter?: FormatterPluginProps
}

/**
 * Dynamic Plugin Manager that can be reconfigured at runtime
 */
export class DynamicPluginManager {
  private plugins = new Map<string, EditorPlugin>()
  private currentConfig: DynamicPluginConfig = {}
  private initialized = false

  constructor() {}

  /**
   * Update plugin configuration and reinitialize affected plugins
   */
  async updateConfiguration(config: DynamicPluginConfig): Promise<void> {
    console.log('🔄 Updating plugin configuration:', config)

    // Compare with current config to see what changed
    const changes = this.detectConfigChanges(this.currentConfig, config)
    
    // Dispose plugins that are no longer enabled or have changed configuration
    for (const pluginName of changes.toDispose) {
      await this.disposePlugin(pluginName)
    }

    // Initialize or reconfigure plugins
    for (const pluginName of changes.toInitialize) {
      await this.initializePlugin(pluginName, config)
    }

    this.currentConfig = { ...config }
    this.initialized = true
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

    // Check ESM Resolver plugin
    const oldEsm = oldConfig.esmResolver
    const newEsm = newConfig.esmResolver
    
    if (oldEsm && (!newEsm || newEsm.enabled === false)) {
      toDispose.push('esm-import-resolver')
    } else if (newEsm && newEsm.enabled !== false) {
      if (!oldEsm || JSON.stringify(oldEsm) !== JSON.stringify(newEsm)) {
        toDispose.push('esm-import-resolver') // Dispose first to reconfigure
        toInitialize.push('esm-import-resolver')
      }
    }

    // Check other plugins (placeholders for future implementation)
    if (newConfig.autocompletion?.enabled && !oldConfig.autocompletion?.enabled) {
      toInitialize.push('autocompletion')
    } else if (!newConfig.autocompletion?.enabled && oldConfig.autocompletion?.enabled) {
      toDispose.push('autocompletion')
    }

    if (newConfig.formatter?.enabled && !oldConfig.formatter?.enabled) {
      toInitialize.push('formatter')
    } else if (!newConfig.formatter?.enabled && oldConfig.formatter?.enabled) {
      toDispose.push('formatter')
    }

    return { toDispose, toInitialize }
  }

  /**
   * Initialize a specific plugin based on its configuration
   */
  private async initializePlugin(pluginName: string, config: DynamicPluginConfig): Promise<void> {
    try {
      let plugin: EditorPlugin | null = null

      switch (pluginName) {
        case 'esm-import-resolver':
          if (config.esmResolver && config.esmResolver.enabled !== false) {
            const esmConfig: PluginManagerOptions['esmResolverConfig'] = {
              esmServerUrl: config.esmResolver.esmServerUrl,
              packageWhitelist: config.esmResolver.packageWhitelist,
              packageBlacklist: config.esmResolver.packageBlacklist,
              enableAutoTypeResolution: config.esmResolver.enableAutoTypeResolution,
              customImportSuggestions: config.esmResolver.customImportSuggestions
            }
            plugin = new ESMImportResolverPlugin(esmConfig)
          }
          break

        case 'autocompletion':
          // Placeholder for future autocompletion plugin
          console.log('🔌 Autocompletion plugin not yet implemented')
          break

        case 'formatter':
          // Placeholder for future formatter plugin
          console.log('🔌 Formatter plugin not yet implemented')
          break
      }

      if (plugin) {
        await plugin.initialize()
        this.plugins.set(pluginName, plugin)
        console.log(`✅ ${pluginName} plugin initialized`)
      }
    } catch (error) {
      console.error(`❌ Failed to initialize ${pluginName} plugin:`, error)
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
        ;(plugin as any).setupModelListeners(model)
      }
    })
  }
}