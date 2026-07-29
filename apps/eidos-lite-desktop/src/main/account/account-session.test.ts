import type { AccountSyncClient } from "./account-sync-client"
import { AccountSessionService } from "./account-session"
import type { SecureAccountCredentialStore } from "./credential-store"
import type { DeviceIdentityStore } from "./device-identity"
import type { OAuthLoopbackCallback } from "./loopback-callback"
import type { EidosOAuthClient } from "./oauth-client"

describe("AccountSessionService", () => {
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
      }
    )

    await expect(account.signIn()).resolves.toMatchObject({
      state: "signed-in",
      user: { id: "user-1" },
      authorization: { access: { access: "read_write" } },
    })
    expect(calls).toEqual(["register", "authorize", "persist"])
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        device: expect.objectContaining({ id: "device-1" }),
      })
    )
  })
})
