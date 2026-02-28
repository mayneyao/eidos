import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "./packages/shared/vite/base.config"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      environmentMatchGlobs: [["lib/v3/*.test.ts", "node"]],
    },
  })
)
