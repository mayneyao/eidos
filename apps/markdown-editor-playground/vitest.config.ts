import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
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
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
