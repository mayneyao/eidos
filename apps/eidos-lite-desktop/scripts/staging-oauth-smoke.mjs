import { spawn } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ACCOUNT_ORIGIN = "https://staging.eidos.space"
const SYNC_ORIGIN = "https://sync-staging.eidos.space"
const CLIENT_ID = "lite.desktop.eidos.space"
const REDIRECT_URI = "http://127.0.0.1:13128/oauth/callback"
const SCOPES = "openid profile email offline_access"
const REQUEST_TIMEOUT_MS = 30_000

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const statePath = process.env.EIDOS_LITE_STAGING_ACCOUNT_STATE
if (!statePath) {
  throw new Error(
    "Set EIDOS_LITE_STAGING_ACCOUNT_STATE to an owner-only staging smoke account file"
  )
}

const stateStat = await fs.stat(statePath)
if ((stateStat.mode & 0o077) !== 0) {
  throw new Error("The staging smoke account file must be owner-only")
}
const state = JSON.parse(await fs.readFile(statePath, "utf8"))
if (
  state.accountOrigin !== ACCOUNT_ORIGIN ||
  state.syncOrigin !== SYNC_ORIGIN ||
  typeof state.account?.email !== "string" ||
  typeof state.account?.password !== "string"
) {
  throw new Error("The staging smoke account state is invalid")
}

const cookies = new Map()

function captureCookies(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean)
  for (const value of values) {
    const pair = value.split(";", 1)[0]
    const separator = pair.indexOf("=")
    if (separator <= 0) continue
    const name = pair.slice(0, separator)
    const cookieValue = pair.slice(separator + 1)
    if (cookieValue) cookies.set(name, cookieValue)
    else cookies.delete(name)
  }
}

