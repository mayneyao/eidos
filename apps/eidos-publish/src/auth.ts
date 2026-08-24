import type { PublishAccessGrant, PublishPrincipal } from "./contracts"

export type IdentityFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export class PublishAuthenticationError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "PublishAuthenticationError"
    this.status = status
    this.code = code
  }
}

export async function authenticatePublishUser(
  request: Request,
  env: Env,
  identityFetch: IdentityFetch = (input, init) =>
    env.EIDOS_ACCOUNT.fetch(input, init)
): Promise<PublishPrincipal> {
  const authorization = request.headers.get("authorization")
  if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) {
    throw unauthorized()
  }

  let response: Response
  try {
    response = await identityFetch(configuredUserinfoUrl(env), {
      headers: { Accept: "application/json", Authorization: authorization },
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw unavailable("identity_service_unavailable")
  }

  if (response.status === 401 || response.status === 403) {
    await discardBody(response)
    throw unauthorized()
  }
  if (!response.ok) {
    await discardBody(response)
    throw unavailable("identity_service_unavailable")
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw unavailable("invalid_identity_response")
  }
  return parsePrincipal(payload)
}

export function parsePrincipal(value: unknown): PublishPrincipal {
  if (!isRecord(value)) throw unavailable("invalid_identity_response")
  const allowed = new Set(["sub", "publish_access"])
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw unavailable("invalid_identity_response")
  }
  const userId = boundedText(value.sub, 256)
  if (typeof userId !== "string") {
    throw unavailable("invalid_identity_response")
  }
  return {
    userId,
    access: parseAccess(value.publish_access),
  }
}

function parseAccess(value: unknown): PublishAccessGrant {
  if (!isRecord(value)) throw unavailable("invalid_identity_response")
  const allowed = new Set([
    "version",
    "revision",
    "service",
    "state",
    "plan",
    "handle",
    "privatePublications",
    "removeBranding",
    "maxStorageBytes",
    "maxObjectBytes",
    "retentionDays",
    "runtimeSecondsPerPeriod",
    "runtimeStartsPerPeriod",
    "runtimeIdleSeconds",
    "collect",
  ])
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    value.version !== 1 ||
    value.service !== "eidos_publish" ||
    (value.state !== "active" && value.state !== "blocked") ||
    (value.plan !== "free" && value.plan !== "pro") ||
    typeof value.handle !== "boolean" ||
    typeof value.privatePublications !== "boolean" ||
    typeof value.removeBranding !== "boolean" ||
    !safeNonNegativeInteger(value.revision) ||
    !positiveInteger(value.retentionDays) ||
    !positiveInteger(value.runtimeStartsPerPeriod) ||
    !positiveInteger(value.runtimeIdleSeconds) ||
    !decimalInteger(value.maxStorageBytes) ||
    !decimalInteger(value.maxObjectBytes) ||
    !decimalInteger(value.runtimeSecondsPerPeriod) ||
    !validCollectLimits(value.collect)
  ) {
    throw unavailable("invalid_identity_response")
  }
  return {
    version: 1,
    revision: value.revision,
    service: "eidos_publish",
    state: value.state,
    plan: value.plan,
    handle: value.handle,
    privatePublications: value.privatePublications,
    removeBranding: value.removeBranding,
    maxStorageBytes: value.maxStorageBytes,
    maxObjectBytes: value.maxObjectBytes,
    retentionDays: value.retentionDays,
    runtimeSecondsPerPeriod: value.runtimeSecondsPerPeriod,
    runtimeStartsPerPeriod: value.runtimeStartsPerPeriod,
    runtimeIdleSeconds: value.runtimeIdleSeconds,
    collect: value.collect,
  }
}

function validCollectLimits(
  value: unknown
): value is PublishAccessGrant["collect"] {
  if (!isRecord(value)) return false
  const allowed = new Set([
    "submissionsPerPeriod",
    "maxSubmissionBodyBytes",
    "maxAttachmentsPerSubmission",
    "maxFormAttachmentBytes",
    "maxInboxBytes",
    "importedRetentionDays",
    "passwordForms",
    "emailNotifications",
  ])
  return (
    !Object.keys(value).some((key) => !allowed.has(key)) &&
    positiveInteger(value.submissionsPerPeriod) &&
    positiveInteger(value.maxSubmissionBodyBytes) &&
    safeNonNegativeInteger(value.maxAttachmentsPerSubmission) &&
    decimalInteger(value.maxFormAttachmentBytes) &&
    decimalInteger(value.maxInboxBytes) &&
    positiveInteger(value.importedRetentionDays) &&
    typeof value.passwordForms === "boolean" &&
    typeof value.emailNotifications === "boolean"
  )
}

function configuredUserinfoUrl(env: Env): string {
  let url: URL
  try {
    url = new URL(env.AUTH_USERINFO_URL)
  } catch {
    throw unavailable("identity_service_not_configured")
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw unavailable("identity_service_not_configured")
  }
  return url.toString()
}

function boundedText(
  value: unknown,
  maxLength: number
): string | null | undefined {
  if (typeof value !== "string") return null
  if (
    value.length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return undefined
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function safeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function decimalInteger(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)
}

function unauthorized(): PublishAuthenticationError {
  return new PublishAuthenticationError(
    401,
    "unauthorized",
    "A valid Eidos Publish credential is required"
  )
}

function unavailable(code: string): PublishAuthenticationError {
  return new PublishAuthenticationError(
    503,
    code,
    "The Eidos identity service is unavailable"
  )
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // The status is authoritative; a body cancellation failure changes nothing.
  }
}
