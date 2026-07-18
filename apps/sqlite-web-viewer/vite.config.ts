import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

const isolationHeaders = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
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
  plugins: [react(), wasm(), topLevelAwait()],
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
