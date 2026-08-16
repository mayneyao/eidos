import {
  GraftProtocolError,
  PROTOCOL_VERSION,
  type GraftRepositoryBackend,
} from "@eidos.space/graft-remote"
import {
  CloudflareRepositoryBackend,
  RepositoryDurableObject,
} from "@eidos.space/graft-remote-cloudflare"
import { createGraftRemote } from "@eidos.space/graft-remote-hono"
import { WorkerEntrypoint } from "cloudflare:workers"
import { Hono, type Context } from "hono"

import {
  SYNC_ACTIVITY_LIMIT_MAX,
  SyncActivityDurableObject,
  type SyncActivityEvent,
  type SyncActivityKind,
  type SyncActivitySummary,
} from "./activity"
import {
  authenticateEidosUser,
  accessEnforcementEnabled,
  requireSyncAccess,
  type EidosPrincipal,
} from "./auth"
import {
  RepositoryDirectoryDurableObject,
  type RepositoryCreateResult,
  type RepositoryRecord,
  type RepositoryRenameResult,
} from "./directory"
import {
  parseContentLength,
  QuotaTrackedRepositoryBackend,
  quotaMode,
} from "./quota-backend"
import { SyncUsageDurableObject, type SyncUsageSummary } from "./usage"

export {
  RepositoryDurableObject,
  RepositoryDirectoryDurableObject,
  SyncActivityDurableObject,
  SyncUsageDurableObject,
}

interface RequestTiming {
  startedAt: number
  authMs: number
  directoryMs: number
}

type AppEnv = {
  Bindings: Env
  Variables: {
    requestTiming: RequestTiming
    principal?: EidosPrincipal
  }
}

const REPOSITORY_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/
const DEFAULT_SYNC_QUOTA_BYTES = 10 * 1024 * 1024 * 1024
const MAX_GRAFT_REQUEST_BYTES = 64 * 1024 * 1024
const GRAFT_MULTIPART_PART_BYTES = 16 * 1024 * 1024

export interface RemoteServiceDependencies {
  authenticate(request: Request, env: Env): Promise<EidosPrincipal>
  createRepository(
    env: Env,
    principal: EidosPrincipal,
    name: string,
    displayName: string
  ): Promise<RepositoryCreateResult>
  renameRepository(
    env: Env,
    principal: EidosPrincipal,
    name: string,
    displayName: string
  ): Promise<RepositoryRenameResult>
  findRepository(
    env: Env,
    principal: EidosPrincipal,
    name: string
  ): Promise<RepositoryRecord | null>
  listRepositories(
    env: Env,
    principal: EidosPrincipal
  ): Promise<RepositoryRecord[]>
  authorizeEntitlement(
    env: Env,
    principal: EidosPrincipal,
    action: "discover" | "read" | "write"
  ): void
  createBackend(
    env: Env,
    repositoryId: string,
    principal: EidosPrincipal,
    request: Request
  ): GraftRepositoryBackend
  usageSummary(env: Env, principal: EidosPrincipal): Promise<SyncUsageSummary>
  recordActivity(env: Env, event: SyncActivityEvent): Promise<void>
}

