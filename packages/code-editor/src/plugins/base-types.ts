/**
 * Plugin System Base Types
 * Only shared/core types that ALL plugins need
 * Plugin-specific types should be in their own directories
 */

/**
 * Base interface for all editor plugins
 */
export interface EditorPlugin {
  name: string
  version: string
  initialize(): Promise<void>
  dispose(): void
  isEnabled(): boolean
  enable(): void
  disable(): void
}

/**
 * Context for plugin components to interact with the editor
 */
export interface PluginContext {
  registerPlugin: (plugin: EditorPlugin) => void
  unregisterPlugin: (pluginName: string) => void
}

/**
 * Base props for all plugin components
 * All plugin props should extend this interface
 */
export interface BasePluginProps {
  enabled?: boolean
}