async function request(url, init = {}) {
  const headers = new Headers(init.headers)
  if (cookies.size > 0) {
    headers.set(
      "cookie",
      [...cookies].map(([name, value]) => `${name}=${value}`).join("; ")
    )
  }
  const response = await fetch(url, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  captureCookies(response)
  return response
}

async function responseJson(response, label) {
  let value
  try {
    value = await response.json()
  } catch {
    throw new Error(`${label} returned malformed JSON (${response.status})`)
  }
  if (!response.ok) {
    const code = value?.error?.code ?? value?.error ?? "request_failed"
    throw new Error(`${label} failed (${response.status}, ${code})`)
  }
  return value
}

function exactRedirect(location) {
  const value = new URL(location, ACCOUNT_ORIGIN)
  if (
    value.origin !== ACCOUNT_ORIGIN &&
    `${value.origin}${value.pathname}` !== REDIRECT_URI
  ) {
    throw new Error(`OAuth crossed the staging boundary: ${value.origin}`)
  }
  return value
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url")
}

async function tokenRequest(parameters) {
  const response = await fetch(`${ACCOUNT_ORIGIN}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const value = await responseJson(response, "OAuth token exchange")
  if (
    typeof value.access_token !== "string" ||
    typeof value.refresh_token !== "string" ||
    value.token_type !== "Bearer"
  ) {
    throw new Error("OAuth token response is invalid")
  }
  return value
}

async function bearerJson(url, token, init = {}) {
  const headers = new Headers(init.headers)
  headers.set("accept", "application/json")
  headers.set("authorization", `Bearer ${token}`)
  const response = await fetch(url, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return response
}

async function requireMissingRepository(remoteUrl, accessToken) {
  const response = await bearerJson(remoteUrl, accessToken, {
    headers: { "graft-protocol": "1" },
  })
  let problem
  try {
    problem = await response.json()
  } catch {
    throw new Error(
      `Missing Hosted Remote returned malformed JSON (${response.status})`
    )
  }
  if (
    response.status !== 404 ||
    problem?.status !== 404 ||
    problem?.title !== "repository_not_found"
  ) {
    throw new Error(
      `Missing Hosted Remote returned ${response.status}/${problem?.title ?? "unknown"}`
    )
  }
  return response.status
}

async function runGraftGate(remoteUrl, missingRemoteUrl, accessToken) {
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["run", "test:staging"], {
      cwd: appRoot,
      env: {
        ...process.env,
        EIDOS_LITE_STAGING_REMOTE_URL: remoteUrl,
        EIDOS_LITE_STAGING_MISSING_REMOTE_URL: missingRemoteUrl,
        EIDOS_LITE_STAGING_REMOTE_TOKEN: accessToken,
      },
      stdio: "inherit",
    })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(`Real Graft staging gate exited with ${code ?? signal}`)
        )
    })
  })
}

const verifier = base64Url(randomBytes(32))
const challenge = base64Url(createHash("sha256").update(verifier).digest())
const oauthState = base64Url(randomBytes(24))
const authorizeUrl = new URL("/api/auth/oauth2/authorize", ACCOUNT_ORIGIN)
authorizeUrl.search = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: SCOPES,
  state: oauthState,
  code_challenge: challenge,
  code_challenge_method: "S256",
}).toString()

const authorize = await request(authorizeUrl)
let loginLocation = authorize.headers.get("location")
if (!loginLocation && authorize.ok) {
  const authorizeValue = await responseJson(authorize, "OAuth authorize")
  loginLocation = authorizeValue.url
}
if (
  typeof loginLocation !== "string" ||
  exactRedirect(loginLocation).pathname !== "/auth/login"
) {
  throw new Error(
    `OAuth authorize did not enter staging login (${authorize.status})`
  )
}

const signIn = await request(`${ACCOUNT_ORIGIN}/api/auth/sign-in/email`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: ACCOUNT_ORIGIN,
    "sec-fetch-mode": "cors",
  },
  body: JSON.stringify(state.account),
})
let nextLocation = signIn.headers.get("location")
if (!nextLocation) {
  const signInValue = await responseJson(signIn, "Staging account sign-in")
  nextLocation =
    signInValue.url ?? signInValue.redirectURI ?? signInValue.redirectUrl
}
if (typeof nextLocation !== "string") {
  throw new Error("Staging sign-in did not resume the OAuth request")
}

let callbackUrl
let next = exactRedirect(nextLocation)
if (`${next.origin}${next.pathname}` === REDIRECT_URI) {
  callbackUrl = next
} else {
  if (next.pathname !== "/oauth/consent") {
    throw new Error(`OAuth resumed at an unexpected path: ${next.pathname}`)
  }
  const consentCode = next.searchParams.get("consent_code")
  if (!consentCode || next.searchParams.get("client_id") !== CLIENT_ID) {
    throw new Error("OAuth consent parameters are invalid")
  }
  const consentPage = await request(next)
  if (!consentPage.ok) {
    throw new Error(`OAuth consent page failed (${consentPage.status})`)
  }
  const consent = await request(`${ACCOUNT_ORIGIN}/api/auth/oauth2/consent`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ACCOUNT_ORIGIN },
    body: JSON.stringify({ accept: true, consent_code: consentCode }),
  })
  const consentValue = await responseJson(consent, "OAuth consent")
  if (typeof consentValue.redirectURI !== "string") {
    throw new Error("OAuth consent returned no loopback redirect")
  }
  callbackUrl = exactRedirect(consentValue.redirectURI)
}

const code = callbackUrl.searchParams.get("code")
if (!code || callbackUrl.searchParams.get("state") !== oauthState) {
  throw new Error("OAuth loopback code or state is invalid")
}

const initialTokens = await tokenRequest({
  client_id: CLIENT_ID,
  grant_type: "authorization_code",
  code,
  redirect_uri: REDIRECT_URI,
  code_verifier: verifier,
})
const userInfo = await bearerJson(
  `${ACCOUNT_ORIGIN}/api/auth/oauth2/userinfo`,
  initialTokens.access_token
)
const user = await responseJson(userInfo, "OIDC UserInfo")
if (typeof user.sub !== "string" || user.sub !== state.userId) {
  throw new Error("OIDC UserInfo subject does not match the staging account")
}

const stableDeviceId = randomUUID()
const registration = {
  stableDeviceId,
  displayName: "Eidos Lite staging OAuth smoke",
  platform: process.platform === "darwin" ? "macos" : "unknown",
  appVersion: "0.1.0-staging-smoke",
}
const firstDeviceResponse = await bearerJson(
  `${ACCOUNT_ORIGIN}/api/sync/devices/register`,
  initialTokens.access_token,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(registration),
  }
)
const firstDevice = await responseJson(
  firstDeviceResponse,
  "Initial device registration"
)
if (firstDevice.device?.status !== "active") {
  throw new Error("Initial device registration is not active")
}

const refreshedTokens = await tokenRequest({
  client_id: CLIENT_ID,
  grant_type: "refresh_token",
  refresh_token: initialTokens.refresh_token,
})
const refreshedDeviceResponse = await bearerJson(
  `${ACCOUNT_ORIGIN}/api/sync/devices/register`,
  refreshedTokens.access_token,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(registration),
  }
)
const refreshedDevice = await responseJson(
  refreshedDeviceResponse,
  "Refreshed device registration"
)
if (refreshedDevice.device?.id !== firstDevice.device?.id) {
  throw new Error("Token refresh created a different durable device")
}

const authorizationResponse = await bearerJson(
  `${ACCOUNT_ORIGIN}/api/sync/userinfo`,
  refreshedTokens.access_token
)
const authorization = await responseJson(
  authorizationResponse,
  "Eidos Sync authorization"
)
if (
  authorization.sub !== state.userId ||
  authorization.sync_access?.version !== 1 ||
  authorization.sync_access?.service !== "eidos_sync" ||
  authorization.sync_access?.access !== "read_write"
) {
  throw new Error("The staging account did not receive Sync read-write access")
}

let revoked = false
try {
  // Authorization is intentionally the last Sync action before revocation.
} finally {
  const revoke = await request(`${ACCOUNT_ORIGIN}/api/account/sync-devices`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ACCOUNT_ORIGIN },
    body: JSON.stringify({ action: "revoke", deviceId: firstDevice.device.id }),
  })
  const revokeValue = await responseJson(revoke, "Device revocation")
  revoked =
    revokeValue.devices?.find((device) => device.id === firstDevice.device.id)
      ?.status === "revoked"
}
if (!revoked) throw new Error("The staging device was not revoked")

const revokedAuthorization = await bearerJson(
  `${ACCOUNT_ORIGIN}/api/sync/userinfo`,
  refreshedTokens.access_token
)
if (revokedAuthorization.status !== 401) {
  throw new Error("Revocation did not invalidate the bound OAuth token")
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      environment: "staging",
      clientId: CLIENT_ID,
      callback: REDIRECT_URI,
      oauth: {
        pkce: "S256",
        stateVerified: true,
        userInfoSubjectVerified: true,
        refreshBoundToSameDevice: true,
      },
      access: authorization.sync_access.access,
      quotaBytes: authorization.sync_access.quotaBytes,
      revocationInvalidatedToken: true,
    },
    null,
    2
  )}\n`
)
