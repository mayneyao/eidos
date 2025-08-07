/**
 * Plugin Components - Unified Export
 * This file provides a clean way to import all plugin components
 * without creating coupling between plugins and core files
 */

// Auto-load all component registrations
import "./component-auto-loader"

// Re-export components for convenience (optional)
export { ESMImportResolverPlugin } from "./esm-import-resolver/component"
export { TailwindCSSPlugin } from "./tailwindcss-autocomplete/component"
export { ExamplePlugin } from "./example-new-plugin/component"

// Re-export the registry utilities
export {
  extractPluginConfigs,
  pluginComponentRegistry,
} from "./plugin-component-registry"

// Re-export base types
export type { EditorPlugin, PluginContext, BasePluginProps } from "./base-types"

// Re-export plugin-specific types from their own directories
export type { ESMImportResolverProps } from "./esm-import-resolver/types"
export type { TailwindCSSPluginProps } from "./tailwindcss-autocomplete/types"
export type { ExamplePluginProps } from "./example-new-plugin/types"
