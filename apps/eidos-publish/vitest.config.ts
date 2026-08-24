import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

const freeAccess = {
  version: 1,
  revision: 0,
  service: "eidos_publish",
  state: "active",
  plan: "free",
  tier: "publish",
  handle: false,
  privatePublications: false,
  removeBranding: false,
  maxStorageBytes: "1073741824",
  maxObjectBytes: "1073741824",
  maxEidosFileBytes: "268435456",
  retentionDays: 1,
  runtimeSecondsPerPeriod: "18000",
  runtimeStartsPerPeriod: 100,
  runtimeIdleSeconds: 60,
  runtimeIsolation: "shared",
  collect: {
    submissionsPerPeriod: 100,
    maxSubmissionBodyBytes: 262144,
    maxAttachmentsPerSubmission: 3,
    maxFormAttachmentBytes: "10485760",
    maxInboxBytes: "268435456",
    importedRetentionDays: 7,
    passwordForms: false,
    emailNotifications: false,
  },
} as const

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          ORCHESTRATION_MODE: "control-only-test",
          RUNTIME_TICKET_SECRET:
            "test-only-runtime-ticket-secret-32-bytes-minimum",
          PUBLISH_VIEWER_EXCHANGE_SECRET:
            "test-only-viewer-exchange-secret-32-bytes-minimum",
          PUBLISH_SERVICE_SECRET:
            "test-only-publish-service-secret-32-bytes-minimum",
          PUBLISH_PASSWORD_PEPPER:
            "test-only-publish-password-pepper-32-bytes-minimum",
          PUBLISH_PASSWORD_SESSION_SECRET:
            "test-only-publish-password-session-32-bytes-minimum",
          PUBLISH_FORM_INTENT_SECRET:
            "test-only-publish-form-intent-secret-32-bytes-minimum",
        },
        serviceBindings: {
          EIDOS_RELAY: async (request: Request) => {
            return Response.json({
              service: "eidos-file-relay",
              hostname: new URL(request.url).hostname,
            })
          },
          EIDOS_ACCOUNT: async (request: Request) => {
            const url = new URL(request.url)
            if (
              request.method === "POST" &&
              url.pathname === "/api/publish/viewer-authorize" &&
              request.headers.get("x-eidos-publish-exchange") ===
                "test-only-viewer-exchange-secret-32-bytes-minimum"
            ) {
              const body = await request.json<{ code: string }>()
              return Response.json({
                userId: "pro-user",
                publicationSlug:
                  body.code === "b".repeat(43) || body.code === "c".repeat(43)
                    ? "feedback"
                    : "private-data",
                sessionId:
                  body.code === "c".repeat(43)
                    ? "session-revoked"
                    : "session-active",
              })
            }
            if (
              request.method === "POST" &&
              url.pathname === "/api/publish/viewer-session" &&
              request.headers.get("x-eidos-publish-exchange") ===
                "test-only-viewer-exchange-secret-32-bytes-minimum"
            ) {
              const body = await request.json<{ sessionId: string }>()
              return Response.json({
                active: body.sessionId === "session-active",
              })
            }
            if (
              request.method === "POST" &&
              url.pathname === "/api/publish/internal-userinfo" &&
              request.headers.get("x-eidos-publish-service") ===
                "test-only-publish-service-secret-32-bytes-minimum"
            ) {
              const body = await request.json<{ userId: string }>()
              const pro =
                body.userId === "pro-user" ||
                body.userId === "pro-collision-user"
              return Response.json({
                sub: body.userId,
                publish_access: pro
                  ? {
                      ...freeAccess,
                      revision: 2,
                      plan: "pro",
                      handle: true,
                      privatePublications: true,
                      removeBranding: true,
                      maxStorageBytes: "10737418240",
                      maxObjectBytes: "1073741824",
                      retentionDays: 30,
                      runtimeSecondsPerPeriod: "360000",
                      runtimeStartsPerPeriod: 2000,
                      runtimeIdleSeconds: 600,
                      collect: {
                        ...freeAccess.collect,
                        submissionsPerPeriod: 5000,
                        maxSubmissionBodyBytes: 1048576,
                        maxAttachmentsPerSubmission: 20,
                        maxFormAttachmentBytes: "104857600",
                        maxInboxBytes: "5368709120",
                        importedRetentionDays: 30,
                        passwordForms: true,
                        emailNotifications: true,
                      },
                    }
                  : body.userId === "downgrade-user"
                    ? { ...freeAccess, revision: 3, state: "blocked" }
                    : freeAccess,
              })
            }
            const authorization = request.headers.get("authorization")
            if (authorization?.startsWith("Bearer free-")) {
              return Response.json({
                sub: authorization.slice("Bearer ".length),
                publish_access: freeAccess,
              })
            }
            if (authorization === "Bearer blocked-token") {
              return Response.json({
                sub: "blocked-user",
                publish_access: { ...freeAccess, state: "blocked" },
              })
            }
            if (
              authorization === "Bearer pro-token" ||
              authorization === "Bearer pro-collision-token" ||
              authorization === "Bearer downgrade-token"
            ) {
              return Response.json({
                sub:
                  authorization === "Bearer pro-token"
                    ? "pro-user"
                    : authorization === "Bearer pro-collision-token"
                      ? "pro-collision-user"
                      : "downgrade-user",
                publish_access: {
                  ...freeAccess,
                  revision: 2,
                  plan: "pro",
                  handle: true,
                  privatePublications: true,
                  removeBranding: true,
                  maxStorageBytes: "10737418240",
                  maxObjectBytes: "1073741824",
                  retentionDays: 30,
                  runtimeSecondsPerPeriod: "360000",
                  runtimeStartsPerPeriod: 2000,
                  runtimeIdleSeconds: 600,
                  collect: {
                    ...freeAccess.collect,
                    submissionsPerPeriod: 5000,
                    maxSubmissionBodyBytes: 1048576,
                    maxAttachmentsPerSubmission: 20,
                    maxFormAttachmentBytes: "104857600",
                    maxInboxBytes: "5368709120",
                    importedRetentionDays: 30,
                    passwordForms: true,
                    emailNotifications: true,
                  },
                },
              })
            }
            return Response.json({ error: "invalid_token" }, { status: 401 })
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
