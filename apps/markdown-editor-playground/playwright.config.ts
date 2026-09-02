import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5181",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command:
      "pnpm run build && pnpm exec vite preview --host 127.0.0.1 --port 5181 --strictPort",
    url: "http://127.0.0.1:5181",
    reuseExistingServer: false,
  },
})
