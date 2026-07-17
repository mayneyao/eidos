import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.base"],
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      "@eidos.space/base": path.resolve(
        directory,
        "../../packages/base/src/index.ts"
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
