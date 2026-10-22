import type {
  AccountSyncClient,
  SyncAuthorization,
  SyncDevicePlatform,
} from "./account-sync-client"
import type { DeviceIdentityStore } from "./device-identity"
import type { OAuthUser } from "./oauth-client"
import { EidosOAuthError } from "./oauth-client"
import { OAuthLoopbackCallback } from "./loopback-callback"
import { resolveSparkHardwareId } from "./spark-hardware-id"
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
  private hardwareIdPromise: Promise<string> | null = null
  private boundAccessToken: string | null = null

  sparkHardwareId(): Promise<string> {
    return (this.hardwareIdPromise ??= resolveSparkHardwareId(
      async () => (await this.deviceIdentity.getOrCreate()).stableDeviceId
    ))
  }
  private signInPromise: Promise<AccountSessionStatus> | null = null
  private signInCallback: Promise<OAuthLoopbackCallback> | null = null
  private callbackShutdown: Promise<void> = Promise.resolve()
  private generation = 0
  private credentialOperations: Promise<unknown> = Promise.resolve()
  private refresh: {
    generation: number
    promise: Promise<StoredAccountSession>
  } | null = null

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
    const generation = this.generation
    await this.credentialOperations
    const session = await this.credentials.read()
    this.assertCurrent(generation)
    if (!session) return { state: "signed-out" }
    const profile = await this.profile?.read()
    this.assertCurrent(generation)
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
      const generation = ++this.generation
      const task = this.performSignIn(generation).finally(() => {
        if (this.signInPromise === task) this.signInPromise = null
      })
      this.signInPromise = task
    }
    return this.signInPromise
  }

  async signOut(): Promise<AccountSessionStatus> {
    this.generation += 1
    this.signInPromise = null
    const callback = this.signInCallback
    this.signInCallback = null
    this.callbackShutdown = Promise.all([
      this.callbackShutdown,
      callback?.then(
        (listener) =>
          listener.close(
            new Error("The account session changed. Sign in again.")
          ),
        () => undefined
      ),
    ]).then(() => undefined)
    await Promise.all([
      this.callbackShutdown,
      this.serializeCredentials(async () => {
        await Promise.all([this.credentials.clear(), this.profile?.clear()])
      }),
    ])
    return { state: "signed-out" }
  }

  async accessToken(): Promise<string> {
    return (await this.activeSession()).tokens.accessToken
  }

  async authorization(): Promise<SyncAuthorization> {
    const generation = this.generation
    const session = await this.activeSession()
    this.assertCurrent(generation)
    const authorization = await this.syncClient.authorization(
      session.tokens.accessToken
    )
    this.assertCurrent(generation)
    if (authorization.subject !== session.user.id) {
      await this.invalidateSession(generation)
      throw new Error(
        "The Eidos Sync identity does not match the signed-in account. Sign in again."
      )
    }
    return authorization
  }

  private async activeSession(): Promise<StoredAccountSession> {
    const generation = this.generation
    await this.credentialOperations
    const session = await this.credentials.read()
    this.assertCurrent(generation)
    if (!session) throw new Error("Sign in to Eidos Sync first.")
    const { tokens } = session
    const expiresAt =
      tokens.expiresIn === undefined
        ? 0
        : tokens.storedAtMs + tokens.expiresIn * 1000
    if (expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
      // Upgrade an already signed-in profile before asking Spark for a grant.
      // A restart must not wait for the OAuth token to expire to register its hash.
      if (this.boundAccessToken !== tokens.accessToken) {
        const identity = await this.deviceIdentity.getOrCreate()
        await this.syncClient.registerDevice(tokens.accessToken, {
          stableDeviceId: identity.stableDeviceId,
          sparkHardwareId: await this.sparkHardwareId(),
          ...this.options.device,
        })
        this.assertCurrent(generation)
        this.boundAccessToken = tokens.accessToken
      }
      return session
    }
    if (!tokens.refreshToken) {
      await this.invalidateSession(generation)
      throw new Error("Your Eidos Sync session expired. Sign in again.")
    }
    if (this.refresh?.generation === generation) return this.refresh.promise
    const promise = this.refreshSession(session, generation).finally(() => {
      if (this.refresh?.promise === promise) this.refresh = null
    })
    this.refresh = { generation, promise }
    return promise
  }

  private async refreshSession(
    session: StoredAccountSession,
    generation: number
  ): Promise<StoredAccountSession> {
    const { tokens } = session
    try {
      const refreshed = await this.oauth.refresh(tokens.refreshToken!)
      this.assertCurrent(generation)
      const bound = await this.bindSession(
        {
          ...refreshed,
          refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
        },
        session.user
      )
      await this.serializeCredentials(async () => {
        this.assertCurrent(generation)
        await this.credentials.write(bound.session)
        this.assertCurrent(generation)
      })
      return bound.session
    } catch (error) {
      if (
        error instanceof EidosOAuthError &&
        error.status !== undefined &&
        [400, 401, 403].includes(error.status) &&
        generation === this.generation
      ) {
        await this.invalidateSession(generation)
      }
      throw error
    }
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation)
      throw Object.assign(
        new Error("The account session changed. Sign in again."),
        { code: "authentication-required" }
      )
  }

  private serializeCredentials<Result>(
    operation: () => Promise<Result>
  ): Promise<Result> {
    const task = this.credentialOperations.then(operation, operation)
    this.credentialOperations = task.catch(() => undefined)
    return task
  }

  private async invalidateSession(generation: number): Promise<void> {
    this.assertCurrent(generation)
    const invalidated = ++this.generation
    await this.serializeCredentials(async () => {
      if (this.generation === invalidated) await this.credentials.clear()
    })
  }

  private async performSignIn(
    generation: number
  ): Promise<AccountSessionStatus> {
    await this.callbackShutdown
    this.assertCurrent(generation)
    const callbackFactory =
      this.options.callbackFactory ?? OAuthLoopbackCallback.listen
    const placeholderRedirect = `http://127.0.0.1:${this.options.callbackPort ?? 13_128}/oauth/callback`
    const request =
      await this.oauth.createAuthorizationRequest(placeholderRedirect)
    this.assertCurrent(generation)
    const pendingCallback = callbackFactory(
      request.state,
      this.options.callbackPort
    )
    this.signInCallback = pendingCallback
    const callback = await pendingCallback
    try {
      this.assertCurrent(generation)
      if (callback.redirectUri !== placeholderRedirect)
        throw new Error("The Eidos sign-in callback port changed unexpectedly.")
      await this.options.openExternal(request.url)
      const code = await callback.waitForCode()
      this.assertCurrent(generation)
      const tokens = await this.oauth.exchangeCode(
        code,
        request.codeVerifier,
        callback.redirectUri
      )
      this.assertCurrent(generation)
      const user = await this.oauth.userInfo(tokens.accessToken)
      this.assertCurrent(generation)
      const bound = await this.bindSession(tokens, user)
      await this.serializeCredentials(async () => {
        this.assertCurrent(generation)
        await this.credentials.write(bound.session)
        this.assertCurrent(generation)
        await this.profile?.write(user).catch((error) => {
          console.warn("Could not cache the Eidos account summary", error)
        })
        this.assertCurrent(generation)
      })
      return {
        state: "signed-in",
        user,
        authorization: bound.authorization,
      }
    } finally {
      await callback.close()
      if (this.signInCallback === pendingCallback) this.signInCallback = null
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
      sparkHardwareId: await this.sparkHardwareId(),
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
    this.boundAccessToken = tokens.accessToken
    return {
      session: { tokens, user: { id: user.id }, device },
      authorization,
    }
  }
}
