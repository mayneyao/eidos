/**
 * Auto-register TailwindCSS Plugin
 */

import { registerPlugin } from '../plugin-registry'
import { TailwindCSSPlugin } from './index'
import type { TailwindCSSPluginProps } from '../plugin-components'

// Register the TailwindCSS plugin
registerPlugin<TailwindCSSPluginProps>({
  pluginId: 'tailwindcss',
  displayName: 'Tailwind CSS Autocomplete',
  version: '1.0.0',
  description: 'Provides Tailwind CSS class name autocompletion with custom configuration support',
  createPlugin: (config) => new TailwindCSSPlugin(config),
  defaultConfig: {
    enabled: true
  }
})