const defaultDependencies: RemoteServiceDependencies = {
  authenticate: authenticateEidosUser,
  async createRepository(env, principal, name, displayName) {
    return await directory(env, principal).createRepository(
      principal.namespace,
      name,
      displayName,
      principal.userId
    )
  },
  async renameRepository(env, principal, name, displayName) {
    return await directory(env, principal).renameRepository(
      name,
      displayName,
      principal.userId
    )
  },
  async findRepository(env, principal, name) {
    return await directory(env, principal).findRepository(
      name,
      principal.userId
    )
  },
  async listRepositories(env, principal) {
    return await directory(env, principal).listRepositories(principal.userId)
  },
  authorizeEntitlement(env, principal, action) {
    requireSyncAccess(
      principal,
      action,
      accessEnforcementEnabled(env.SYNC_ACCESS_ENFORCEMENT)
    )
  },
  createBackend(env, repositoryId, principal, request) {
    const delegate = new CloudflareRepositoryBackend(
      {
        objects: env.GRAFT_OBJECTS,
        repositories: env.GRAFT_REPOSITORIES,
      },
      repositoryId
    )
    const mode = quotaMode(env.SYNC_QUOTA_ENFORCEMENT)
    return new QuotaTrackedRepositoryBackend({
      delegate,
      mode,
      objects: env.GRAFT_OBJECTS,
      pathContentLength: parseContentLength(request),
      quotaBytes: principal.syncAccess?.quotaBytes ?? DEFAULT_SYNC_QUOTA_BYTES,
      repositoryId,
      usage: usage(env, principal),
    })
  },
  async usageSummary(env, principal) {
    const quotaBytes =
      principal.syncAccess?.quotaBytes ?? DEFAULT_SYNC_QUOTA_BYTES
    return await usage(env, principal).summary(quotaBytes)
  },
  async recordActivity(env, event) {
    await activity(env).record(event)
  },
}

