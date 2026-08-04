import type {
  AccountSyncClient,
  SyncAvailability,
  SyncAuthorization,
  SyncDevicePlatform,
} from "./account-sync-client"
import type { DeviceIdentityStore } from "./device-identity"
import type { OAuthUser } from "./oauth-client"
import { EidosOAuthError } from "./oauth-client"
import { OAuthLoopbackCallback } from "./loopback-callback"
import type {
  SecureAccountCredentialStore,
  StoredAccountSession,
} from "./credential-store"
import type { AccountProfileStore } from "./account-profile-store"
import type { EidosOAuthClient } from "./oauth-client"

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000

export interface AccountSessionStatus {
  state: "signed-out" | "signed-in"
  user?: OAuthUser
  authorization?: SyncAuthorization
}

interface AccountSessionOptions {
  callbackPort?: number
  openExternal(url: string): Promise<void>
  callbackFactory?: typeof OAuthLoopbackCallback.listen
  device: {
    displayName: string
    platform: SyncDevicePlatform
    appVersion: string
  }
}

export class AccountSessionService {
  private signInPromise: Promise<AccountSessionStatus> | null = null

  constructor(
    private readonly oauth: EidosOAuthClient,
    private readonly credentials: SecureAccountCredentialStore,
    private readonly deviceIdentity: DeviceIdentityStore,
    private readonly syncClient: AccountSyncClient,
    private readonly options: AccountSessionOptions,
    private readonly profile?: Pick<
      AccountProfileStore,
      "read" | "write" | "clear"
    >
  ) {}

  async status(): Promise<AccountSessionStatus> {
    const session = await this.credentials.read()
    if (!session) return { state: "signed-out" }
    const profile = await this.profile?.read()
    const user =
      profile?.id === session.user.id
        ? profile
        : session.user.email || session.user.name || session.user.avatarUrl
          ? session.user
          : { id: session.user.id }
    return { state: "signed-in", user }
  }

  signIn(): Promise<AccountSessionStatus> {
    if (!this.signInPromise) {
      this.signInPromise = this.performSignIn().finally(() => {
        this.signInPromise = null
      })
    }
    return this.signInPromise
  }

  async signOut(): Promise<AccountSessionStatus> {
    await Promise.all([this.credentials.clear(), this.profile?.clear()])
    return { state: "signed-out" }
  }

  async accessToken(): Promise<string> {
    return (await this.activeSession()).tokens.accessToken
  }

  async authorization(): Promise<SyncAuthorization> {
    const session = await this.activeSession()
    const authorization = await this.syncClient.authorization(
      session.tokens.accessToken
    )
    if (authorization.subject !== session.user.id) {
      await this.credentials.clear()
      throw new Error(
        "The Eidos Sync identity does not match the signed-in account. Sign in again."
      )
    }
    return authorization
  }

  async joinSyncWaitlist(): Promise<SyncAvailability> {
    const session = await this.activeSession()
    const enrollment = await this.syncClient.joinWaitlist(
      session.tokens.accessToken
    )
    if (enrollment.subject !== session.user.id) {
      await this.credentials.clear()
      throw new Error(
        "The Eidos Sync identity does not match the signed-in account. Sign in again."
      )
    }
    return enrollment.availability
  }

  private async activeSession(): Promise<StoredAccountSession> {
    const session = await this.credentials.read()
    if (!session) throw new Error("Sign in to Eidos Sync first.")
    const { tokens } = session
    const expiresAt =
      tokens.expiresIn === undefined
        ? 0
        : tokens.storedAtMs + tokens.expiresIn * 1000
    if (expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
      return session
    }
    if (!tokens.refreshToken) {
      await this.credentials.clear()
      throw new Error("Your Eidos Sync session expired. Sign in again.")
    }
    try {
      const refreshed = await this.oauth.refresh(tokens.refreshToken)
      const bound = await this.bindSession(
        {
          ...refreshed,
          refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
        },
        session.user
      )
      await this.credentials.write(bound.session)
      return bound.session
    } catch (error) {
      if (
        error instanceof EidosOAuthError &&
        error.status !== undefined &&
        [400, 401, 403].includes(error.status)
      ) {
        await this.credentials.clear()
      }
      throw error
    }
  }

  private async performSignIn(): Promise<AccountSessionStatus> {
    const callbackFactory =
      this.options.callbackFactory ?? OAuthLoopbackCallback.listen
    const placeholderRedirect = `http://127.0.0.1:${this.options.callbackPort ?? 13_128}/oauth/callback`
    const request =
      await this.oauth.createAuthorizationRequest(placeholderRedirect)
    const callback = await callbackFactory(
      request.state,
      this.options.callbackPort
    )
    if (callback.redirectUri !== placeholderRedirect) {
      callback.close()
      throw new Error("The Eidos sign-in callback port changed unexpectedly.")
    }
    try {
      await this.options.openExternal(request.url)
      const code = await callback.waitForCode()
      const tokens = await this.oauth.exchangeCode(
        code,
        request.codeVerifier,
        callback.redirectUri
      )
      const user = await this.oauth.userInfo(tokens.accessToken)
      const bound = await this.bindSession(tokens, user)
      await this.credentials.write(bound.session)
      await this.profile?.write(user).catch((error) => {
        console.warn("Could not cache the Eidos account summary", error)
      })
      return {
        state: "signed-in",
        user,
        authorization: bound.authorization,
      }
    } finally {
      callback.close()
    }
  }

  private async bindSession(
    tokens: StoredAccountSession["tokens"],
    user: OAuthUser
  ): Promise<{
    session: StoredAccountSession
    authorization: SyncAuthorization
  }> {
    const identity = await this.deviceIdentity.getOrCreate()
    const device = await this.syncClient.registerDevice(tokens.accessToken, {
      stableDeviceId: identity.stableDeviceId,
      ...this.options.device,
    })
    const authorization = await this.syncClient.authorization(
      tokens.accessToken
    )
    if (authorization.subject !== user.id) {
      throw new Error(
        "The Eidos Sync identity does not match the signed-in account."
      )
    }
    return {
      session: { tokens, user: { id: user.id }, device },
      authorization,
    }
  }
}
