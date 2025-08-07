/**
 * ESM Import Resolver Plugin Types
 * Plugin-specific type definitions
 */

import type { BasePluginProps } from '../base-types'

/**
 * Import suggestion interface for ESM resolver
 */
export interface ImportSuggestion {
  label: string
  insertText: string
  detail?: string
  documentation?: string
  kind?: any // monaco.languages.CompletionItemKind - avoiding direct monaco import
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