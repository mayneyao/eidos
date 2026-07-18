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
  EIDOS_FILE_EXTENSION,
  EIDOS_FILE_MIME_TYPE,
} from "./src/files/browser-file-adapter"

const directory = path.dirname(fileURLToPath(import.meta.url))

const pwaIcons = [
  {
    fileName: "eidos-file-icon-192.png",
    source: path.resolve(
      directory,
      "../web-app/public/android/android-launchericon-192-192.png"
    ),
  },
  {
    fileName: "eidos-file-icon-512.png",
    source: path.resolve(
      directory,
      "../web-app/public/android/android-launchericon-512-512.png"
    ),
  },
] as const

const eidosFileHandler = {
  action: "./",
  accept: { [EIDOS_FILE_MIME_TYPE]: [EIDOS_FILE_EXTENSION] },
  icons: [
    {
      src: "./eidos-file-icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
  ],
  launch_type: "multiple-clients",
}

function reuseEidosPwaIcons(): Plugin {
  return {
    name: "eidos-file-web-eidos-pwa-icons",
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
  base: "/",
  assetsInclude: ["**/*.eidos"],
  plugins: [
    tailwindcss(),
    react(),
    wasm(),
    topLevelAwait(),
    reuseEidosPwaIcons(),
    VitePWA({
      injectRegister: "auto",
      registerType: "prompt",
      manifest: {
        id: "./",
        name: "Eidos File",
        short_name: "Eidos File",
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
            src: "./eidos-file-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "./eidos-file-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
        launch_handler: { client_mode: "navigate-new" },
        file_handlers: [eidosFileHandler],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,png,svg,wasm,eidos}"],
        importScripts: ["pwa-update-policy.js"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/(?:zh\/)?docs(?:\/|$)/],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@eidos.space/eidos-file-ui/styles.css": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/styles.css"
      ),
      "@eidos.space/eidos-file-ui/eidos-file-data-grid": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/eidos-file-data-grid.tsx"
      ),
      "@eidos.space/eidos-file-ui/eidos-file-editor-view": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/eidos-file-editor-view.tsx"
      ),
      "@eidos.space/eidos-file-ui/context": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/context.tsx"
      ),
      "@eidos.space/eidos-file-ui/eidos-file-editor-chrome": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/eidos-file-editor-chrome.tsx"
      ),
      "@eidos.space/eidos-file-ui/eidos-file-sheet-create-popover":
        path.resolve(
          directory,
          "../../packages/eidos-file-ui/src/eidos-file-sheet-create-popover.tsx"
        ),
      "@eidos.space/eidos-file-ui/eidos-file-sheet-tabs": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/eidos-file-sheet-tabs.tsx"
      ),
      "@eidos.space/eidos-file-ui/eidos-file-view-tabs": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/eidos-file-view-tabs.tsx"
      ),
      "@eidos.space/eidos-file-ui/eidos-file-query-toolbar": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/eidos-file-query-toolbar.tsx"
      ),
      "@eidos.space/eidos-file-ui/eidos-file-field-create-popover":
        path.resolve(
          directory,
          "../../packages/eidos-file-ui/src/eidos-file-field-create-popover.tsx"
        ),
      "@eidos.space/eidos-file-ui/eidos-file-derived-field-editor":
        path.resolve(
          directory,
          "../../packages/eidos-file-ui/src/eidos-file-derived-field-editor.tsx"
        ),
      "@eidos.space/eidos-file-ui/plugins/csv-import": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/plugins/csv-import.tsx"
      ),
      "@eidos.space/eidos-file-ui/plugins/gallery": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/plugins/gallery.tsx"
      ),
      "@eidos.space/eidos-file-ui/plugins/kanban": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/plugins/kanban.tsx"
      ),
      "@eidos.space/eidos-file-ui/plugin": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/plugin.tsx"
      ),
      "@eidos.space/eidos-file/csv": path.resolve(
        directory,
        "../../packages/eidos-file/src/csv.ts"
      ),
      "@eidos.space/eidos-file": path.resolve(
        directory,
        "../../packages/eidos-file/src/index.ts"
      ),
      "@eidos.space/eidos-file-ui": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/index.ts"
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
