import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "../../shared/service-environment"
import { OfficialSyncClient } from "./official-sync-client"

const staging = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging

describe("OfficialSyncClient", () => {
  it("discovers, lists, and provisions only staging Remote repositories", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (url.endsWith("/.well-known/graft")) {
        return Response.json({
          service: "eidos-graft-remote",
          protocol: "graft-remote",
          version: 1,
          remote_url_template:
            "https://sync-staging.eidos.space/{namespace}/{repository}",
          authentication: {
            scheme: "bearer",
            authority: "https://staging.eidos.space",
          },
        })
      }
      if (init?.method === "PUT") {
        return Response.json({
          created: true,
          namespace: "u-alice",
          repository: "project",
          remote_url: "https://sync-staging.eidos.space/u-alice/project",
        })
      }
      return Response.json({
        namespace: "u-alice",
        repositories: [
          {
            name: "project",
            created_at: 123,
            remote_url: "https://sync-staging.eidos.space/u-alice/project",
          },
        ],
      })
    }) as unknown as typeof fetch
    const client = new OfficialSyncClient(staging, fetchImpl)
    await expect(client.listRepositories("secret")).resolves.toEqual({
      namespace: "u-alice",
      repositories: [
        {
          name: "project",
          createdAtMs: 123,
          remoteUrl: "https://sync-staging.eidos.space/u-alice/project",
        },
      ],
    })
    await expect(
      client.provisionRepository("project", "secret")
    ).resolves.toMatchObject({ created: true, repository: "project" })
    expect(
      requests.every(({ url }) => url.startsWith(staging.syncRemoteOrigin))
    ).toBe(true)
    expect(requests.some(({ url }) => url.includes("secret"))).toBe(false)
  })

  it("rejects a production URL returned to the staging client", async () => {
    const client = new OfficialSyncClient(
      staging,
      vi.fn(async () =>
        Response.json({
          namespace: "u-alice",
          repositories: [
            {
              name: "project",
              created_at: 123,
              remote_url: "https://sync.eidos.space/u-alice/project",
            },
          ],
        })
      )
    )
    await expect(client.listRepositories("secret")).rejects.toThrow(
      "invalid repository entry"
    )
  })

  it("maps structured authentication, quota, and rate-limit failures", async () => {
    const unauthorized = new OfficialSyncClient(
      staging,
      vi.fn(async () => Response.json({}, { status: 401 }))
    )
    await expect(
      unauthorized.listRepositories("expired")
    ).rejects.toMatchObject({ code: "authentication-required", status: 401 })
    const quota = new OfficialSyncClient(
      staging,
      vi.fn(async () => Response.json({}, { status: 413 }))
    )
    await expect(quota.listRepositories("token")).rejects.toMatchObject({
      code: "quota-exceeded",
      status: 413,
    })
    const rateLimited = new OfficialSyncClient(
      staging,
      vi.fn(async () =>
        Response.json(
          {},
          {
            status: 429,
            headers: { "Retry-After": "7" },
          }
        )
      )
    )
    await expect(rateLimited.listRepositories("token")).rejects.toMatchObject({
      code: "rate-limited",
      status: 429,
      retryAfterMs: 7_000,
    })
  })
})
