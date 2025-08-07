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

export interface TailwindCSSPluginProps extends BasePluginProps {
  // Custom Tailwind configuration (similar to tailwind.config.js)
  tailwindConfig?: {
    theme?: {
      colors?: Record<string, string | Record<string, string>>
      spacing?: Record<string, string>
      fontSize?: Record<string, string | [string, string] | [string, { lineHeight: string; letterSpacing?: string }]>
      fontFamily?: Record<string, string[]>
      screens?: Record<string, string>
      borderRadius?: Record<string, string>
      boxShadow?: Record<string, string>
      extend?: {
        colors?: Record<string, string | Record<string, string>>
        spacing?: Record<string, string>
        fontSize?: Record<string, string | [string, string] | [string, { lineHeight: string; letterSpacing?: string }]>
        fontFamily?: Record<string, string[]>
        screens?: Record<string, string>
        borderRadius?: Record<string, string>
        boxShadow?: Record<string, string>
        [key: string]: any
      }
      [key: string]: any
    }
    [key: string]: any
  }
  // Additional custom class names
  customClasses?: string[]
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

export const TailwindCSSPlugin: React.FC<TailwindCSSPluginProps> = ({
  enabled = true
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
  | TailwindCSSPluginProps

/**
 * Helper function to extract plugin configurations from children
 */
export function extractPluginConfigs(children: React.ReactNode): {
  esmResolver?: ESMImportResolverProps
  autocompletion?: AutocompletionPluginProps
  formatter?: FormatterPluginProps
  tailwindcss?: TailwindCSSPluginProps
} {
  const configs: ReturnType<typeof extractPluginConfigs> = {}
  let hasAnyPlugin = false

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return

    hasAnyPlugin = true
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
      case TailwindCSSPlugin:
        configs.tailwindcss = child.props as TailwindCSSPluginProps
        break
    }
  })

  // If no plugins are specified via children, provide a default ESM resolver configuration
  // This maintains backward compatibility
  if (!hasAnyPlugin) {
    configs.esmResolver = {
      enabled: true,
      enableAutoTypeResolution: true
    }
  }

  return configs
}