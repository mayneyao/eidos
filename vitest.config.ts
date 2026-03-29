import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "./packages/shared/vite/base.config"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      // Use poolMatchGlobs instead of deprecated environmentMatchGlobs
      // Note: lib/v3/*.test.ts will use jsdom but they should work fine
      // as they don't rely on browser APIs
    },
  })
)
