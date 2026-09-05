import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { siteDocuments } from "./site-documents"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    siteDocuments(path.resolve(directory, "../../packages/markdown")),
  ],
  resolve: {
    // Production is an integration test of the public package artifact.
    // Source aliases are only for the development server's live updates.
    alias:
      command === "serve"
        ? [
            {
              find: "@eidos.space/markdown/presets",
              replacement: path.resolve(
                directory,
                "../../packages/markdown/src/presets.ts"
              ),
            },
            {
              find: "@eidos.space/markdown/styles.css",
              replacement: path.resolve(
                directory,
                "../../packages/markdown/src/styles.css"
              ),
            },
            {
              find: "@eidos.space/markdown/plugin-api",
              replacement: path.resolve(
                directory,
                "../../packages/markdown/src/plugin-api.ts"
              ),
            },
            {
              find: "@eidos.space/markdown/plugins",
              replacement: path.resolve(
                directory,
                "../../packages/markdown/src/builtin-plugins.ts"
              ),
            },
            {
              find: /^@eidos\.space\/markdown$/u,
              replacement: path.resolve(
                directory,
                "../../packages/markdown/src/index.ts"
              ),
            },
          ]
        : [],
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
  },
  build: {
    target: ["chrome111", "edge111", "firefox114", "safari16.4"],
  },
}))
