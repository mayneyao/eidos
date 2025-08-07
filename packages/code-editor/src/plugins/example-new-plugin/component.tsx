/**
 * Example Plugin React Component
 * Self-contained component that registers itself automatically
 */

import React from 'react'
import { registerPluginComponent } from '../plugin-component-registry'
import type { ExamplePluginProps } from './types'

/**
 * Example Plugin Component
 * This component automatically registers itself with the plugin component registry
 */
export const ExamplePlugin: React.FC<ExamplePluginProps> = registerPluginComponent({
  pluginId: 'example-plugin',
  displayName: 'Example Plugin',
  propsInterface: 'ExamplePluginProps'
})(({
  enabled = true,
  customMessage,
  triggerKey
}: ExamplePluginProps) => {
  // Plugin components don't render anything - they just register themselves
  // The actual plugin logic is handled by the plugin registry and manager
  return null
})

// Auto-register when this module is imported
console.log('📝 Example Plugin component loaded and registered')