export function createGraftRemoteWorker(
  overrides: Partial<RemoteServiceDependencies> = {}
): Hono<AppEnv> {
  const dependencies = { ...defaultDependencies, ...overrides }
  const app = new Hono<AppEnv>()

  app.use("*", async (context, next) => {
    const timing: RequestTiming = {
      startedAt: performance.now(),
      authMs: 0,
      directoryMs: 0,
    }
    context.set("requestTiming", timing)
    await next()
    const principal = context.get("principal")
    const kind = successfulActivityKind(context.req.raw, context.res.status)
    if (principal !== undefined && kind !== null) {
      const persistence = dependencies
        .recordActivity(context.env, {
          userId: principal.userId,
          kind,
          occurredAt: Date.now(),
        })
        .catch(() =>
          console.error(
            JSON.stringify({
              message: "sync activity persistence failed",
              operation: requestOperation(context.req.raw),
            })
          )
        )
      await scheduleBackground(context, persistence)
    }
    context.header(
      "X-Graft-Request-Id",
      safeRequestId(context.req.header("X-Graft-Request-Id"))
    )
    context.header("Server-Timing", serverTimingHeader(timing))
  })

  app.get("/healthz", () =>
    jsonResponse({
      service: "eidos-graft-remote",
      status: "ok",
    })
  )

  app.get("/.well-known/graft", (context) => {
    const origin = publicRemoteOrigin(context.env.PUBLIC_REMOTE_ORIGIN)
    return jsonResponse({
      service: "eidos-graft-remote",
      protocol: "graft-remote",
      version: Number(PROTOCOL_VERSION),
      remote_url_template: origin + "/{namespace}/{repository}",
      authentication: {
        scheme: "bearer",
        authority: new URL(context.env.AUTH_USERINFO_URL).origin,
      },
    })
  })

  app.get("/api/graft/repositories", async (context) => {
    const principal = await dependencies.authenticate(
      context.req.raw,
      context.env
    )
    context.set("principal", principal)
    dependencies.authorizeEntitlement(context.env, principal, "read")
    const repositories = await dependencies.listRepositories(
      context.env,
      principal
    )
    return jsonResponse({
      namespace: principal.namespace,
      repositories: repositories.map((repository) => ({
        name: repository.name,
        display_name: repository.displayName,
        created_at: repository.createdAt,
        remote_url: repositoryUrl(
          context.env,
          principal.namespace,
          repository.name
        ),
      })),
    })
  })

  app.put("/api/graft/repositories/:repository", async (context) => {
    const principal = await dependencies.authenticate(
      context.req.raw,
      context.env
    )
    context.set("principal", principal)
    dependencies.authorizeEntitlement(context.env, principal, "write")
    const name = validateRepositoryName(context.req.param("repository"))
    const displayName =
      (await optionalDisplayName(context.req.raw)) ?? validateDisplayName(name)
    const result = await dependencies.createRepository(
      context.env,
      principal,
      name,
      displayName
    )
    if (!result.ok) {
      throw new GraftProtocolError(
        403,
        "forbidden",
        "Repository namespace access denied"
      )
    }
    const remoteUrl = repositoryUrl(
      context.env,
      principal.namespace,
      result.repository.name
    )
    return jsonResponse(
      {
        created: result.created,
        namespace: principal.namespace,
        repository: result.repository.name,
        display_name: result.repository.displayName,
        remote_url: remoteUrl,
      },
      result.created ? 201 : 200,
      { Location: remoteUrl }
    )
  })

  app.patch("/api/graft/repositories/:repository", async (context) => {
    const principal = await dependencies.authenticate(
      context.req.raw,
      context.env
    )
    context.set("principal", principal)
    dependencies.authorizeEntitlement(context.env, principal, "write")
    const name = validateRepositoryName(context.req.param("repository"))
    const displayName = await requiredDisplayName(context.req.raw)
    const result = await dependencies.renameRepository(
      context.env,
      principal,
      name,
      displayName
    )
    if (!result.ok) {
      if (result.reason === "owner_mismatch") {
        throw new GraftProtocolError(
          403,
          "forbidden",
          "Repository namespace access denied"
        )
      }
      throw new GraftProtocolError(404, "not_found", "Repository not found")
    }
    const remoteUrl = repositoryUrl(
      context.env,
      principal.namespace,
      result.repository.name
    )
    return jsonResponse({
      namespace: principal.namespace,
      repository: result.repository.name,
      display_name: result.repository.displayName,
      remote_url: remoteUrl,
    })
  })

  app.get("/api/graft/usage", async (context) => {
    const principal = await dependencies.authenticate(
      context.req.raw,
      context.env
    )
    context.set("principal", principal)
    dependencies.authorizeEntitlement(context.env, principal, "read")
    const summary = await dependencies.usageSummary(context.env, principal)
    return jsonResponse({
      namespace: principal.namespace,
      enforcement: quotaMode(context.env.SYNC_QUOTA_ENFORCEMENT),
      ...summary,
    })
  })

  const remote = createGraftRemote<AppEnv, EidosPrincipal>({
    limits: {
      maxRequestBytes: MAX_GRAFT_REQUEST_BYTES,
      multipartPartBytes: GRAFT_MULTIPART_PART_BYTES,
    },
    async authenticate({ request, adapterContext }) {
      const principal = await measureRequestPhase(
        adapterContext,
        "authMs",
        () => dependencies.authenticate(request, adapterContext.env)
      )
      adapterContext.set("principal", principal)
      return principal
    },
    async authorize({ adapterContext, principal, repository, action }) {
      if (
        principal === undefined ||
        repository.namespace !== principal.namespace
      ) {
        throw new GraftProtocolError(
          403,
          "forbidden",
          "Repository namespace access denied"
        )
      }
      dependencies.authorizeEntitlement(adapterContext.env, principal, action)
    },
    async backend({ adapterContext, principal, repository, request }) {
      if (principal === undefined) return null
      const record = await measureRequestPhase(
        adapterContext,
        "directoryMs",
        () =>
          dependencies.findRepository(
            adapterContext.env,
            principal,
            repository.name
          )
      )
      return record === null
        ? null
        : dependencies.createBackend(
            adapterContext.env,
            record.id,
            principal,
            request
          )
    },
    onError(error, request) {
      reportUnexpectedError(
        "graft remote request failed",
        error,
        request.request
      )
    },
  })
  app.route("/", remote)

  app.notFound(() =>
    problemResponse(
      new GraftProtocolError(404, "not_found", "Resource not found")
    )
  )
  app.onError((error, context) => {
    reportUnexpectedError(
      "graft remote management request failed",
      error,
      context.req.raw
    )
    return problemResponse(error)
  })

  return app
}

