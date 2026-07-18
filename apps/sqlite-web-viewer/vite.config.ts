import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

const isolationHeaders = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
}

const sqliteFileHandler = {
  action: "./",
  accept: {
    "application/vnd.sqlite3": [".sqlite", ".sqlite3", ".db", ".db3"],
    "application/vnd.eidos+sqlite3": [".eidos"],
  },
  icons: [
    {
      src: "./sqlite-viewer-icon.svg",
      sizes: "any",
      type: "image/svg+xml",
    },
  ],
  launch_type: "multiple-clients",
}

export default defineConfig({
  base: "./",
  assetsInclude: [
    "**/*.sqlite",
    "**/*.sqlite3",
    "**/*.db",
    "**/*.db3",
    "**/*.eidos",
  ],
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    VitePWA({
      includeAssets: ["sqlite-viewer-icon.svg"],
      injectRegister: "auto",
      registerType: "prompt",
      manifest: {
        id: "./",
        name: "SQLite Web Viewer",
        short_name: "SQLite Viewer",
        description:
          "Inspect SQLite-based files locally and read-only, including Eidos and custom suffixes.",
        start_url: "./",
        scope: "./",
        lang: "en",
        theme_color: "#f7f8fa",
        background_color: "#f7f8fa",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        categories: ["developer", "productivity", "utilities"],
        icons: [
          {
            src: "./sqlite-viewer-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
        launch_handler: { client_mode: "navigate-new" },
        file_handlers: [sqliteFileHandler],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,wasm}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "index.html",
      },
    }),
  ],
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  build: {
    target: ["chrome111", "edge111", "firefox114", "safari16.4", "ios16.4"],
    assetsInlineLimit: 0,
  },
})
