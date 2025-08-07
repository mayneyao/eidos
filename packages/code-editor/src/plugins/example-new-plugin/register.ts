/**
 * Example: Auto-register the new plugin
 * This is ALL you need to do to add a new plugin to the system!
 */

import { registerPlugin } from '../plugin-registry'
import { ExamplePlugin, type ExamplePluginProps } from './index'

// Register the plugin - that's it! No need to modify any core files
registerPlugin<ExamplePluginProps>({
  pluginId: 'example-plugin',
  displayName: 'Example Plugin',
  version: '1.0.0',
  description: 'Demonstrates how easy it is to add new plugins',
  createPlugin: (config) => new ExamplePlugin(config),
  defaultConfig: {
    enabled: true,
    customMessage: 'Hello from Example Plugin!',
    triggerKey: 'example'
  }
})

console.log('🎯 Example Plugin registered successfully!')