import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        serviceBindings: {
          EIDOS_ACCOUNT: async (request: Request) => {
            const users: Record<string, string> = {
              "Bearer alice-token": "alice",
              "Bearer bob-token": "bob",
            }
            const authorization = request.headers.get("authorization")
            const userId = authorization ? users[authorization] : undefined
            return userId
              ? Response.json({ sub: userId, username: userId })
              : Response.json({ error: "invalid_token" }, { status: 401 })
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
