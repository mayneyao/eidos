import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../"
)

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: [
      {
        find: /^electron$/,
        replacement: path.join(
          repoRoot,
          "apps/desktop/electron/modules/space-migration/electron.test-stub.ts"
        ),
      },
      {
        find: "@eidos.space/legacy-space-migration/better-sqlite3",
        replacement: path.join(
          repoRoot,
          "packages/legacy-space-migration/src/better-sqlite3.ts"
        ),
      },
      {
        find: "@eidos.space/legacy-space-migration",
        replacement: path.join(
          repoRoot,
          "packages/legacy-space-migration/src/index.ts"
        ),
      },
      {
        find: "@eidos.space/eidos-file/better-sqlite3",
        replacement: path.join(
          repoRoot,
          "packages/eidos-file/src/better-sqlite3.ts"
        ),
      },
      {
        find: "@eidos.space/eidos-file",
        replacement: path.join(repoRoot, "packages/eidos-file/src/index.ts"),
      },
      {
        find: "@eidos.space/electron-ipc",
        replacement: path.join(repoRoot, "packages/electron-ipc/src/index.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    globals: true,
  },
})
