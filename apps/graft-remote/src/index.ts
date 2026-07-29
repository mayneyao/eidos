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
import { Hono } from "hono"

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
  SyncUsageDurableObject,
}

type AppEnv = { Bindings: Env }

const REPOSITORY_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/
const DEFAULT_SYNC_QUOTA_BYTES = 10 * 1024 * 1024 * 1024

export interface RemoteServiceDependencies {
  authenticate(request: Request, env: Env): Promise<EidosPrincipal>
  createRepository(
    env: Env,
    principal: EidosPrincipal,
    name: string
  ): Promise<RepositoryCreateResult>
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
}

const defaultDependencies: RemoteServiceDependencies = {
  authenticate: authenticateEidosUser,
  async createRepository(env, principal, name) {
    return await directory(env, principal).createRepository(
      principal.namespace,
      name,
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
}

export function createGraftRemoteWorker(
  overrides: Partial<RemoteServiceDependencies> = {}
): Hono<AppEnv> {
  const dependencies = { ...defaultDependencies, ...overrides }
  const app = new Hono<AppEnv>()

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
    dependencies.authorizeEntitlement(context.env, principal, "read")
    const repositories = await dependencies.listRepositories(
      context.env,
      principal
    )
    return jsonResponse({
      namespace: principal.namespace,
      repositories: repositories.map((repository) => ({
        name: repository.name,
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
    dependencies.authorizeEntitlement(context.env, principal, "write")
    const name = validateRepositoryName(context.req.param("repository"))
    const result = await dependencies.createRepository(
      context.env,
      principal,
      name
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
        remote_url: remoteUrl,
      },
      result.created ? 201 : 200,
      { Location: remoteUrl }
    )
  })

  app.get("/api/graft/usage", async (context) => {
    const principal = await dependencies.authenticate(
      context.req.raw,
      context.env
    )
    dependencies.authorizeEntitlement(context.env, principal, "read")
    const summary = await dependencies.usageSummary(context.env, principal)
    return jsonResponse({
      namespace: principal.namespace,
      enforcement: quotaMode(context.env.SYNC_QUOTA_ENFORCEMENT),
      ...summary,
    })
  })

  const remote = createGraftRemote<AppEnv, EidosPrincipal>({
    async authenticate({ request, adapterContext }) {
      return await dependencies.authenticate(request, adapterContext.env)
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
      const record = await dependencies.findRepository(
        adapterContext.env,
        principal,
        repository.name
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
  console.error(
    JSON.stringify({
      message,
      error: error instanceof Error ? error.message : String(error),
      method: request.method,
      path: new URL(request.url).pathname,
      ...(error instanceof GraftProtocolError
        ? { code: error.code, status: error.status }
        : {}),
    })
  )
}

export default createGraftRemoteWorker()
