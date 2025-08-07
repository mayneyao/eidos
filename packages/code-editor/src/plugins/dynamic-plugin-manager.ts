/**
 * Enhanced Plugin Manager for Code Editor with Dynamic Configuration
 * Supports plugin configuration via React children components
 */

import type * as monaco from 'monaco-editor'
import { ESMImportResolverPlugin, type ESMResolverConfig } from './plugin-manager'
import type { 
  ESMImportResolverProps, 
  AutocompletionPluginProps,
  FormatterPluginProps,
  TailwindCSSPluginProps,
  EditorPlugin 
} from './plugin-components'
import { TailwindCSSPlugin } from './tailwindcss-autocomplete'

export interface DynamicPluginConfig {
  esmResolver?: ESMImportResolverProps
  autocompletion?: AutocompletionPluginProps
  formatter?: FormatterPluginProps
  tailwindcss?: TailwindCSSPluginProps
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
    
    console.log('📋 Configuration changes detected:', {
      toDispose: changes.toDispose,
      toInitialize: changes.toInitialize
    })
    
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

    // Check TailwindCSS plugin
    const oldTailwind = oldConfig.tailwindcss
    const newTailwind = newConfig.tailwindcss
    
    if (oldTailwind && (!newTailwind || newTailwind.enabled === false)) {
      toDispose.push('tailwindcss')
    } else if (newTailwind && newTailwind.enabled !== false) {
      if (!oldTailwind || JSON.stringify(oldTailwind) !== JSON.stringify(newTailwind)) {
        toDispose.push('tailwindcss') // Dispose first to reconfigure
        toInitialize.push('tailwindcss')
      }
    }

    return { toDispose, toInitialize }
  }

  /**
   * Initialize a specific plugin based on its configuration
   */
  private async initializePlugin(pluginName: string, config: DynamicPluginConfig): Promise<void> {
    try {
      // Ensure any existing plugin is disposed first
      const existingPlugin = this.plugins.get(pluginName)
      if (existingPlugin) {
        console.log(`🔄 Disposing existing ${pluginName} plugin before reinitializing`)
        existingPlugin.dispose()
        this.plugins.delete(pluginName)
      }

      let plugin: EditorPlugin | null = null

      switch (pluginName) {
        case 'esm-import-resolver':
          if (config.esmResolver && config.esmResolver.enabled !== false) {
            const esmConfig: ESMResolverConfig = {
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

        case 'tailwindcss':
          if (config.tailwindcss && config.tailwindcss.enabled !== false) {
            plugin = new TailwindCSSPlugin(config.tailwindcss)
          }
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