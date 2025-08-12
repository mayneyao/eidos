import esmShim from '@rollup/plugin-esm-shim'
import path from "path"
import type { Plugin, UserConfig } from "vite";
import { mergeConfig, defineConfig } from "vite"
import electron from 'vite-plugin-electron/simple'
import { sharedAlias, sharedConfig } from "../../packages/shared/vite/base.config"
import { createHtmlPlugin } from "../../packages/shared/vite/plugins"
import fs from "fs/promises"


// desktop do not need android and windows11
const copyPublicPlugin = (): Plugin => {
  return {
    name: 'copy-public',
    closeBundle: async () => {
      const publicDir = path.resolve(__dirname, '../web-app/public')
      const distDir = path.resolve(__dirname, 'dist')
      console.log('dir', publicDir, distDir)

      try {
        await fs.mkdir(distDir, { recursive: true })

        const copyDirRecursive = async (src: string, dest: string) => {
          const entries = await fs.readdir(src, { withFileTypes: true })

          for (const entry of entries) {
            const srcPath = path.join(src, entry.name)
            const destPath = path.join(dest, entry.name)

            if (entry.name === 'android' || entry.name === 'windows11') {
              continue
            }

            if (entry.isDirectory()) {
              await fs.mkdir(destPath, { recursive: true })
              await copyDirRecursive(srcPath, destPath)
            } else {
              await fs.copyFile(srcPath, destPath)
            }
          }
        }

        await copyDirRecursive(publicDir, distDir)
      } catch (err) {
        console.error('Error copying public files:', err)
      }
    }
  }
}

const desktopConfig: UserConfig = mergeConfig(sharedConfig, {
  plugins: [
    createHtmlPlugin('renderer/index.tsx'),
    copyPublicPlugin(),
    electron({
      main: {
        entry: [
          'electron/main.ts',
          'electron/worker.ts',
        ],
        vite: {
          assetsInclude: ['**/*.node'],
          resolve: {
            alias: sharedAlias,
          },
          build: {
            rollupOptions: {
              plugins: [
                esmShim() as unknown as Plugin,
              ],
              external: [
                '@eidos.space/better-sqlite3',
                'oxc-parser',
                'oxc-transform'
              ]
            },
          },
        }
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          assetsInclude: ['**/*.node'],
          resolve: {
            alias: sharedAlias,
          },
          build: {
            rollupOptions: {
              external: [
                'oxc-parser',
                'oxc-transform'
              ],
              output: {
                format: 'es',
                inlineDynamicImports: true,
                entryFileNames: '[name].mjs',
                chunkFileNames: '[name].mjs',
                assetFileNames: '[name].[ext]',
              },
            },
          },
        },
      },
    }),
  ],
  build: {
    rollupOptions: {
      external: ['electron'],
    },
    copyPublicDir: false,
    assetsDir: 'assets',
    assetsInclude: ['**/*'],
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      'csv-parse/sync': 'csv-parse/sync',
      'csv-stringify/sync': 'csv-stringify/sync',
    }
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      "/compiled-ui/": {
        target: "http://localhost:13127",
        changeOrigin: true,
      },
      "/api/chat": "http://localhost:13127",
      '^/[^/]+/files/': {
        target: 'http://localhost:13127',
        changeOrigin: true,
        rewrite: (path: string) => path,
      },
      '/static/': {
        target: 'http://localhost:13127',
        changeOrigin: true,
      },
      '/extensions/': {
        target: 'http://localhost:13127',
        changeOrigin: true,
      },
    },
  },
})

export default defineConfig(desktopConfig)