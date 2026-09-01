import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5180",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: true,
  },
})
