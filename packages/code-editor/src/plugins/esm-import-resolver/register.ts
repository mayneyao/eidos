/**
 * Auto-register ESM Import Resolver Plugin
 */

import { registerPlugin } from '../plugin-registry'
import { ESMImportResolverPlugin } from './index'
import type { ESMImportResolverProps } from './types'

// Register the ESM Import Resolver plugin
registerPlugin<ESMImportResolverProps>({
  pluginId: 'esm-import-resolver',
  displayName: 'ESM Import Resolver',
  version: '1.0.0',
  description: 'Resolves ESM imports and provides auto-completion for external packages',
  createPlugin: (config) => new ESMImportResolverPlugin(config),
  defaultConfig: {
    enabled: true,
    enableAutoTypeResolution: true,
    customImportSuggestions: []
  } as ESMImportResolverProps
})

console.log('📦 ESM Import Resolver Plugin registered successfully!')