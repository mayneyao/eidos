import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@eidos.space/markdown-editor/styles.css",
        replacement: path.resolve(
          directory,
          "../../packages/markdown-editor/src/styles.css"
        ),
      },
      {
        find: "@eidos.space/markdown-editor",
        replacement: path.resolve(
          directory,
          "../../packages/markdown-editor/src/index.ts"
        ),
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
  },
  build: {
    target: ["chrome111", "edge111", "firefox114", "safari16.4"],
  },
})
