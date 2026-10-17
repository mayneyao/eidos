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

const remote = {
  usage: vi.fn().mockResolvedValue({
    usedBytes: 2_147_483_648,
    reservedBytes: 536_870_912,
    quotaBytes: 10_737_418_240,
    remainingBytes: 8_053_063_680,
  }),
} as unknown as OfficialSyncClient

describe("SyncControlPlane", () => {
  function writableControl() {
    const account = accountSession("signed-in")
    vi.mocked(account.authorization).mockResolvedValue({
      subject: "user-1",
      access: {
        version: 1,
        revision: 1,
        service: "eidos_sync",
        access: "read_write",
        quotaBytes: 1024,
        deviceLimit: 0,
      },
    })
    const operations = {
      discover: vi.fn(async () => {}),
      listRepositories: vi.fn(async () => ({
        namespace: "u-alice",
        repositories: [],
      })),
      provisionRepository: vi.fn(async () => ({
        created: true,
        namespace: "u-alice",
        repository: "space",
        remoteUrl: "https://sync-staging.eidos.space/u-alice/space",
      })),
      usage: vi.fn(async () => ({
        usedBytes: 0,
        reservedBytes: 0,
        quotaBytes: 1024,
        remainingBytes: 1024,
      })),
    }
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      account,
      operations as unknown as OfficialSyncClient
    )
    return { account, operations, control }
  }

  it("binds repository operations to one context without reading another token", async () => {
    const { account, operations, control } = writableControl()
    const context = await control.operationContext()
    vi.mocked(account.accessToken).mockClear().mockResolvedValue("later-token")
    await control.provisionRepository("space", "Notes", false, context)
    await control.repositories(context)
    expect(account.accessToken).not.toHaveBeenCalled()
    expect(operations.provisionRepository).toHaveBeenCalledWith(
      "space",
      "Notes",
      "oauth-access-token"
    )
    expect(operations.listRepositories).toHaveBeenCalledWith(
      "oauth-access-token"
    )
    expect(context.subject).toBe("user-1")
  })

  it("invalidates a prepared operation after logout and login to the same account", async () => {
    const { operations, control } = writableControl()
    const context = await control.operationContext()
    await control.signOut()
    await control.signIn()
    expect(() => context.assertCurrent()).toThrow("account changed")
    await expect(
      control.provisionRepository("space", "Notes", true, context)
    ).rejects.toThrow("account changed")
    expect(operations.provisionRepository).not.toHaveBeenCalled()
    const current = await control.operationContext()
    expect(() => current.assertCurrent()).not.toThrow()
  })

  it("rejects account changes while acquiring an operation context", async () => {
    const { account, control } = writableControl()
    let resolve!: (
      value: Awaited<ReturnType<AccountSessionService["authorization"]>>
    ) => void
    const authorization = await account.authorization()
    vi.mocked(account.authorization).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const context = control.operationContext()
    const rejected = expect(context).rejects.toThrow("account changed")
    await control.signOut()
    resolve(authorization)
    await rejected
    expect(account.accessToken).not.toHaveBeenCalled()
  })

  it("does not let an obsolete sign-in block or invalidate a newer account", async () => {
    const { account, control } = writableControl()
    let finishOld!: (
      value: Awaited<ReturnType<AccountSessionService["signIn"]>>
    ) => void
    vi.mocked(account.signIn).mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve
      })
    )
    const old = control.signIn()
    const rejected = expect(old).rejects.toThrow("account changed")
    await control.signOut()
    await control.signIn()
    const current = await control.operationContext()
    finishOld({ state: "signed-in", user: { id: "user-1" } })
    await rejected
    expect(() => current.assertCurrent()).not.toThrow()
  })

  it("rejects a status read that finishes with another account's usage", async () => {
    const { operations, control } = writableControl()
    let finishUsage!: (
      value: Awaited<ReturnType<typeof operations.usage>>
    ) => void
    operations.usage.mockReturnValueOnce(
      new Promise((resolve) => {
        finishUsage = resolve
      })
    )
    const status = control.status()
    const rejected = expect(status).rejects.toThrow("account changed")
    await vi.waitFor(() => expect(operations.usage).toHaveBeenCalledOnce())
    await control.signOut()
    finishUsage({
      usedBytes: 0,
      reservedBytes: 0,
      quotaBytes: 1024,
      remainingBytes: 1024,
    })
    await rejected
  })

  it("rejects delayed repository results after logout", async () => {
    const { operations, control } = writableControl()
    let resolve!: (value: { namespace: string; repositories: [] }) => void
    operations.listRepositories.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const context = await control.operationContext()
    const listing = control.repositories(context)
    const rejected = expect(listing).rejects.toThrow("account changed")
    await vi.waitFor(() =>
      expect(operations.listRepositories).toHaveBeenCalledOnce()
    )
    await control.signOut()
    resolve({ namespace: "u-alice", repositories: [] })
    await rejected
  })

  it("rejects a context from another service environment", async () => {
    const first = writableControl()
    const other = writableControl()
    const context = await first.control.operationContext()
    await expect(other.control.repositories(context)).rejects.toThrow(
      "another account environment"
    )
    expect(other.operations.listRepositories).not.toHaveBeenCalled()
  })

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
      blocker: { code: "access-required" },
    })
  })

  it("exposes the signed-in account token for Publish without Sync entitlement", async () => {
    const account = accountSession("signed-in")
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      account,
      remote
    )

    await expect(control.accountAccessToken()).resolves.toBe(
      "oauth-access-token"
    )
    expect(account.authorization).not.toHaveBeenCalled()
  })

  it("reads Publish account presence without checking Sync entitlement", async () => {
    const account = accountSession("signed-in")
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      account,
      remote
    )

    await expect(control.accountStatus()).resolves.toEqual({
      state: "signed-in",
      user: { id: "user-1", email: "person@example.com" },
    })
    expect(account.authorization).not.toHaveBeenCalled()
  })

  it("scopes Publish state to the signed-in account identity", async () => {
    const signedIn = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      accountSession("signed-in"),
      remote
    )
    const signedOut = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      accountSession("signed-out"),
      remote
    )

    await expect(signedIn.accountSubject()).resolves.toBe("user-1")
    await expect(signedOut.accountSubject()).rejects.toThrow(
      "Sign in to Eidos first."
    )
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
      entitlement: {
        state: "read-write",
        usedBytes: 2_147_483_648,
        reservedBytes: 536_870_912,
        quotaBytes: 10_737_418_240,
        remainingBytes: 8_053_063_680,
      },
      canEnable: true,
      canClone: true,
      blocker: null,
    })
  })

  it("previews an expired read-only entitlement in development", async () => {
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
      remote,
      true
    )

    await expect(control.status()).resolves.toMatchObject({
      entitlement: { state: "read-only" },
      canEnable: false,
      canClone: true,
      blocker: { code: "read-only" },
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

    await expect(
      control.provisionRepository("space-id", "Research")
    ).resolves.toEqual({
      remoteUrl: "https://sync-staging.eidos.space/u-alice/space-id",
      accessToken: "oauth-access-token",
    })
    expect(provisionRepository).toHaveBeenCalledWith(
      "space-id",
      "Research",
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

  it("repairs only untouched legacy repository display names", async () => {
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
        access: "read_write",
        quotaBytes: 1024,
        deviceLimit: 0,
      },
    })
    const remoteUrl = "https://sync-staging.eidos.space/u-alice/legacy-space-id"
    const discover = vi.fn().mockResolvedValue(undefined)
    const listRepositories = vi.fn().mockResolvedValue({
      namespace: "u-alice",
      repositories: [
        {
          name: "legacy-space-id",
          displayName: "legacy-space-id",
          createdAtMs: 1,
          remoteUrl,
        },
      ],
    })
    const renameRepository = vi.fn().mockResolvedValue(undefined)
    const control = new SyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging,
      account as unknown as AccountSessionService,
      {
        discover,
        listRepositories,
        renameRepository,
      } as unknown as OfficialSyncClient
    )

    await expect(
      control.repairLegacyRepositoryDisplayName(remoteUrl, "Research")
    ).resolves.toBe(true)
    expect(renameRepository).toHaveBeenCalledWith(
      "legacy-space-id",
      "Research",
      "oauth-access-token"
    )

    listRepositories.mockResolvedValueOnce({
      namespace: "u-alice",
      repositories: [
        {
          name: "legacy-space-id",
          displayName: "My custom name",
          createdAtMs: 1,
          remoteUrl,
        },
      ],
    })
    await expect(
      control.repairLegacyRepositoryDisplayName(remoteUrl, "Research")
    ).resolves.toBe(false)
    expect(renameRepository).toHaveBeenCalledTimes(1)
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
      repositories: [
        {
          name: "project-space",
          displayName: "Project Space",
          createdAtMs: 1,
          remoteUrl,
        },
      ],
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
