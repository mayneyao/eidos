/**
 * Plugin Registry System - Decoupled Plugin Management
 * Allows plugins to self-register without modifying core manager code
 */

import type { EditorPlugin } from './base-types'

export interface PluginFactory<TConfig = any> {
  /**
   * Plugin identifier (must be unique)
   */
  pluginId: string

  /**
   * Plugin display name
   */
  displayName: string

  /**
   * Plugin version
   */
  version: string

  /**
   * Factory function to create plugin instances
   */
  createPlugin: (config: TConfig) => EditorPlugin

  /**
   * Default configuration for the plugin
   */
  defaultConfig?: TConfig

  /**
   * Plugin description
   */
  description?: string

  /**
   * Plugin dependencies (other plugin IDs that must be loaded first)
   */
  dependencies?: string[]
}

/**
 * Global Plugin Registry
 */
class PluginRegistry {
  private factories = new Map<string, PluginFactory>()
  private initialized = false

  /**
   * Register a plugin factory
   */
  register<TConfig = any>(factory: PluginFactory<TConfig>): void {
    if (this.factories.has(factory.pluginId)) {
      console.warn(`⚠️ Plugin '${factory.pluginId}' is already registered, overwriting...`)
    }

    this.factories.set(factory.pluginId, factory)
    console.log(`📦 Registered plugin: ${factory.displayName} (${factory.pluginId}) v${factory.version}`)
  }

  /**
   * Unregister a plugin factory
   */
  unregister(pluginId: string): boolean {
    const success = this.factories.delete(pluginId)
    if (success) {
      console.log(`🗑️ Unregistered plugin: ${pluginId}`)
    }
    return success
  }

  /**
   * Get a plugin factory by ID
   */
  getFactory(pluginId: string): PluginFactory | undefined {
    return this.factories.get(pluginId)
  }

  /**
   * Get all registered plugin factories
   */
  getAllFactories(): PluginFactory[] {
    return Array.from(this.factories.values())
  }

  /**
   * Create a plugin instance from registered factory
   */
  createPlugin(pluginId: string, config?: any): EditorPlugin | null {
    const factory = this.factories.get(pluginId)
    if (!factory) {
      console.error(`❌ Plugin factory not found: ${pluginId}`)
      return null
    }

    try {
      const finalConfig = { ...factory.defaultConfig, ...config }
      const plugin = factory.createPlugin(finalConfig)
      console.log(`✨ Created plugin instance: ${factory.displayName}`)
      return plugin
    } catch (error) {
      console.error(`❌ Failed to create plugin ${pluginId}:`, error)
      return null
    }
  }

  /**
   * Check if a plugin is registered
   */
  hasPlugin(pluginId: string): boolean {
    return this.factories.has(pluginId)
  }

  /**
   * Get plugin info without creating instance
   */
  getPluginInfo(pluginId: string): { displayName: string; version: string; description?: string } | null {
    const factory = this.factories.get(pluginId)
    if (!factory) return null

    return {
      displayName: factory.displayName,
      version: factory.version,
      description: factory.description
    }
  }

  /**
   * Resolve plugin dependencies (topological sort)
   */
  resolveDependencies(pluginIds: string[]): string[] {
    const resolved: string[] = []
    const visiting = new Set<string>()
    const visited = new Set<string>()

    const visit = (pluginId: string) => {
      if (visited.has(pluginId)) return
      if (visiting.has(pluginId)) {
        throw new Error(`Circular dependency detected involving plugin: ${pluginId}`)
      }

      const factory = this.factories.get(pluginId)
      if (!factory) {
        throw new Error(`Plugin not found: ${pluginId}`)
      }

      visiting.add(pluginId)

      // Visit dependencies first
      if (factory.dependencies) {
        for (const dep of factory.dependencies) {
          visit(dep)
        }
      }

      visiting.delete(pluginId)
      visited.add(pluginId)
      resolved.push(pluginId)
    }

    for (const pluginId of pluginIds) {
      visit(pluginId)
    }

    return resolved
  }

  /**
   * Initialize the registry (called once)
   */
  initialize(): void {
    if (this.initialized) return

    console.log('🔧 Initializing Plugin Registry')
    this.initialized = true
  }

  /**
   * Clear all registered plugins (for testing)
   */
  clear(): void {
    this.factories.clear()
    console.log('🧹 Plugin registry cleared')
  }
}

// Export singleton instance
export const pluginRegistry = new PluginRegistry()

/**
 * Decorator for auto-registering plugins
 */
export function RegisterPlugin<TConfig = any>(factory: PluginFactory<TConfig>) {
  return function <T extends new (...args: any[]) => EditorPlugin>(constructor: T) {
    // Auto-register when the class is loaded
    pluginRegistry.register({
      ...factory,
      createPlugin: (config: TConfig) => new constructor(config)
    })

    return constructor
  }
}

/**
 * Helper function to register plugin manually
 */
export function registerPlugin<TConfig = any>(factory: PluginFactory<TConfig>): void {
  pluginRegistry.register(factory)
}