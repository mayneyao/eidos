// vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    environmentMatchGlobs: [
      ["lib/v3/*.test.ts", "node"],
    ],
  },
}))
