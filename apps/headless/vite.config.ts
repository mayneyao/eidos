import { defineConfig } from 'vite'
import path from 'node:path'
import { builtinModules } from 'node:module'
import pkg from './package.json' assert { type: 'json' }

const __dirname = path.dirname(new URL(import.meta.url).pathname)

export default defineConfig({
  resolve: {
    alias: {
      // Use Node.js path instead of path-browserify
      'path-browserify': 'path',
    },
  },
  build: {
    target: 'node20',
    ssr: true,
    outDir: 'dist',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      // Logic: 
      // 1. Bundle "@eidos.space/*" (except better-sqlite3)
      // 2. Everything else is external
      external: (id) => {
        if (id.startsWith('node:') || builtinModules.includes(id)) return true
        
        // Native / External binary modules - MUST be external
        if (
            id === '@eidos.space/better-sqlite3' || 
            id === 'oxc-parser' || 
            id === 'oxc-transform' ||
            id.includes('.node')
        ) return true

        // If it's a dependency in package.json and NOT one of our workspace packages to bundle
        const isDep = Object.keys(pkg.dependencies || {}).some(dep => id === dep || id.startsWith(`${dep}/`))
        const isInternal = id.startsWith('@eidos.space/')
        
        if (isDep && !isInternal) return true
        
        // Externalize actual node_modules (non-internal)
        if (id.includes('node_modules') && !id.includes('@eidos.space')) return true

        return false
      },
    },
  },
  ssr: {
    noExternal: [
      '@eidos.space/core',
      '@eidos.space/ext-server',
      '@eidos.space/sandbox',
      '@eidos.space/v3',
    ],
    external: [
      '@eidos.space/better-sqlite3',
      'oxc-parser',
      'oxc-transform',
      ...Object.keys(pkg.dependencies || {}).filter(d => !d.startsWith('@eidos.space/'))
    ]
  },
})


