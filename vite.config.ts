import esmShim from '@rollup/plugin-esm-shim'
import react from "@vitejs/plugin-react"
import fs from "fs"
import path from "path"
import { visualizer } from "rollup-plugin-visualizer"
import { Plugin, PluginOption, defineConfig } from "vite"
import electron from 'vite-plugin-electron/simple'
import { VitePWA } from "vite-plugin-pwa"

const serviceMode = process.env.EIDOS_SERVICE_MODE || 'web-app'

const iconPath = path.resolve(__dirname, "icons.json")
const iconJson = JSON.parse(fs.readFileSync(iconPath, "utf-8"))

const htmlPlugin = (): Plugin => {
  return {
    name: "html-transform",
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      handler() {
        const entryMap: {
          [key: string]: string
        } = {
          "ink": "/apps/publish/index.tsx",
          "desktop": "/apps/desktop/index.tsx",
          "web-app": "/apps/web-app/index.tsx"
        }
        const src = entryMap[serviceMode]
        return [
          {
            tag: "script",
            attrs: { type: "module", src },
            injectTo: "body",
          },
        ]
      },
    },
  }
}

const cleanDistElectron = () => {
  const distElectronPath = path.resolve(__dirname, 'dist-electron')
  if (fs.existsSync(distElectronPath)) {
    fs.rmSync(distElectronPath, { recursive: true, force: true })
  }
}

const devServerConfig = serviceMode === 'web-app' ? {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
} : {}

console.log('devServerConfig', devServerConfig)

const config = defineConfig({
  base: '/',
  plugins: [
    htmlPlugin(),
    react(),
    {
      name: 'clean-dist-electron',
      buildStart() {
        // cleanDistElectron()
      }
    },
    serviceMode === 'web-app' ?
      VitePWA({
        srcDir: "apps/web-app",
        filename: "sw.ts",
        strategies: "injectManifest",
        injectManifest: {
          // 7MB
          maximumFileSizeToCacheInBytes: 7 * 1024 * 1024,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
        },
        includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
        manifest: {
          name: "Eidos",
          short_name: "Eidos",
          description:
            "An extensible framework for managing your personal data throughout your lifetime in one place",
          theme_color: "#ffffff",
          icons: iconJson.icons,
          display_override: ["window-controls-overlay"],
          display: "standalone",
          // display: "standalone",
          file_handlers: [
            // not ready yet
            // {
            //   action: "/editor/doc",
            //   accept: {
            //     "text/markdown": [".md", ".markdown"],
            //   },
            // },
          ],
        },
        registerType: "prompt",
        workbox: {
          // globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
          clientsClaim: true,
          skipWaiting: true,
        },
        devOptions: {
          enabled: true,
          type: "module",
        },
      }) : null,
    serviceMode === 'desktop' ?
      electron({
        main: {
          // Shortcut of `build.lib.entry`
          entry: 'electron/main.ts',
          vite: {
            resolve: {
              alias: {
                "@": path.resolve(__dirname, "./"),
              },
            },
            build: {
              rollupOptions: {
                plugins: [
                  // resolve({
                  //   preferBuiltins: true,
                  //   extensions: ['.js', '.json', '.node']
                  // }) as any,
                  // commonjs({
                  //   include: 'node_modules/**',
                  //   dynamicRequireTargets: [
                  //     // specify the paths to the native modules
                  //     'node_modules/better-sqlite3/**/*'
                  //   ]
                  // }),
                  esmShim() as any,
                ],
                external: [
                  'better-sqlite3', // Treat better-sqlite3 as external module
                ]
              },
            },
          }
        },
        preload: {
          input: 'electron/preload.ts',
          vite: {
            resolve: {
              alias: {
                "@": path.resolve(__dirname, "./"),
              },
            },
            build: {
              rollupOptions: {
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
        // Optional: Use Node.js API in the Renderer process
        // renderer: {},
      }) : null,
    visualizer({
      gzipSize: true,
      brotliSize: true,
      emitFile: false,
      filename: "dev-pkg-vis.html",
      open: true,
    }) as unknown as PluginOption,
  ],
  build: {
    rollupOptions: {
      external: ['electron'],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      'csv-parse/sync': serviceMode === 'desktop' ? 'csv-parse/sync' : 'csv-parse/browser/esm',
      'csv-stringify/sync': serviceMode === 'desktop' ? 'csv-stringify/sync' : 'csv-stringify/browser/esm',
    },
  },
  server: {
    ...devServerConfig,
    proxy: {
      "/server/api": "http://localhost:8788",
      "/api/chat": "http://localhost:13127",
      '^/[^/]+/files/[^/]+$': {
        target: 'http://localhost:13127',
        changeOrigin: true,
        rewrite: (path) => path, // 保持路径不变
      },
    },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "whisper-webgpu"],
  },
})

export default config
