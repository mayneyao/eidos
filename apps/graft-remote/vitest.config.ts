import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          SYNC_ACCESS_ENFORCEMENT: "enforce",
          SYNC_QUOTA_ENFORCEMENT: "shadow",
        },
        serviceBindings: {
          EIDOS_ACCOUNT: async (request: Request) => {
            const users: Record<string, string> = {
              "Bearer alice-token": "alice",
              "Bearer bob-token": "bob",
            }
            const authorization = request.headers.get("authorization")
            const userId =
              authorization === null ? undefined : users[authorization]
            return userId === undefined
              ? Response.json({ error: "invalid_token" }, { status: 401 })
              : Response.json({
                  id: userId,
                  sync_access: {
                    version: 1,
                    revision: 1,
                    service: "eidos_sync",
                    access: "read_write",
                    quotaBytes: 10 * 1024 * 1024 * 1024,
                    deviceLimit: 0,
                  },
                })
          },
        },
      },
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    coverage: { enabled: false },
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            "vitest",
            "@vitest/expect",
            "@vitest/mocker",
            "@vitest/runner",
            "@vitest/snapshot",
            "@vitest/spy",
            "@vitest/utils",
          ],
        },
      },
    },
    include: ["test/**/*.worker.ts"],
  },
})
