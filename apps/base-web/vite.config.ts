import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, type Plugin } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

import {
  BASE_FILE_EXTENSION,
  BASE_MIME_TYPE,
} from "./src/files/browser-file-adapter"

const directory = path.dirname(fileURLToPath(import.meta.url))

const pwaIcons = [
  {
    fileName: "base-icon-192.png",
    source: path.resolve(
      directory,
      "../web-app/public/android/android-launchericon-192-192.png"
    ),
  },
  {
    fileName: "base-icon-512.png",
    source: path.resolve(
      directory,
      "../web-app/public/android/android-launchericon-512-512.png"
    ),
  },
] as const

const baseFileHandler = {
  action: "./",
  accept: { [BASE_MIME_TYPE]: [BASE_FILE_EXTENSION] },
  icons: [
    {
      src: "./base-icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
  ],
  launch_type: "multiple-clients",
}

function reuseEidosPwaIcons(): Plugin {
  return {
    name: "base-web-eidos-pwa-icons",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requested = request.url?.split("?", 1)[0].replace(/^\//, "")
        const icon = pwaIcons.find(({ fileName }) => fileName === requested)
        if (!icon) {
          next()
          return
        }
        response.statusCode = 200
        response.setHeader("Content-Type", "image/png")
        response.setHeader("Cache-Control", "no-cache")
        response.end(readFileSync(icon.source))
      })
    },
    generateBundle() {
      for (const icon of pwaIcons) {
        this.emitFile({
          type: "asset",
          fileName: icon.fileName,
          source: readFileSync(icon.source),
        })
      }
    },
  }
}

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.base"],
  plugins: [
    tailwindcss(),
    react(),
    wasm(),
    topLevelAwait(),
    reuseEidosPwaIcons(),
    VitePWA({
      injectRegister: "auto",
      registerType: "autoUpdate",
      manifest: {
        id: "./",
        name: "Eidos Base",
        short_name: "Eidos Base",
        description:
          "Open and edit the Eidos open multidimensional table format locally.",
        start_url: "./",
        scope: "./",
        lang: "en",
        theme_color: "#f7f8fa",
        background_color: "#ffffff",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        categories: ["productivity", "utilities"],
        icons: [
          {
            src: "./base-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "./base-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        launch_handler: { client_mode: "navigate-new" },
        file_handlers: [baseFileHandler],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,png,svg,wasm,base}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "index.html",
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@eidos.space/base-ui/styles.css": path.resolve(
        directory,
        "../../packages/base-ui/src/styles.css"
      ),
      "@eidos.space/base-ui/base-data-grid": path.resolve(
        directory,
        "../../packages/base-ui/src/base-data-grid.tsx"
      ),
      "@eidos.space/base-ui/base-editor-view": path.resolve(
        directory,
        "../../packages/base-ui/src/base-editor-view.tsx"
      ),
      "@eidos.space/base-ui/context": path.resolve(
        directory,
        "../../packages/base-ui/src/context.tsx"
      ),
      "@eidos.space/base-ui/base-editor-chrome": path.resolve(
        directory,
        "../../packages/base-ui/src/base-editor-chrome.tsx"
      ),
      "@eidos.space/base-ui/base-query-toolbar": path.resolve(
        directory,
        "../../packages/base-ui/src/base-query-toolbar.tsx"
      ),
      "@eidos.space/base": path.resolve(
        directory,
        "../../packages/base/src/index.ts"
      ),
      "@eidos.space/base-ui": path.resolve(
        directory,
        "../../packages/base-ui/src/index.ts"
      ),
    },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
  },
  build: {
    target: ["chrome111", "edge111", "firefox114", "safari16.4", "ios16.4"],
    assetsInlineLimit: 0,
  },
})
