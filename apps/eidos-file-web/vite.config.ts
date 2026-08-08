import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

import { eidosFileUiSourceAliases } from "../../packages/eidos-file-ui/vite-source-aliases"

import {
  EIDOS_FILE_EXTENSION,
  EIDOS_FILE_MIME_TYPE,
} from "./src/files/browser-file-adapter"

const directory = path.dirname(fileURLToPath(import.meta.url))

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

export default defineConfig({
  base: "/",
  assetsInclude: ["**/*.eidos"],
  plugins: [
    tailwindcss(),
    react(),
    wasm(),
    topLevelAwait(),
    VitePWA({
      injectRegister: "auto",
      registerType: "prompt",
      manifest: {
        id: "./",
        name: "Eidos File",
        short_name: "Eidos File",
        description:
          "Open Eidos File 1.0 locally through the portable Runtime, Adapter, and UI contracts.",
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
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: [
      ...eidosFileUiSourceAliases(),
      {
        find: "@eidos.space/eidos-file/csv",
        replacement: path.resolve(
          directory,
          "../../packages/eidos-file/src/csv.ts"
        ),
      },
      {
        find: "@eidos.space/eidos-file",
        replacement: path.resolve(
          directory,
          "../../packages/eidos-file/src/index.ts"
        ),
      },
    ],
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
