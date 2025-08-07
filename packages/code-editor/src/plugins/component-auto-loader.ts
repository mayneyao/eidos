/**
 * Component Auto-loader for Plugin React Components
 * Import this file to automatically load and register all plugin components
 */

// Import all plugin component files to auto-register them
import './esm-import-resolver/component'
import './tailwindcss-autocomplete/component'
import './example-new-plugin/component'

// Future plugin components can be added here:
// import './formatter/component'
// import './autocompletion/component'

console.log('📦 All plugin components auto-loaded and registered')