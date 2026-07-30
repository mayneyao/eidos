import { fileURLToPath } from "node:url"
import path from "node:path"
import { defineConfig } from "vitest/config"

const appRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@eidos.space/eidos-file-ui/runtime-editor-data-source",
        replacement: path.resolve(
          appRoot,
          "../../packages/eidos-file-ui/src/runtime-editor-data-source.ts"
        ),
      },
      {
        find: "@eidos.space/eidos-file/better-sqlite3",
        replacement: path.resolve(
          appRoot,
          "../../packages/eidos-file/src/better-sqlite3.ts"
        ),
      },
      {
        find: "@eidos.space/eidos-file",
        replacement: path.resolve(
          appRoot,
          "../../packages/eidos-file/src/index.ts"
        ),
      },
    ],
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    maxWorkers: 1,
  },
})
