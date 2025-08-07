/**
 * ESM Import Resolver Plugin React Component
 * Self-contained component that registers itself automatically
 */

import React from 'react'
import { registerPluginComponent } from '../plugin-component-registry'
import type { ESMImportResolverProps } from './types'

/**
 * ESM Import Resolver Plugin Component
 * This component automatically registers itself with the plugin component registry
 */
export const ESMImportResolverPlugin: React.FC<ESMImportResolverProps> = registerPluginComponent({
  pluginId: 'esm-import-resolver',
  displayName: 'ESM Import Resolver',
  propsInterface: 'ESMImportResolverProps'
})(({
  enabled = true,
  esmServerUrl,
  packageWhitelist,
  packageBlacklist,
  enableAutoTypeResolution = true,
  customImportSuggestions = []
}) => {
  // Plugin components don't render anything - they just register themselves
  // The actual plugin logic is handled by the plugin registry and manager
  return null
})

// Auto-register when this module is imported
console.log('📝 ESM Import Resolver component loaded and registered')