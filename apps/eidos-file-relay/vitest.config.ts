import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        serviceBindings: {
          EIDOS_PUBLISH: async (request: Request) =>
            Response.json({
              service: "eidos-publish",
              hostname: new URL(request.url).hostname,
              target:
                new URL(request.url).pathname + new URL(request.url).search,
            }),
          EIDOS_ACCOUNT: async (request: Request) => {
            const url = new URL(request.url)
            if (
              url.pathname === "/api/auth/oauth2/token" &&
              request.method === "POST"
            ) {
              const form = new URLSearchParams(await request.text())
              const user =
                form.get("code") === "alice-code"
                  ? "alice"
                  : form.get("code") === "bob-code"
                    ? "bob"
                    : null
              return user
                ? Response.json({
                    access_token: `${user}-token`,
                    token_type: "Bearer",
                  })
                : Response.json({ error: "invalid_grant" }, { status: 400 })
            }
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
