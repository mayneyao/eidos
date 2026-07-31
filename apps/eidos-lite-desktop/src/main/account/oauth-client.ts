import crypto from "node:crypto"

import type { EidosLiteServiceEnvironment } from "../../shared/service-environment"

export const EIDOS_LITE_OAUTH_CLIENT_ID = "lite.desktop.eidos.space"
export const EIDOS_LITE_OAUTH_SCOPES = "openid profile email offline_access"

const REQUEST_TIMEOUT_MS = 30_000
const AVATAR_TIMEOUT_MS = 8_000
const AVATAR_BYTES_MAX = 512 * 1024
const AVATAR_CONTENT_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

export interface OAuthDiscovery {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userinfoEndpoint: string
  registrationEndpoint: string
  endSessionEndpoint: string
}

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  idToken?: string
  tokenType: string
  expiresIn?: number
  storedAtMs: number
}

export interface OAuthUser {
  id: string
  email?: string
  name?: string
  avatarUrl?: string
  avatarDataUrl?: string
}

export interface AuthorizationRequest {
  url: string
  state: string
  codeVerifier: string
}

export class EidosOAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = "EidosOAuthError"
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EidosOAuthError(
      "The Eidos account service returned invalid JSON."
    )
  }
  return value as Record<string, unknown>
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const result = value[key]
  if (typeof result !== "string" || !result) {
    throw new EidosOAuthError(
      "The Eidos account service returned an invalid response."
    )
  }
  return result
}

function optionalString(
  value: Record<string, unknown>,
  key: string
): string | undefined {
  const result = value[key]
  return typeof result === "string" && result ? result : undefined
}

function base64Url(value: Buffer): string {
  return value.toString("base64url")
}

function exactEndpoint(
  value: Record<string, unknown>,
  key: string,
  origin: string,
  pathname: string
): string {
  const endpoint = new URL(requiredString(value, key))
  if (endpoint.origin !== origin || endpoint.pathname !== pathname) {
    throw new EidosOAuthError(
      "The Eidos account service returned untrusted discovery metadata."
    )
  }
  return endpoint.toString()
}

export class EidosOAuthClient {
  private discoveryPromise: Promise<OAuthDiscovery> | null = null

  constructor(
    private readonly environment: EidosLiteServiceEnvironment,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch
  ) {}

  async discover(): Promise<OAuthDiscovery> {
    if (!this.discoveryPromise) {
      this.discoveryPromise = this.requestJson(
        `${this.environment.accountOrigin}/api/auth/.well-known/openid-configuration`
      )
        .then((value) => {
          const metadata = object(value)
          const origin = new URL(this.environment.accountOrigin).origin
          if (metadata.issuer !== origin) {
            throw new EidosOAuthError(
              "The Eidos account service returned an unexpected issuer."
            )
          }
          const challengeMethods = metadata.code_challenge_methods_supported
          const responseTypes = metadata.response_types_supported
          const grantTypes = metadata.grant_types_supported
          if (
            !Array.isArray(challengeMethods) ||
            !challengeMethods.includes("S256") ||
            !Array.isArray(responseTypes) ||
            !responseTypes.includes("code") ||
            !Array.isArray(grantTypes) ||
            !grantTypes.includes("authorization_code") ||
            !grantTypes.includes("refresh_token")
          ) {
            throw new EidosOAuthError(
              "The Eidos account service does not support the required PKCE flow."
            )
          }
          return {
            issuer: origin,
            authorizationEndpoint: exactEndpoint(
              metadata,
              "authorization_endpoint",
              origin,
              "/api/auth/oauth2/authorize"
            ),
            tokenEndpoint: exactEndpoint(
              metadata,
              "token_endpoint",
              origin,
              "/api/auth/oauth2/token"
            ),
            userinfoEndpoint: exactEndpoint(
              metadata,
              "userinfo_endpoint",
              origin,
              "/api/auth/oauth2/userinfo"
            ),
            registrationEndpoint: exactEndpoint(
              metadata,
              "registration_endpoint",
              origin,
              "/api/auth/oauth2/register"
            ),
            endSessionEndpoint: exactEndpoint(
              metadata,
              "end_session_endpoint",
              origin,
              "/api/auth/oauth2/endsession"
            ),
          }
        })
        .catch((error) => {
          this.discoveryPromise = null
          throw error
        })
    }
    return this.discoveryPromise
  }

