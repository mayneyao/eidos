import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@eidos.space/markdown-editor": path.resolve(
        directory,
        "../../packages/markdown-editor/src/index.ts"
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
