import React from 'react'
import type { ImportSuggestion } from './plugin-manager'

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
 */
export interface BasePluginProps {
  enabled?: boolean
}

/**
 * Props for ESM Import Resolver Plugin
 */
export interface ESMImportResolverProps extends BasePluginProps {
  esmServerUrl?: string
  packageWhitelist?: string[]
  packageBlacklist?: string[]
  enableAutoTypeResolution?: boolean
  customImportSuggestions?: ImportSuggestion[]
}

/**
 * Props for potential future plugins
 */
export interface AutocompletionPluginProps extends BasePluginProps {
  suggestions?: string[]
  triggerCharacters?: string[]
}

export interface FormatterPluginProps extends BasePluginProps {
  formatOnSave?: boolean
  formatOnType?: boolean
}

/**
 * ESM Import Resolver Plugin Component
 */
export const ESMImportResolverPlugin: React.FC<ESMImportResolverProps> = ({
  enabled = true,
  esmServerUrl,
  packageWhitelist,
  packageBlacklist,
  enableAutoTypeResolution = true,
  customImportSuggestions = []
}) => {
  // Plugin components don't render anything - they just register themselves
  return null
}

/**
 * Future plugin components (placeholders)
 */
export const AutocompletionPlugin: React.FC<AutocompletionPluginProps> = ({
  enabled = true,
  suggestions,
  triggerCharacters
}) => {
  return null
}

export const FormatterPlugin: React.FC<FormatterPluginProps> = ({
  enabled = true,
  formatOnSave = true,
  formatOnType = false
}) => {
  return null
}

/**
 * Plugin type map for type safety
 */
export type PluginComponentProps = 
  | ESMImportResolverProps
  | AutocompletionPluginProps
  | FormatterPluginProps

/**
 * Helper function to extract plugin configurations from children
 */
export function extractPluginConfigs(children: React.ReactNode): {
  esmResolver?: ESMImportResolverProps
  autocompletion?: AutocompletionPluginProps
  formatter?: FormatterPluginProps
} {
  const configs: ReturnType<typeof extractPluginConfigs> = {}

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return

    switch (child.type) {
      case ESMImportResolverPlugin:
        configs.esmResolver = child.props as ESMImportResolverProps
        break
      case AutocompletionPlugin:
        configs.autocompletion = child.props as AutocompletionPluginProps
        break
      case FormatterPlugin:
        configs.formatter = child.props as FormatterPluginProps
        break
    }
  })

  return configs
}