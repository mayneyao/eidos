import { GraftProtocolError } from "@eidos.space/graft-remote"

import { createBurstCachedLoader } from "./burst-cache"

const AUTHENTICATE_HEADERS = {
  "WWW-Authenticate": 'Bearer realm="sync.eidos.space"',
} as const

export interface EidosPrincipal {
  userId: string
  namespace: string
  syncAccess: SyncAccessGrant | null
}

export type SyncAccessMode = "read_write" | "read_only" | "blocked"

export interface SyncAccessGrant {
  version: 1
  revision: number
  service: "eidos_sync"
  access: SyncAccessMode
  quotaBytes: number
  /** Compatibility field. Zero means unlimited personal devices. */
  deviceLimit: number
}

export type IdentityFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export type EidosAuthenticator = (
  request: Request,
  env: Env
) => Promise<EidosPrincipal>

export const AUTH_BURST_CACHE_TTL_MS = 5_000
const AUTH_BURST_CACHE_MAX_ENTRIES = 256

export function createCachedEidosAuthenticator(
  authenticate: EidosAuthenticator = authenticateEidosUser,
  options: {
    ttlMs?: number
    maxEntries?: number
    now?: () => number
  } = {}
): EidosAuthenticator {
  const cached = createBurstCachedLoader(
    ({ request, env }: { request: Request; env: Env }) =>
      authenticate(request, env),
    async ({ request, env }) => {
      const authorization = request.headers.get("authorization") ?? ""
      // Invalid credentials still go through the authoritative validator and
      // are never retained. This key only bounds work before that rejection.
      return await sha256Key(env.AUTH_USERINFO_URL + "\0" + authorization)
    },
    {
      ttlMs: options.ttlMs ?? AUTH_BURST_CACHE_TTL_MS,
      maxEntries: options.maxEntries ?? AUTH_BURST_CACHE_MAX_ENTRIES,
      now: options.now,
    }
  )
  return async (request, env) => await cached({ request, env })
}

export async function authenticateEidosUser(
  request: Request,
  env: Env,
  identityFetch: IdentityFetch = (input, init) =>
    env.EIDOS_ACCOUNT.fetch(input, init)
): Promise<EidosPrincipal> {
  const authorization = request.headers.get("authorization")
  if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) {
    throw unauthorized()
  }

  const userinfoUrl = configuredUserinfoUrl(env.AUTH_USERINFO_URL)
  let response: Response
  try {
    response = await identityFetch(userinfoUrl, {
      headers: {
        Accept: "application/json",
        Authorization: authorization,
      },
      // Workers only supports follow/manual. Manual prevents the bearer token
      // from being forwarded if the configured identity endpoint redirects.
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new GraftProtocolError(
      503,
      "identity_service_unavailable",
      "The identity service is unavailable"
    )
  }

  if (response.status === 401 || response.status === 403) {
    await discardBody(response)
    throw unauthorized()
  }
  if (!response.ok) {
    await discardBody(response)
    throw new GraftProtocolError(
      503,
      "identity_service_unavailable",
      "The identity service is unavailable"
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new GraftProtocolError(
      503,
      "invalid_identity_response",
      "The identity service returned an invalid response"
    )
  }

  const userId = identityId(payload)
  if (userId === null) {
    throw new GraftProtocolError(
      503,
      "invalid_identity_response",
      "The identity service response has no stable user id"
    )
  }

  return {
    userId,
    namespace: await namespaceForUser(userId),
    syncAccess: accessFromIdentity(payload),
  }
}

export function requireSyncAccess(
  principal: EidosPrincipal,
  action: "discover" | "read" | "write",
  enforcementEnabled: boolean
): void {
  if (!enforcementEnabled) return
  const access = principal.syncAccess
  if (access === null) {
    throw new GraftProtocolError(
      403,
      "sync_access_required",
      "Eidos Sync access is required"
    )
  }
  if (access.access === "blocked") {
    throw new GraftProtocolError(
      403,
      "sync_access_suspended",
      "Eidos Sync access is suspended"
    )
  }
  if (action === "write" && access.access === "read_only") {
    throw new GraftProtocolError(
      403,
      "sync_read_only",
      "This Eidos Sync account is read-only"
    )
  }
}

export function accessEnforcementEnabled(value: string): boolean {
  if (value === "off") return false
  if (value === "enforce") return true
  throw new GraftProtocolError(
    503,
    "access_service_not_configured",
    "Sync access enforcement is not configured"
  )
}

function configuredUserinfoUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw invalidIdentityConfiguration()
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw invalidIdentityConfiguration()
  }
  return url.toString()
}

function invalidIdentityConfiguration(): GraftProtocolError {
  return new GraftProtocolError(
    503,
    "identity_service_not_configured",
    "The identity service is not configured"
  )
}

function identityId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const candidate =
    typeof record.id === "string"
      ? record.id
      : typeof record.sub === "string"
        ? record.sub
        : null
  if (
    !candidate ||
    candidate.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return null
  }
  return candidate
}

function accessFromIdentity(value: unknown): SyncAccessGrant | null {
  if (typeof value !== "object" || value === null) return null
  const candidate = (value as Record<string, unknown>).sync_access
  if (candidate === undefined || candidate === null) return null
  if (typeof candidate !== "object" || candidate === null) {
    throw invalidAccessResponse()
  }
  const record = candidate as Record<string, unknown>
  const allowedKeys = new Set([
    "version",
    "revision",
    "service",
    "access",
    "quotaBytes",
    "deviceLimit",
  ])
  if (
    Object.keys(record).some((key) => !allowedKeys.has(key)) ||
    record.version !== 1 ||
    record.service !== "eidos_sync" ||
    !syncAccessMode(record.access) ||
    !safeNonNegativeInteger(record.revision) ||
    !safeNonNegativeInteger(record.quotaBytes) ||
    !safeNonNegativeInteger(record.deviceLimit)
  ) {
    throw invalidAccessResponse()
  }
  return {
    version: 1,
    revision: record.revision,
    service: "eidos_sync",
    access: record.access,
    quotaBytes: record.quotaBytes,
    deviceLimit: record.deviceLimit,
  }
}

function syncAccessMode(value: unknown): value is SyncAccessMode {
  return (
    typeof value === "string" &&
    ["read_write", "read_only", "blocked"].includes(value)
  )
}

function safeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function invalidAccessResponse(): GraftProtocolError {
  return new GraftProtocolError(
    503,
    "invalid_identity_response",
    "The identity service returned an invalid Sync access grant"
  )
}

async function namespaceForUser(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(userId)
  )
  const prefix = [...new Uint8Array(digest).slice(0, 12)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return "u-" + prefix
}

async function sha256Key(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function discardBody(response: Response): Promise<void> {
  if (response.body === null) return
  try {
    await response.body.cancel()
  } catch {
    // A failed cancellation must not replace the authentication result.
  }
}

function unauthorized(): GraftProtocolError {
  return new GraftProtocolError(
    401,
    "unauthorized",
    "A valid eidos.space bearer token is required",
    AUTHENTICATE_HEADERS
  )
}
