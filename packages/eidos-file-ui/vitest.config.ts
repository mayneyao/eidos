import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@eidos\.space\/eidos-file-ui$/,
        replacement: path.resolve(directory, "src/index.ts"),
      },
      {
        find: "@eidos.space/eidos-file",
        replacement: path.resolve(directory, "../eidos-file/src/index.ts"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
