import { describe, expect, it, vi } from "vitest"

import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "../../shared/service-environment"
import type { AccountSessionService } from "../account/account-session"
import type { OfficialSyncClient } from "./official-sync-client"
import { SyncControlPlane } from "./sync-control-plane"

function accountSession(state: "signed-out" | "signed-in") {
  const status =
    state === "signed-in"
      ? { state, user: { id: "user-1", email: "person@example.com" } }
      : { state }
  return {
    status: vi.fn().mockResolvedValue(status),
    signIn: vi.fn().mockResolvedValue({
      state: "signed-in",
      user: { id: "user-1", email: "person@example.com" },
    }),
    signOut: vi.fn().mockResolvedValue({ state: "signed-out" }),
    authorization: vi.fn().mockResolvedValue({
      subject: "user-1",
      access: null,
    }),
    accessToken: vi.fn().mockResolvedValue("oauth-access-token"),
  } as unknown as AccountSessionService
}

const remote = {} as OfficialSyncClient

describe("SyncControlPlane", () => {
  it("keeps local use signed out and gates Remote provisioning", async () => {
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      accountSession("signed-out"),
      remote
    )

    await expect(control.status()).resolves.toMatchObject({
      environment: "staging",
      account: { state: "signed-out" },
      entitlement: { state: "not-checked" },
      device: { state: "not-registered" },
      remote: { state: "not-connected" },
      canEnable: false,
      canClone: false,
      blocker: { code: "authentication-required" },
    })
  })

  it("binds the device but does not grant access without a subscription", async () => {
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      accountSession("signed-out"),
      remote
    )

    await expect(control.signIn()).resolves.toMatchObject({
      account: {
        state: "signed-in",
        user: { email: "person@example.com" },
      },
      device: { state: "active" },
      entitlement: { state: "none" },
      canEnable: false,
      canClone: false,
      blocker: { code: "subscription-required" },
    })
  })

  it("projects a narrow read-write grant without exposing Billing fields", async () => {
    const account = accountSession("signed-in") as unknown as {
      authorization: ReturnType<typeof vi.fn>
    }
    account.authorization.mockResolvedValue({
      subject: "user-1",
      access: {
        version: 1,
        revision: 4,
        service: "eidos_sync",
        access: "read_write",
        quotaBytes: 10_737_418_240,
        deviceLimit: 0,
      },
    })
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      account as unknown as AccountSessionService,
      remote
    )

    await expect(control.status()).resolves.toMatchObject({
      device: { state: "active" },
      entitlement: { state: "read-write", quotaBytes: 10_737_418_240 },
      canEnable: true,
      canClone: true,
      blocker: null,
    })
  })

  it("returns to the signed-out gate after logout", async () => {
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.production,
      accountSession("signed-in"),
      remote
    )

    await expect(control.signOut()).resolves.toMatchObject({
      environment: "production",
      account: { state: "signed-out" },
      blocker: { code: "authentication-required" },
    })
  })

  it("provisions only after the account returns a read-write grant", async () => {
    const account = accountSession("signed-in") as unknown as {
      authorization: ReturnType<typeof vi.fn>
      accessToken: ReturnType<typeof vi.fn>
    }
    account.authorization.mockResolvedValue({
      subject: "user-1",
      access: {
        version: 1,
        revision: 4,
        service: "eidos_sync",
        access: "read_write",
        quotaBytes: 1024,
        deviceLimit: 0,
      },
    })
    const provisionRepository = vi.fn().mockResolvedValue({
      created: true,
      namespace: "u-alice",
      repository: "space-id",
      remoteUrl: "https://sync-staging.eidos.space/u-alice/space-id",
    })
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      account as unknown as AccountSessionService,
      { provisionRepository } as unknown as OfficialSyncClient
    )

    await expect(control.provisionRepository("space-id")).resolves.toEqual({
      remoteUrl: "https://sync-staging.eidos.space/u-alice/space-id",
      accessToken: "oauth-access-token",
    })
    expect(provisionRepository).toHaveBeenCalledWith(
      "space-id",
      "oauth-access-token"
    )
  })

  it("keeps an inactive entitlement as a typed policy pause", async () => {
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      accountSession("signed-in"),
      remote
    )

    await expect(control.repositoryAccess()).rejects.toMatchObject({
      code: "entitlement-inactive",
    })
  })

  it("lists and re-authorizes only repositories owned by the account", async () => {
    const account = accountSession("signed-in") as unknown as {
      authorization: ReturnType<typeof vi.fn>
      accessToken: ReturnType<typeof vi.fn>
    }
    account.authorization.mockResolvedValue({
      subject: "user-1",
      access: {
        version: 1,
        revision: 5,
        service: "eidos_sync",
        access: "read_only",
        quotaBytes: 1024,
        deviceLimit: 0,
      },
    })
    const remoteUrl = "https://sync-staging.eidos.space/u-alice/project-space"
    const listRepositories = vi.fn().mockResolvedValue({
      namespace: "u-alice",
      repositories: [{ name: "project-space", createdAtMs: 1, remoteUrl }],
    })
    const discover = vi.fn().mockResolvedValue(undefined)
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      account as unknown as AccountSessionService,
      { discover, listRepositories } as unknown as OfficialSyncClient
    )

    await expect(control.repositories()).resolves.toMatchObject({
      namespace: "u-alice",
      repositories: [{ remoteUrl }],
    })
    await expect(control.repositoryAccess(remoteUrl)).resolves.toEqual({
      accessToken: "oauth-access-token",
      access: "read_only",
    })
    await expect(
      control.repositoryAccess(
        "https://sync-staging.eidos.space/u-alice/not-owned"
      )
    ).rejects.toMatchObject({
      code: "remote-not-found",
    })
    expect(discover).toHaveBeenCalledTimes(3)
  })
})
