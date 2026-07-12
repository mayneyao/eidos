import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/better-sqlite3.test.ts"],
  },
})
