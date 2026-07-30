import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/node-sqlite.test.ts"],
    maxWorkers: 1,
  },
})
