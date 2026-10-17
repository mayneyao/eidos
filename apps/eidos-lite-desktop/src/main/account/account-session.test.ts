import type { AccountSyncClient } from "./account-sync-client"
import { AccountSessionService } from "./account-session"
import type { SecureAccountCredentialStore } from "./credential-store"
import type { StoredAccountSession } from "./credential-store"
import type { DeviceIdentityStore } from "./device-identity"
import { OAuthLoopbackCallback } from "./loopback-callback"
import type { EidosOAuthClient } from "./oauth-client"
import { EidosOAuthError } from "./oauth-client"

describe("AccountSessionService", () => {
  function raceFixture(
    options: Partial<
      Pick<
        ConstructorParameters<typeof AccountSessionService>[4],
        "callbackFactory" | "callbackPort"
      >
    > = {}
  ) {
    const device = {
      id: "device-1",
      displayName: "Test Mac",
      platform: "macos" as const,
      appVersion: "0.1.0",
      status: "active" as const,
      version: 1,
    }
    let stored: StoredAccountSession | null = {
      tokens: {
        accessToken: "expired-a",
        refreshToken: "refresh-a",
        tokenType: "Bearer",
        expiresIn: 1,
        storedAtMs: 1,
      },
      user: { id: "user-a" },
      device,
    }
    const tokens = {
      accessToken: "fresh-a",
      refreshToken: "refresh-a-new",
      tokenType: "Bearer",
      expiresIn: 3600,
      storedAtMs: Date.now(),
    }
    const credentials = {
      read: vi.fn(async () => stored),
      write: vi.fn(async (value: StoredAccountSession) => {
        stored = value
      }),
      clear: vi.fn(async () => {
        stored = null
      }),
    }
    const oauth = {
      refresh: vi.fn(async () => tokens),
      createAuthorizationRequest: vi.fn(async () => ({
        url: "https://staging.eidos.space/auth",
        state: "state",
        codeVerifier: "verifier",
      })),
      exchangeCode: vi.fn(async () => ({ ...tokens, accessToken: "fresh-b" })),
      userInfo: vi.fn(async () => ({ id: "user-b" })),
    }
    const callback = {
      redirectUri: "http://127.0.0.1:13128/oauth/callback",
      waitForCode: vi.fn(async () => "code"),
      close: vi.fn(),
    }
    const openExternal = vi.fn(async () => {})
    const account = new AccountSessionService(
      oauth as unknown as EidosOAuthClient,
      credentials as unknown as SecureAccountCredentialStore,
      {
        getOrCreate: async () => ({ stableDeviceId: "device" }),
      } as unknown as DeviceIdentityStore,
      {
        registerDevice: async () => device,
        authorization: async (token: string) => ({
          subject: token === "fresh-b" ? "user-b" : "user-a",
          access: null,
        }),
      } as unknown as AccountSyncClient,
      {
        callbackFactory: (async () =>
          callback) as unknown as typeof OAuthLoopbackCallback.listen,
        openExternal,
        device: {
          displayName: "Test Mac",
          platform: "macos",
          appVersion: "0.1.0",
        },
        ...options,
      }
    )
    return { account, oauth, credentials, callback, tokens, openExternal }
  }

  it("cancels a real OAuth listener, reuses its port immediately, and never exchanges a stale callback", async () => {
    const probe = await OAuthLoopbackCallback.listen("probe", 0)
    const port = Number(new URL(probe.redirectUri).port)
    await probe.close()
    const { account, oauth, credentials, openExternal } = raceFixture({
      callbackPort: port,
      callbackFactory: OAuthLoopbackCallback.listen,
    })
    let sequence = 0
    oauth.createAuthorizationRequest.mockImplementation(async () => ({
      url: "https://staging.eidos.space/auth",
      state: `state-${++sequence}`,
      codeVerifier: "verifier",
    }))
    const first = account.signIn()
    const rejected = expect(first).rejects.toThrow("account session changed")
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledOnce())
    await account.signOut()
    await rejected
    expect(credentials.write).not.toHaveBeenCalled()
    const second = account.signIn()
    try {
      await vi.waitFor(() => expect(openExternal).toHaveBeenCalledTimes(2))
      const stale = await fetch(
        `http://127.0.0.1:${port}/oauth/callback?state=state-1&code=old-code`
      )
      expect(stale.status).toBe(400)
      expect(oauth.exchangeCode).not.toHaveBeenCalled()
      const valid = await fetch(
        `http://127.0.0.1:${port}/oauth/callback?state=state-2&code=new-code`
      )
      expect(valid.status).toBe(200)
      await expect(second).resolves.toMatchObject({
        state: "signed-in",
        user: { id: "user-b" },
      })
      expect(oauth.exchangeCode).toHaveBeenCalledExactlyOnceWith(
        "new-code",
        "verifier",
        `http://127.0.0.1:${port}/oauth/callback`
      )
      expect(credentials.write).toHaveBeenCalledOnce()
      expect(await account.status()).toMatchObject({ user: { id: "user-b" } })
    } finally {
      await account.signOut()
      await second.catch(() => undefined)
    }
  })

  it("coalesces concurrent refreshes so rotating tokens are used only once", async () => {
    const { account, oauth, credentials, tokens } = raceFixture()
    let resolve!: (value: typeof tokens) => void
    oauth.refresh.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const first = account.accessToken()
    const second = account.accessToken()
    await vi.waitFor(() => expect(oauth.refresh).toHaveBeenCalledOnce())
    resolve(tokens)
    expect(await Promise.all([first, second])).toEqual(["fresh-a", "fresh-a"])
    expect(credentials.write).toHaveBeenCalledOnce()
  })

  it("does not restore an account when a token refresh completes after logout", async () => {
    const { account, oauth, credentials, tokens } = raceFixture()
    let resolve!: (value: typeof tokens) => void
    oauth.refresh.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const token = account.accessToken()
    const rejected = expect(token).rejects.toThrow("account session changed")
    await vi.waitFor(() => expect(oauth.refresh).toHaveBeenCalledOnce())
    await account.signOut()
    resolve(tokens)
    await rejected
    expect(credentials.write).not.toHaveBeenCalled()
    expect(await account.status()).toEqual({ state: "signed-out" })
  })

  it("waits for an in-flight credential write before completing logout", async () => {
    const { account, credentials } = raceFixture()
    let finishWrite!: () => void
    const persist = credentials.write.getMockImplementation()!
    credentials.write.mockImplementationOnce(async (value) => {
      await new Promise<void>((resolve) => {
        finishWrite = resolve
      })
      await persist(value)
    })
    const token = account.accessToken()
    const rejected = expect(token).rejects.toThrow("account session changed")
    await vi.waitFor(() => expect(credentials.write).toHaveBeenCalledOnce())
    const signedOut = account.signOut()
    finishWrite()
    await Promise.all([rejected, signedOut])
    expect(await account.status()).toEqual({ state: "signed-out" })
  })

  it("discards an OAuth callback that arrives after logout", async () => {
    const { account, callback, credentials, oauth } = raceFixture()
    let resolve!: (code: string) => void
    callback.waitForCode.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const signedIn = account.signIn()
    const rejected = expect(signedIn).rejects.toThrow("account session changed")
    await vi.waitFor(() => expect(callback.waitForCode).toHaveBeenCalledOnce())
    await account.signOut()
    resolve("late-code")
    await rejected
    expect(oauth.exchangeCode).not.toHaveBeenCalled()
    expect(credentials.write).not.toHaveBeenCalled()
    expect(await account.status()).toEqual({ state: "signed-out" })
  })

  it("does not clear a new account when the previous account refresh is rejected", async () => {
    const { account, oauth, credentials } = raceFixture()
    let reject!: (error: Error) => void
    oauth.refresh.mockReturnValueOnce(
      new Promise((_done, fail) => {
        reject = fail
      })
    )
    const token = account.accessToken()
    const rejected = expect(token).rejects.toThrow("revoked old refresh")
    await vi.waitFor(() => expect(oauth.refresh).toHaveBeenCalledOnce())
    await account.signOut()
    await account.signIn()
    credentials.clear.mockClear()
    reject(new EidosOAuthError("revoked old refresh", 400))
    await rejected
    expect(credentials.clear).not.toHaveBeenCalled()
    expect(await account.status()).toMatchObject({
      state: "signed-in",
      user: { id: "user-b" },
    })
  })

  it("binds the Lite OAuth token to a stable device before persisting it", async () => {
    const calls: string[] = []
    const oauth = {
      createAuthorizationRequest: vi.fn(async () => ({
        url: "https://staging.eidos.space/api/auth/oauth2/authorize",
        state: "state",
        codeVerifier: "verifier",
      })),
      exchangeCode: vi.fn(async () => ({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
        expiresIn: 3600,
        storedAtMs: Date.now(),
      })),
      userInfo: vi.fn(async () => ({
        id: "user-1",
        email: "person@example.com",
      })),
    } as unknown as EidosOAuthClient
    const write = vi.fn(async () => {
      calls.push("persist")
    })
    const credentials = {
      read: vi.fn(async () => null),
      write,
      clear: vi.fn(async () => undefined),
    } as unknown as SecureAccountCredentialStore
    const profile = {
      read: vi.fn(async () => null),
      write: vi.fn(async (user: { id: string }) => ({
        ...user,
        verifiedAtMs: Date.now(),
      })),
      clear: vi.fn(async () => undefined),
    }
    const deviceIdentity = {
      getOrCreate: vi.fn(async () => ({
        version: 1,
        stableDeviceId: "0f9a8b7c-6d5e-4f32-a109-876543210abc",
      })),
    } as unknown as DeviceIdentityStore
    const syncClient = {
      registerDevice: vi.fn(async () => {
        calls.push("register")
        return {
          id: "device-1",
          displayName: "Test Mac",
          platform: "macos",
          appVersion: "0.1.0",
          status: "active",
          version: 1,
        }
      }),
      authorization: vi.fn(async () => {
        calls.push("authorize")
        return {
          subject: "user-1",
          access: {
            version: 1,
            revision: 2,
            service: "eidos_sync",
            access: "read_write",
            quotaBytes: 1024,
            deviceLimit: 0,
          },
        }
      }),
    } as unknown as AccountSyncClient
    const callback = {
      redirectUri: "http://127.0.0.1:13128/oauth/callback",
      waitForCode: vi.fn(async () => "authorization-code"),
      close: vi.fn(),
    }
    const callbackFactory = vi.fn(
      async () => callback
    ) as unknown as typeof OAuthLoopbackCallback.listen
    const account = new AccountSessionService(
      oauth,
      credentials,
      deviceIdentity,
      syncClient,
      {
        callbackPort: 13_128,
        callbackFactory,
        openExternal: vi.fn(async () => undefined),
        device: {
          displayName: "Test Mac",
          platform: "macos",
          appVersion: "0.1.0",
        },
      },
      profile
    )

    await expect(account.signIn()).resolves.toMatchObject({
      state: "signed-in",
      user: { id: "user-1" },
      authorization: { access: { access: "read_write" } },
    })
    expect(calls).toEqual(["register", "authorize", "persist"])
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: "user-1" },
        device: expect.objectContaining({ id: "device-1" }),
      })
    )
    expect(profile.write).toHaveBeenCalledWith({
      id: "user-1",
      email: "person@example.com",
    })
  })

  it("keeps an expired credential available when refresh fails offline", async () => {
    const session: StoredAccountSession = {
      tokens: {
        accessToken: "expired-access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
        expiresIn: 1,
        storedAtMs: 1,
      },
      user: { id: "user-1" },
      device: {
        id: "device-1",
        displayName: "Test Mac",
        platform: "macos",
        appVersion: "0.1.0",
        status: "active",
        version: 1,
      },
    }
    const clear = vi.fn(async () => undefined)
    const account = new AccountSessionService(
      {
        refresh: vi.fn(async () => {
          throw new EidosOAuthError(
            "The Eidos account service could not be reached."
          )
        }),
      } as unknown as EidosOAuthClient,
      {
        read: vi.fn(async () => session),
        write: vi.fn(async () => undefined),
        clear,
      } as unknown as SecureAccountCredentialStore,
      {} as DeviceIdentityStore,
      {} as AccountSyncClient,
      {
        openExternal: vi.fn(async () => undefined),
        device: {
          displayName: "Test Mac",
          platform: "macos",
          appVersion: "0.1.0",
        },
      }
    )

    await expect(account.accessToken()).rejects.toThrow("could not be reached")
    expect(clear).not.toHaveBeenCalled()
  })
})