async function measureRequestPhase<T>(
  context: Context<AppEnv>,
  phase: "authMs" | "directoryMs",
  operation: () => Promise<T>
): Promise<T> {
  const started = performance.now()
  try {
    return await operation()
  } finally {
    context.get("requestTiming")[phase] += performance.now() - started
  }
}

function safeRequestId(value: string | undefined): string {
  return value !== undefined && /^[A-Za-z0-9._-]{1,64}$/.test(value)
    ? value
    : crypto.randomUUID()
}

function serverTimingHeader(timing: RequestTiming): string {
  return [
    "auth;dur=" + timing.authMs.toFixed(3),
    "directory;dur=" + timing.directoryMs.toFixed(3),
    "total;dur=" + (performance.now() - timing.startedAt).toFixed(3),
  ].join(", ")
}

async function scheduleBackground(
  context: Context<AppEnv>,
  operation: Promise<void>
): Promise<void> {
  try {
    context.executionCtx.waitUntil(operation)
  } catch {
    await operation
  }
}

function directory(
  env: Env,
  principal: EidosPrincipal
): DurableObjectStub<RepositoryDirectoryDurableObject> {
  return env.GRAFT_DIRECTORY.getByName(principal.namespace)
}

function usage(
  env: Env,
  principal: EidosPrincipal
): DurableObjectStub<SyncUsageDurableObject> {
  return env.GRAFT_USAGE.getByName(principal.namespace)
}

function activity(env: Env): DurableObjectStub<SyncActivityDurableObject> {
  return env.GRAFT_ACTIVITY.getByName("global-v1")
}

function validateRepositoryName(value: string): string {
  if (!REPOSITORY_NAME.test(value)) {
    throw new GraftProtocolError(
      400,
      "invalid_repository",
      "Repository name must use letters, digits, '.', '_' or '-'"
    )
  }
  return value
}

async function optionalDisplayName(
  request: Request
): Promise<string | undefined> {
  const payload = await displayNamePayload(request, false)
  return payload === undefined
    ? undefined
    : validateDisplayName(payload.display_name)
}

async function requiredDisplayName(request: Request): Promise<string> {
  const payload = await displayNamePayload(request, true)
  return validateDisplayName(payload?.display_name)
}

async function displayNamePayload(
  request: Request,
  required: boolean
): Promise<{ display_name: unknown } | undefined> {
  const body = await request.text()
  if (body.length === 0) {
    if (!required) return undefined
    throw invalidDisplayName()
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    throw invalidDisplayName()
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    Object.keys(payload).some((key) => key !== "display_name")
  ) {
    throw invalidDisplayName()
  }
  const record = payload as Record<string, unknown>
  if (!Object.hasOwn(record, "display_name")) {
    if (!required) return undefined
    throw invalidDisplayName()
  }
  return { display_name: record.display_name }
}

function validateDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    throw invalidDisplayName()
  }
  const normalized = value.trim().normalize("NFC")
  const length = [...normalized].length
  if (length < 1 || length > 80 || /\p{Cc}/u.test(normalized)) {
    throw invalidDisplayName()
  }
  return normalized
}

function invalidDisplayName(): GraftProtocolError {
  return new GraftProtocolError(
    400,
    "invalid_display_name",
    "Display name must be 1 to 80 Unicode characters without control characters"
  )
}

function repositoryUrl(
  env: Env,
  namespace: string,
  repository: string
): string {
  return (
    publicRemoteOrigin(env.PUBLIC_REMOTE_ORIGIN) +
    "/" +
    encodeURIComponent(namespace) +
    "/" +
    encodeURIComponent(repository)
  )
}

function publicRemoteOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw invalidPublicOrigin()
  }
  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw invalidPublicOrigin()
  }
  return url.origin
}

function invalidPublicOrigin(): GraftProtocolError {
  return new GraftProtocolError(
    503,
    "service_not_configured",
    "PUBLIC_REMOTE_ORIGIN is not configured"
  )
}

