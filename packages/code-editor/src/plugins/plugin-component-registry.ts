/**
 * Plugin Component Registry
 * Decoupled system for registering React plugin components
 */

import React from 'react'

export interface PluginComponentInfo {
  pluginId: string
  displayName: string
  component: React.ComponentType<any>
  propsInterface?: string // For documentation purposes
}

/**
 * Registry for plugin React components
 * Allows plugins to register their own components without modifying core files
 */
class PluginComponentRegistry {
  private components = new Map<React.ComponentType<any>, PluginComponentInfo>()
  private pluginIdToComponent = new Map<string, React.ComponentType<any>>()

  /**
   * Register a React component for a plugin
   */
  registerComponent(info: PluginComponentInfo): void {
    this.components.set(info.component, info)
    this.pluginIdToComponent.set(info.pluginId, info.component)
    console.log(`📝 Registered React component for plugin: ${info.displayName}`)
  }

  /**
   * Get plugin info by React component
   */
  getPluginInfo(component: React.ComponentType<any>): PluginComponentInfo | null {
    return this.components.get(component) || null
  }

  /**
   * Get React component by plugin ID
   */
  getComponent(pluginId: string): React.ComponentType<any> | null {
    return this.pluginIdToComponent.get(pluginId) || null
  }

  /**
   * Get all registered components
   */
  getAllComponents(): PluginComponentInfo[] {
    return Array.from(this.components.values())
  }

  /**
   * Check if a component is registered
   */
  isRegistered(component: React.ComponentType<any>): boolean {
    return this.components.has(component)
  }

  /**
   * Extract plugin configurations from React children
   * This replaces the hardcoded extractPluginConfigs function
   */
  extractPluginConfigs(children: React.ReactNode): {
    [pluginId: string]: {
      enabled?: boolean
      [key: string]: any
    }
  } {
    const configs: { [pluginId: string]: { enabled?: boolean;[key: string]: any } } = {}
    let hasAnyPlugin = false

    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return

      const pluginInfo = this.getPluginInfo(child.type as React.ComponentType<any>)
      if (pluginInfo) {
        hasAnyPlugin = true
        // Create a stable configuration object
        configs[pluginInfo.pluginId] = this.stabilizeConfig(child.props as any)
      }
    })

    // If no plugins are specified via children, provide a default ESM resolver configuration
    // This maintains backward compatibility
    if (!hasAnyPlugin) {
      configs['esm-import-resolver'] = {
        enabled: true,
        enableAutoTypeResolution: true
      }
    }

    return configs
  }

  /**
   * Stabilize configuration object to prevent unnecessary recreations
   * Sorts object keys and handles array ordering consistently
   */
  private stabilizeConfig(config: any): any {
    if (config === null || config === undefined) {
      return config
    }

    if (typeof config !== 'object') {
      return config
    }

    if (Array.isArray(config)) {
      return config.map(item => this.stabilizeConfig(item))
    }

    // Sort object keys to ensure consistent ordering
    const sortedKeys = Object.keys(config).sort()
    const stabilizedConfig: any = {}
    
    for (const key of sortedKeys) {
      stabilizedConfig[key] = this.stabilizeConfig(config[key])
    }

    return stabilizedConfig
  }
}

// Global registry instance
export const pluginComponentRegistry = new PluginComponentRegistry()

/**
 * Decorator/Helper function for registering plugin components
 */
export function registerPluginComponent<T = any>(info: Omit<PluginComponentInfo, 'component'>) {
  return function <P extends T>(component: React.FC<P>): React.FC<P> {
    pluginComponentRegistry.registerComponent({
      ...info,
      component: component as React.ComponentType<any>
    })
    return component
  }
}

/**
 * Extract plugin configurations using the registry
 * This replaces the old extractPluginConfigs function
 */
export function extractPluginConfigs(children: React.ReactNode) {
  return pluginComponentRegistry.extractPluginConfigs(children)
}