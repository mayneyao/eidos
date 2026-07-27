import { describe, expect, it, vi } from "vitest"

import {
  actionableGraftRemoteError,
  EidosSyncError,
  isOfficialGraftRemoteUrl,
  OfficialGraftRemoteClient,
  OfficialGraftRemoteService,
} from "./official-graft-remote"

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const discovery = {
  service: "eidos-graft-remote",
  protocol: "graft-remote",
  version: 1,
  remote_url_template: "https://sync.eidos.space/{namespace}/{repository}",
  authentication: { scheme: "bearer", authority: "https://eidos.space" },
}

describe("OfficialGraftRemoteClient", () => {
  it("discovers, lists, and provisions canonical HTTP Remote v1 repositories", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(discovery))
      .mockResolvedValueOnce(
        json(
          {
            namespace: "u-alice",
            repository: "space-1",
            remote_url: "https://sync.eidos.space/u-alice/space-1",
            created: true,
          },
          201
        )
      )
      .mockResolvedValueOnce(
        json({
          namespace: "u-alice",
          repositories: [
            {
              name: "space-1",
              created_at: 42,
              remote_url: "graft+https://sync.eidos.space/u-alice/space-1",
            },
          ],
        })
      )
    const client = new OfficialGraftRemoteClient(
      "https://sync.eidos.space",
      fetchImpl
    )

    const provisioned = await client.provisionRepository("space-1", "secret")
    const listed = await client.listRepositories("secret")

    expect(provisioned).toMatchObject({
      created: true,
      repository: "space-1",
      remoteUrl: "https://sync.eidos.space/u-alice/space-1",
    })
    expect(listed.repositories[0]).toMatchObject({
      name: "space-1",
      remoteUrl: "graft+https://sync.eidos.space/u-alice/space-1",
    })
    const headers = fetchImpl.mock.calls[1][1]?.headers as Headers
    expect(headers.get("Authorization")).toBe("Bearer secret")
  })

  it("rejects credentials, query strings, foreign origins, and non-HTTP remotes", () => {
    expect(
      isOfficialGraftRemoteUrl("https://sync.eidos.space/u/repository")
    ).toBe(true)
    expect(
      isOfficialGraftRemoteUrl("graft+https://sync.eidos.space/u/repository")
    ).toBe(true)
    expect(
      isOfficialGraftRemoteUrl("https://token@sync.eidos.space/u/repository")
    ).toBe(false)
    expect(
      isOfficialGraftRemoteUrl("https://sync.eidos.space/u/repository?token=x")
    ).toBe(false)
    expect(isOfficialGraftRemoteUrl("https://example.test/u/repository")).toBe(
      false
    )
    expect(isOfficialGraftRemoteUrl("s3://bucket/repository")).toBe(false)
  })

  it.each([
    [401, "session expired"],
    [403, "denied access"],
    [404, "not found"],
    [409, "changed concurrently"],
    [426, "newer Desktop"],
    [503, "temporarily unavailable"],
  ])("maps HTTP %i to an actionable error", (status, expectedMessage) => {
    expect(
      actionableGraftRemoteError(new Error(`remote server returned ${status}`))
        .message
    ).toContain(expectedMessage)
  })

  it("explains how to initialize an empty official repository", () => {
    expect(
      actionableGraftRemoteError(
        new Error("remote `origin` has no branch `main`")
      ).message
    ).toContain("Push versions")
  })
})

describe("OfficialGraftRemoteService", () => {
  it("refreshes once after 401 and never persists or returns the token", async () => {
    const credentials = {
      getAccessToken: vi.fn().mockResolvedValue("expired-token"),
      refreshTokens: vi.fn().mockResolvedValue({ access_token: "fresh-token" }),
    }
    const client = {
      discover: vi.fn(),
      listRepositories: vi
        .fn()
        .mockRejectedValueOnce(new EidosSyncError("unauthorized", 401))
        .mockResolvedValueOnce({ namespace: "u", repositories: [] }),
      provisionRepository: vi.fn(),
    }
    const service = new OfficialGraftRemoteService(credentials as never)
    ;(service as unknown as { client: typeof client }).client = client

    await expect(service.listRepositories()).resolves.toEqual({
      namespace: "u",
      repositories: [],
    })
    expect(client.listRepositories).toHaveBeenNthCalledWith(1, "expired-token")
    expect(client.listRepositories).toHaveBeenNthCalledWith(2, "fresh-token")
    expect(credentials.refreshTokens).toHaveBeenCalledTimes(1)
  })

  it("does not retry CAS conflicts or service failures", async () => {
    const credentials = {
      getAccessToken: vi.fn().mockResolvedValue("token"),
      refreshTokens: vi.fn(),
    }
    const client = {
      discover: vi.fn(),
      listRepositories: vi.fn(),
      provisionRepository: vi
        .fn()
        .mockRejectedValue(new EidosSyncError("conflict", 409)),
    }
    const service = new OfficialGraftRemoteService(credentials as never)
    ;(service as unknown as { client: typeof client }).client = client

    await expect(service.provisionRepository("space-1")).rejects.toThrow(
      "remote changed concurrently"
    )
    expect(credentials.refreshTokens).not.toHaveBeenCalled()
    expect(client.provisionRepository).toHaveBeenCalledTimes(1)
  })
})
