import { fileURLToPath } from "node:url"
import path from "node:path"
import { defineConfig } from "vitest/config"

import { eidosFileUiSourceAliases } from "../../packages/eidos-file-ui/vite-source-aliases"
import { markdownEditorSourceAliases } from "../../packages/markdown-editor/vite-source-aliases"

const appRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      ...eidosFileUiSourceAliases(),
      ...markdownEditorSourceAliases(),
      {
        find: "@eidos.space/eidos-file/node-sqlite",
        replacement: path.resolve(
          appRoot,
          "../../packages/eidos-file/src/node-sqlite.ts"
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
    include: ["src/**/*.test.{ts,tsx}"],
    maxWorkers: 1,
  },
})
