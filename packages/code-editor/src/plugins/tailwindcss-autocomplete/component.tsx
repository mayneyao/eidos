/**
 * TailwindCSS Autocomplete Plugin React Component
 * Self-contained component that registers itself automatically
 */

import React from 'react'
import { registerPluginComponent } from '../plugin-component-registry'
import type { TailwindCSSPluginProps } from './types'

/**
 * TailwindCSS Plugin Component
 * This component automatically registers itself with the plugin component registry
 */
export const TailwindCSSPlugin: React.FC<TailwindCSSPluginProps> = registerPluginComponent({
  pluginId: 'tailwindcss',
  displayName: 'Tailwind CSS Autocomplete',
  propsInterface: 'TailwindCSSPluginProps'
})(({
  enabled = true,
  tailwindConfig,
  customClasses
}: TailwindCSSPluginProps) => {
  // Plugin components don't render anything - they just register themselves
  // The actual plugin logic is handled by the plugin registry and manager
  return null
})

// Auto-register when this module is imported
console.log('📝 TailwindCSS Plugin component loaded and registered')