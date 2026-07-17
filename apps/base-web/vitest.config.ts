import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@eidos.space/base-ui/styles.css": path.resolve(
        directory,
        "../../packages/base-ui/src/styles.css"
      ),
      "@eidos.space/base": path.resolve(
        directory,
        "../../packages/base/src/index.ts"
      ),
      "@eidos.space/base-ui": path.resolve(
        directory,
        "../../packages/base-ui/src/index.ts"
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
