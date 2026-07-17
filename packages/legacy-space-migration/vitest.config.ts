import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const packageRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@eidos.space/eidos-file/better-sqlite3",
        replacement: path.resolve(
          packageRoot,
          "../eidos-file/src/better-sqlite3.ts"
        ),
      },
      {
        find: "@eidos.space/eidos-file",
        replacement: path.resolve(packageRoot, "../eidos-file/src/index.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    globals: true,
  },
})