  async createAuthorizationRequest(
    redirectUri: string
  ): Promise<AuthorizationRequest> {
    const discovery = await this.discover()
    const codeVerifier = base64Url(crypto.randomBytes(32))
    const codeChallenge = base64Url(
      crypto.createHash("sha256").update(codeVerifier).digest()
    )
    const state = base64Url(crypto.randomBytes(24))
    const url = new URL(discovery.authorizationEndpoint)
    url.searchParams.set("client_id", EIDOS_LITE_OAUTH_CLIENT_ID)
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("scope", EIDOS_LITE_OAUTH_SCOPES)
    url.searchParams.set("state", state)
    url.searchParams.set("code_challenge", codeChallenge)
    url.searchParams.set("code_challenge_method", "S256")
    return { url: url.toString(), state, codeVerifier }
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<OAuthTokens> {
    const discovery = await this.discover()
    return this.tokenRequest(discovery.tokenEndpoint, {
      client_id: EIDOS_LITE_OAUTH_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    })
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    const discovery = await this.discover()
    return this.tokenRequest(discovery.tokenEndpoint, {
      client_id: EIDOS_LITE_OAUTH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  }

  async userInfo(accessToken: string): Promise<OAuthUser> {
    const discovery = await this.discover()
    const value = object(
      await this.requestJson(discovery.userinfoEndpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    )
    const user: OAuthUser = {
      id: requiredString(value, "sub"),
      ...(optionalString(value, "email")
        ? { email: optionalString(value, "email") }
        : {}),
      ...(optionalString(value, "name")
        ? { name: optionalString(value, "name") }
        : {}),
      ...(optionalString(value, "picture")
        ? { avatarUrl: optionalString(value, "picture") }
        : {}),
    }
    if (user.avatarUrl) {
      const avatarDataUrl = await this.cacheAvatar(user.avatarUrl).catch(
        () => undefined
      )
      if (avatarDataUrl) user.avatarDataUrl = avatarDataUrl
    }
    return user
  }

  private async cacheAvatar(url: string): Promise<string | undefined> {
    const endpoint = new URL(url)
    if (endpoint.protocol !== "https:") return undefined
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AVATAR_TIMEOUT_MS)
    try {
      const response = await this.fetchImpl(endpoint, {
        headers: { Accept: [...AVATAR_CONTENT_TYPES].join(", ") },
        redirect: "follow",
        signal: controller.signal,
      })
      const contentType = response.headers.get("Content-Type")?.split(";")[0]
      const contentLength = Number(response.headers.get("Content-Length"))
      if (
        !response.ok ||
        !contentType ||
        !AVATAR_CONTENT_TYPES.has(contentType) ||
        (Number.isFinite(contentLength) && contentLength > AVATAR_BYTES_MAX)
      ) {
        return undefined
      }
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.byteLength === 0 || bytes.byteLength > AVATAR_BYTES_MAX) {
        return undefined
      }
      return `data:${contentType};base64,${bytes.toString("base64")}`
    } finally {
      clearTimeout(timeout)
    }
  }

  private async tokenRequest(
    endpoint: string,
    values: Record<string, string>
  ): Promise<OAuthTokens> {
    const value = object(
      await this.requestJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(values),
      })
    )
    const expiresIn = value.expires_in
    return {
      accessToken: requiredString(value, "access_token"),
      tokenType: optionalString(value, "token_type") ?? "Bearer",
      ...(optionalString(value, "refresh_token")
        ? { refreshToken: optionalString(value, "refresh_token") }
        : {}),
      ...(optionalString(value, "id_token")
        ? { idToken: optionalString(value, "id_token") }
        : {}),
      ...(typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? { expiresIn }
        : {}),
      storedAtMs: Date.now(),
    }
  }

  private async requestJson(
    url: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        headers: { Accept: "application/json", ...init.headers },
        redirect: "manual",
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new EidosOAuthError(
          response.status === 401
            ? "Your Eidos account session expired. Sign in again."
            : `Eidos account request failed with HTTP ${response.status}.`,
          response.status
        )
      }
      try {
        return (await response.json()) as unknown
      } catch {
        throw new EidosOAuthError(
          "The Eidos account service returned malformed JSON."
        )
      }
    } catch (error) {
      if (error instanceof EidosOAuthError) throw error
      if ((error as Error)?.name === "AbortError") {
        throw new EidosOAuthError("The Eidos account request timed out.")
      }
      throw new EidosOAuthError(
        "The Eidos account service could not be reached."
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}