function jsonResponse(
  value: unknown,
  status = 200,
  extraHeaders?: HeadersInit
): Response {
  const headers = new Headers(extraHeaders)
  headers.set("Cache-Control", "no-store")
  headers.set("Content-Type", "application/json; charset=utf-8")
  return new Response(JSON.stringify(value), { status, headers })
}

function problemResponse(error: unknown): Response {
  const protocolError =
    error instanceof GraftProtocolError
      ? error
      : new GraftProtocolError(500, "internal_error", "Internal server error")
  const headers = new Headers(protocolError.headers)
  headers.set("Cache-Control", "no-store")
  headers.set("Content-Type", "application/problem+json")
  return new Response(
    JSON.stringify({
      type: "https://sync.eidos.space/problems/" + protocolError.code,
      title:
        protocolError.status >= 500 ? "Service error" : protocolError.message,
      status: protocolError.status,
      code: protocolError.code,
    }),
    { status: protocolError.status, headers }
  )
}

function reportUnexpectedError(
  message: string,
  error: unknown,
  request: Request
): void {
  if (error instanceof GraftProtocolError && error.status < 500) return
  const protocolCode =
    error instanceof GraftProtocolError && /^[a-z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : undefined
  console.error(
    JSON.stringify({
      message,
      method: request.method,
      operation: requestOperation(request),
      ...(error instanceof GraftProtocolError
        ? {
            ...(protocolCode === undefined ? {} : { code: protocolCode }),
            status: error.status,
          }
        : {}),
    })
  )
}

function requestOperation(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean)
  if (parts[0] === "api" && parts[1] === "graft") {
    return parts[2] === "usage" ? "usage_management" : "repository_management"
  }
  const operation = parts[2]
  return operation === "raw" ||
    operation === "raw-if-not-exists" ||
    operation === "cas" ||
    operation === "cad" ||
    operation === "list"
    ? "remote_" + operation.replaceAll("-", "_")
    : "unknown"
}

function successfulActivityKind(
  request: Request,
  status: number
): SyncActivityKind | null {
  if (status < 200 || status >= 400) return null
  const operation = requestOperation(request)
  if (operation === "repository_management") return "manage"
  if (operation === "remote_list") return "read"
  if (operation === "remote_cas" || operation === "remote_cad") return "write"
  return null
}

export class SyncAdminEntrypoint extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== "GET" || url.pathname !== "/v1/sync-activity") {
      return jsonResponse({ error: { code: "not_found" } }, 404)
    }

    const limit = parseActivityLimit(url.searchParams.get("limit"))
    if (limit === null) {
      return jsonResponse({ error: { code: "invalid_limit" } }, 400)
    }
    const summaries = await activity(this.env).listRecent(limit)
    return jsonResponse({
      version: 1,
      generatedAt: new Date().toISOString(),
      activities: summaries.map(activityPayload),
    })
  }
}

function parseActivityLimit(value: string | null): number | null {
  if (value === null) return 100
  if (!/^\d{1,3}$/.test(value)) return null
  const limit = Number(value)
  return limit >= 1 && limit <= SYNC_ACTIVITY_LIMIT_MAX ? limit : null
}

function activityPayload(summary: SyncActivitySummary): {
  userId: string
  lastActivityAt: string
  lastKind: SyncActivityKind
  lastReadAt: string | null
  lastWriteAt: string | null
  lastManageAt: string | null
} {
  return {
    userId: summary.userId,
    lastActivityAt: new Date(summary.lastActivityAt).toISOString(),
    lastKind: summary.lastKind,
    lastReadAt: optionalTimestamp(summary.lastReadAt),
    lastWriteAt: optionalTimestamp(summary.lastWriteAt),
    lastManageAt: optionalTimestamp(summary.lastManageAt),
  }
}

function optionalTimestamp(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

export default createGraftRemoteWorker()
