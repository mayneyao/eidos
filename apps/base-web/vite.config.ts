import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.base"],
  plugins: [tailwindcss(), react(), wasm(), topLevelAwait()],
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
