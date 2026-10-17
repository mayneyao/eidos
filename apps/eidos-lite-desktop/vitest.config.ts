import { fileURLToPath } from "node:url"
import path from "node:path"
import { defineConfig } from "vitest/config"

import { eidosFileUiSourceAliases } from "../../packages/eidos-file-ui/vite-source-aliases"
import { markdownEditorSourceAliases } from "../../packages/markdown/vite-source-aliases"
import { readGraftSourceSnapshotPolicy } from "./scripts/graft-snapshot-policy.mjs"

const appRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  define: {
    __EIDOS_LITE_GRAFT_SOURCE_SNAPSHOT__: JSON.stringify(
      readGraftSourceSnapshotPolicy(path.resolve(appRoot, "../.."))
    ),
  },
  resolve: {
    alias: [
      {
        find: /^@eidos\.space\/plugin-runtime\/(.+)$/,
        replacement: path.resolve(
          appRoot,
          "../../packages/plugin-runtime/src/$1.ts"
        ),
      },
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
