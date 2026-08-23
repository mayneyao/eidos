import {
  authenticateEidosAuthorization,
  RelayHttpError,
  type RelayPrincipal,
} from "./auth"
import { relayPublicHostLabel } from "./public-host"

const BROWSER_OAUTH_CLIENT_ID = "relay.eidos.ink"
const OAUTH_RESPONSE_BYTES_MAX = 32 * 1024
const SLUG = /^u-[0-9a-f]{20}$/u
const STATE = /^(u-[0-9a-f]{20})\.([A-Za-z0-9_-]{43})$/u
const TOKEN_BYTES_MAX = 8 * 1024

interface BrowserTokenResponse {
  access_token: string
  token_type?: string
}

export interface BrowserAuthorizationAttempt {
  authorizationUrl: string
  state: string
  verifier: string
}

function exactHttpsOrigin(value: string, label: string): URL {
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new RelayHttpError(503, "identity_unavailable", `${label} is invalid`)
  }
  return url
}

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "")
}

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

async function challenge(verifier: string): Promise<string> {
  return base64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
    )
  )
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > OAUTH_RESPONSE_BYTES_MAX
  ) {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos OAuth response is too large"
    )
  }
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > OAUTH_RESPONSE_BYTES_MAX) {
      await reader.cancel()
      throw new RelayHttpError(
        503,
        "identity_unavailable",
        "The Eidos OAuth response is too large"
      )
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos OAuth response is invalid"
    )
  }
}

function browserToken(value: unknown): BrowserTokenResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos OAuth response is invalid"
    )
  }
  const body = value as Record<string, unknown>
  if (
    typeof body.access_token !== "string" ||
    body.access_token.length === 0 ||
    body.access_token.length > TOKEN_BYTES_MAX ||
    /[\r\n\u0000]/u.test(body.access_token) ||
    (body.token_type !== undefined &&
      (typeof body.token_type !== "string" ||
        body.token_type.toLowerCase() !== "bearer"))
  ) {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos OAuth response is invalid"
    )
  }
  return {
    access_token: body.access_token,
    ...(typeof body.token_type === "string"
      ? { token_type: body.token_type }
      : {}),
  }
}

export function browserAuthStateSlug(state: string): string | null {
  return STATE.exec(state)?.[1] ?? null
}

export function browserPublicOrigin(slug: string, env: Env): string {
  if (!SLUG.test(slug)) {
    throw new RelayHttpError(400, "invalid_request", "Invalid Relay hostname")
  }
  return `https://${relayPublicHostLabel(slug, env.PUBLIC_HOST_LABEL_SUFFIX)}.${env.PUBLIC_HOST_SUFFIX}`
}

export function browserAuthRedirectUri(env: Env): string {
  return new URL(
    "/v1/browser-auth/callback",
    exactHttpsOrigin(env.CONTROL_ORIGIN, "The Relay control origin")
  ).toString()
}

export async function createBrowserAuthorization(
  slug: string,
  env: Env
): Promise<BrowserAuthorizationAttempt> {
  if (!SLUG.test(slug)) {
    throw new RelayHttpError(400, "invalid_request", "Invalid Relay hostname")
  }
  const account = exactHttpsOrigin(env.AUTH_ORIGIN, "The Eidos account origin")
  const verifier = randomToken()
  const state = `${slug}.${randomToken()}`
  const authorizationUrl = new URL("/api/auth/oauth2/authorize", account)
  authorizationUrl.searchParams.set("client_id", BROWSER_OAUTH_CLIENT_ID)
  authorizationUrl.searchParams.set("redirect_uri", browserAuthRedirectUri(env))
  authorizationUrl.searchParams.set("response_type", "code")
  authorizationUrl.searchParams.set("scope", "openid")
  authorizationUrl.searchParams.set("state", state)
  authorizationUrl.searchParams.set("code_challenge", await challenge(verifier))
  authorizationUrl.searchParams.set("code_challenge_method", "S256")
  return { authorizationUrl: authorizationUrl.toString(), state, verifier }
}

export async function exchangeBrowserAuthorization(
  code: string,
  verifier: string,
  env: Env
): Promise<RelayPrincipal> {
  if (
    code.length === 0 ||
    code.length > TOKEN_BYTES_MAX ||
    /[\r\n\u0000]/u.test(code) ||
    !/^[A-Za-z0-9_-]{43}$/u.test(verifier)
  ) {
    throw new RelayHttpError(
      400,
      "invalid_request",
      "The Eidos OAuth callback is invalid"
    )
  }
  const account = exactHttpsOrigin(env.AUTH_ORIGIN, "The Eidos account origin")
  const tokenEndpoint = new URL("/api/auth/oauth2/token", account)
  let response: Response
  try {
    response = await env.EIDOS_ACCOUNT.fetch(
      new Request(tokenEndpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: BROWSER_OAUTH_CLIENT_ID,
          code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: browserAuthRedirectUri(env),
        }),
        redirect: "manual",
      })
    )
  } catch {
    throw new RelayHttpError(
      503,
      "identity_unavailable",
      "The Eidos identity service is unavailable"
    )
  }
  if (!response.ok) {
    throw new RelayHttpError(
      response.status === 400 || response.status === 401 ? 401 : 503,
      response.status === 400 || response.status === 401
        ? "oauth_failed"
        : "identity_unavailable",
      "Eidos account sign-in could not be completed"
    )
  }
  const token = browserToken(await boundedJson(response))
  return await authenticateEidosAuthorization(
    `Bearer ${token.access_token}`,
    env
  )
}
