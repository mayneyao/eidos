import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@eidos.space/eidos-file-ui/styles.css": path.resolve(
        directory,
        "../../packages/eidos-file-ui/src/styles.css"
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
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
