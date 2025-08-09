/**
 * Auto-loader for all plugins
 * Import this file to automatically register all plugins
 */

// Import all plugin registration files
import './esm-import-resolver/register'
import './tailwindcss-autocomplete/register'
import './example-new-plugin/register'

// Future plugins can be added here:
// import './formatter/register'
// import './autocompletion/register'

console.log('📦 All plugins auto-loaded and registered')