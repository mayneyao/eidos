import { defineConfig } from 'vite'
import path from 'node:path'

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
      external: [
        /^node:/,
        '@eidos.space/better-sqlite3',
        'better-sqlite3',
      ],
    },
  },
  ssr: {
    external: [
      '@eidos.space/better-sqlite3',
      'better-sqlite3',
    ],
  },
})


