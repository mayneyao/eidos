import type { GraftRepositoryBackend } from "@eidos.space/graft-remote"
import { env, exports } from "cloudflare:workers"
import { abortAllDurableObjects } from "cloudflare:test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createGraftRemoteWorker } from "../src"
import {
  authenticateEidosUser,
  requireSyncAccess,
  type EidosPrincipal,
  type SyncAccessGrant,
} from "../src/auth"
import { QuotaTrackedRepositoryBackend } from "../src/quota-backend"

const ORIGIN = "https://sync.eidos.space"
const AUTH_USERINFO_URL = "https://eidos.space/api/sync/userinfo"

interface RepositoryResponse {
  created: boolean
  namespace: string
  repository: string
  remote_url: string
}

interface RepositoryListResponse {
  namespace: string
  repositories: Array<{
    name: string
    created_at: number
    remote_url: string
  }>
}

beforeEach(() => {
  mockIdentityService()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("eidos.space Graft Remote", () => {
  it("validates eidos.space bearer tokens and derives stable namespaces", async () => {
    const identityResponse = await fetch(AUTH_USERINFO_URL, {
      headers: { Authorization: "Bearer alice-token" },
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    })
    expect(await identityResponse.json()).toMatchObject({
      id: "alice",
      sync_access: activeAccessGrant(),
    })

    const principal = await authenticateEidosUser(
      new Request(ORIGIN, {
        headers: { Authorization: "Bearer alice-token" },
      }),
      env,
      testIdentityFetch
    )
    expect(principal).toEqual({
      userId: "alice",
      namespace: "u-2bd806c97f0e00af1a1fc332",
      syncAccess: activeAccessGrant(),
    })

    await expect(
      authenticateEidosUser(
        new Request(ORIGIN, {
          headers: { Authorization: "Bearer unknown-token" },
        }),
        env,
        testIdentityFetch
      )
    ).rejects.toMatchObject({ status: 401, code: "unauthorized" })
  })

  it("rejects access grants that leak billing fields", async () => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "alice",
        sync_access: {
          ...activeAccessGrant(),
          plan: "sync_annual",
        },
      })
    )

    await expect(
      authenticateEidosUser(
        new Request(ORIGIN, {
          headers: { Authorization: "Bearer alice-token" },
        }),
        env,
        testIdentityFetch
      )
    ).rejects.toMatchObject({
      status: 503,
      code: "invalid_identity_response",
    })
  })

  it("keeps entitlement enforcement opt-in and blocks writes in read-only mode", () => {
    const readOnly: EidosPrincipal = {
      userId: "alice",
      namespace: "u-alice",
      syncAccess: {
        ...activeAccessGrant(),
        access: "read_only",
      },
    }
    expect(() => requireSyncAccess(readOnly, "read", true)).not.toThrow()
    expect(() => requireSyncAccess(readOnly, "write", false)).not.toThrow()
    expect(() => requireSyncAccess(readOnly, "write", true)).toThrowError(
      expect.objectContaining({ status: 403, code: "sync_read_only" })
    )
    expect(() =>
      requireSyncAccess({ ...readOnly, syncAccess: null }, "read", true)
    ).toThrowError(
      expect.objectContaining({
        status: 403,
        code: "sync_access_required",
      })
    )
  })

  it("publishes discovery without exposing an internal protocol route", async () => {
    const response = await serviceFetch("/.well-known/graft")
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      service: "eidos-graft-remote",
      protocol: "graft-remote",
      version: 1,
      remote_url_template: "https://sync.eidos.space/{namespace}/{repository}",
      authentication: {
        scheme: "bearer",
        authority: "https://eidos.space",
      },
    })
  })

  it("handles authentication, protocol negotiation, and missing repositories", async () => {
    const unauthorized = await protocolFetch(
      ORIGIN + "/u-missing/repository",
      "",
      { token: null }
    )
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get("www-authenticate")).toContain("Bearer")
    expect(unauthorized.headers.get("graft-protocol")).toBe("1")
    await unauthorized.text()

    const unsupported = await protocolFetch(
      ORIGIN + "/u-missing/repository",
      "",
      { protocol: "2" }
    )
    expect(unsupported.status).toBe(426)
    expect(unsupported.headers.get("graft-protocol")).toBe("1")
    await unsupported.text()

    const namespace = await namespaceFor("alice-token")
    const missing = await protocolFetch(ORIGIN + "/" + namespace + "/missing")
    expect(missing.status).toBe(404)
    expect(missing.headers.get("graft-protocol")).toBe("1")
    await missing.text()
  })

  it("creates repositories idempotently and enforces the user namespace", async () => {
    const first = await createRepository("alice-token", "project")
    expect(first.response.status).toBe(201)
    expect(first.payload.created).toBe(true)
    expect(first.payload.remote_url).not.toContain("api/graft")

    const second = await createRepository("alice-token", "project")
    expect(second.response.status).toBe(200)
    expect(second.payload).toMatchObject({
      created: false,
      namespace: first.payload.namespace,
      repository: "project",
      remote_url: first.payload.remote_url,
    })

    const descriptor = await protocolFetch(first.payload.remote_url)
    expect(descriptor.status).toBe(200)
    expect(await descriptor.json()).toMatchObject({
      protocol: "graft-remote",
      version: 1,
      repository: first.payload.namespace + "/project",
    })

    const forbidden = await protocolFetch(first.payload.remote_url, "", {
      token: "bob-token",
    })
    expect(forbidden.status).toBe(403)
    expect(forbidden.headers.get("graft-protocol")).toBe("1")
    await forbidden.text()
  })

  it("streams immutable R2 objects and rejects create-only collisions", async () => {
    const { payload } = await createRepository("alice-token", "objects")
    const suffix = "/raw-if-not-exists/objects/pack/data.pack"
    const created = await protocolFetch(payload.remote_url, suffix, {
      init: { method: "PUT", body: "abcdef" },
    })
    expect(created.status).toBe(204)
    await created.text()

    const collision = await protocolFetch(payload.remote_url, suffix, {
      init: { method: "PUT", body: "changed" },
    })
    expect(collision.status).toBe(412)
    await collision.text()

    const range = await protocolFetch(
      payload.remote_url,
      "/raw/objects/pack/data.pack",
      { init: { headers: { Range: "bytes=1-3" } } }
    )
    expect(range.status).toBe(206)
    expect(range.headers.get("content-range")).toBe("bytes 1-3/6")
    expect(await binaryText(range)).toBe("bcd")

    const usage = await serviceFetch("/api/graft/usage", {
      headers: { Authorization: "Bearer alice-token" },
    })
    expect(usage.status).toBe(200)
    expect(await usage.json()).toMatchObject({
      namespace: payload.namespace,
      enforcement: "shadow",
      usedBytes: 6,
      reservedBytes: 0,
      quotaBytes: 10 * 1024 * 1024 * 1024,
    })
  })

  it("stages unknown-length protocol streams into fixed-length R2 writes", async () => {
    const { payload } = await createRepository("alice-token", "streamed-r2")
    const suffix = "/raw-if-not-exists/objects/pack/stream.pack"
    const stream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("streamed"))
          controller.close()
        },
      })

    const created = await protocolFetch(payload.remote_url, suffix, {
      init: { method: "PUT", body: stream() },
    })
    expect(created.status).toBe(204)
    await created.text()

    const collision = await protocolFetch(payload.remote_url, suffix, {
      init: { method: "PUT", body: stream() },
    })
    expect(collision.status).toBe(412)
    await collision.text()

    const stored = await protocolFetch(
      payload.remote_url,
      "/raw/objects/pack/stream.pack"
    )
    expect(await binaryText(stored)).toBe("streamed")
    expect(
      await env.GRAFT_OBJECTS.list({ prefix: "__eidos_sync_staging/" })
    ).toMatchObject({ objects: [] })
  })

  it("serializes account-wide byte reservations and rejects quota overflow", async () => {
    const usage = env.GRAFT_USAGE.getByName("quota-" + crypto.randomUUID())
    const backend = memoryBackend()
    const first = new QuotaTrackedRepositoryBackend({
      delegate: backend,
      mode: "enforce",
      objects: env.GRAFT_OBJECTS,
      pathContentLength: null,
      quotaBytes: 10,
      repositoryId: "repo-a",
      usage,
    })
    const second = new QuotaTrackedRepositoryBackend({
      delegate: backend,
      mode: "enforce",
      objects: env.GRAFT_OBJECTS,
      pathContentLength: null,
      quotaBytes: 10,
      repositoryId: "repo-b",
      usage,
    })

    const results = await Promise.allSettled([
      first.putIfAbsent(
        "objects/a",
        new TextEncoder().encode("123456"),
        "immutable"
      ),
      second.putIfAbsent(
        "objects/b",
        new TextEncoder().encode("123456"),
        "immutable"
      ),
    ])

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    const rejected = results.find((result) => result.status === "rejected")
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { status: 413, code: "sync_quota_exceeded" },
    })
    expect(await usage.summary(10)).toEqual({
      usedBytes: 6,
      reservedBytes: 0,
      quotaBytes: 10,
      remainingBytes: 4,
    })
  })

  it("skips known immutable objects and cancels their unconsumed request body", async () => {
    const usage = env.GRAFT_USAGE.getByName("known-" + crypto.randomUUID())
    const memory = memoryBackend()
    let headCalls = 0
    let putCalls = 0
    const backend: GraftRepositoryBackend = {
      ...memory,
      head(path) {
        headCalls += 1
        return memory.head(path)
      },
      putIfAbsent(path, value, kind) {
        putCalls += 1
        return memory.putIfAbsent(path, value, kind)
      },
    }
    const tracked = new QuotaTrackedRepositoryBackend({
      delegate: backend,
      mode: "enforce",
      objects: env.GRAFT_OBJECTS,
      pathContentLength: 3,
      quotaBytes: 10,
      repositoryId: "repo-known",
      usage,
    })

    await expect(
      tracked.putIfAbsent(
        "objects/known",
        new TextEncoder().encode("123"),
        "immutable"
      )
    ).resolves.toBe(true)

    let cancelled = false
    const duplicate = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
    })
    await expect(
      tracked.putIfAbsent("objects/known", duplicate, "immutable")
    ).resolves.toBe(false)

    expect({ cancelled, headCalls, putCalls }).toEqual({
      cancelled: true,
      headCalls: 1,
      putCalls: 1,
    })
    expect(await usage.summary(10)).toMatchObject({
      usedBytes: 3,
      reservedBytes: 0,
    })
  })

  it("stages unknown-length streams before enforcing their actual byte quota", async () => {
    const usage = env.GRAFT_USAGE.getByName("length-" + crypto.randomUUID())
    const backend = memoryBackend()
    const tracked = new QuotaTrackedRepositoryBackend({
      delegate: backend,
      mode: "enforce",
      objects: env.GRAFT_OBJECTS,
      pathContentLength: null,
      quotaBytes: 10,
      repositoryId: "repo-stream",
      usage,
    })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("123"))
        controller.close()
      },
    })

    await expect(
      tracked.putIfAbsent("objects/stream", stream, "immutable")
    ).resolves.toBe(true)
    expect(await usage.summary(10)).toMatchObject({
      usedBytes: 3,
      reservedBytes: 0,
    })
    expect(
      await env.GRAFT_OBJECTS.list({ prefix: "__eidos_sync_staging/" })
    ).toMatchObject({ objects: [] })
  })

  it("rejects a staged stream that exceeds the enforced quota", async () => {
    const usage = env.GRAFT_USAGE.getByName("length-" + crypto.randomUUID())
    const tracked = new QuotaTrackedRepositoryBackend({
      delegate: memoryBackend(),
      mode: "enforce",
      objects: env.GRAFT_OBJECTS,
      pathContentLength: null,
      quotaBytes: 2,
      repositoryId: "repo-stream-overflow",
      usage,
    })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("123"))
        controller.close()
      },
    })

    await expect(
      tracked.putIfAbsent("objects/stream", stream, "immutable")
    ).rejects.toMatchObject({ status: 413, code: "sync_quota_exceeded" })
    expect(await usage.summary(2)).toMatchObject({
      usedBytes: 0,
      reservedBytes: 0,
    })
    expect(
      await env.GRAFT_OBJECTS.list({ prefix: "__eidos_sync_staging/" })
    ).toMatchObject({ objects: [] })
  })

  it("serializes concurrent ref updates and persists across object restarts", async () => {
    const { payload } = await createRepository("alice-token", "concurrency")
    const ref = "/cas/refs/heads/main"
    const initial = await protocolFetch(payload.remote_url, ref, {
      init: {
        method: "POST",
        headers: {
          "x-graft-expected-present": "false",
          "x-graft-expected-hex": "",
        },
        body: "a\n",
      },
    })
    expect(initial.status).toBe(204)
    await initial.text()

    const contenders = await Promise.all([
      protocolFetch(payload.remote_url, ref, {
        init: {
          method: "POST",
          headers: {
            "x-graft-expected-present": "true",
            "x-graft-expected-hex": "610a",
          },
          body: "b\n",
        },
      }),
      protocolFetch(payload.remote_url, ref, {
        init: {
          method: "POST",
          headers: {
            "x-graft-expected-present": "true",
            "x-graft-expected-hex": "610a",
          },
          body: "c\n",
        },
      }),
    ])
    expect(contenders.map((response) => response.status).sort()).toEqual([
      204, 409,
    ])
    await Promise.all(contenders.map((response) => response.text()))

    await abortAllDurableObjects()

    const list = await listRepositories("alice-token")
    expect(list.repositories.map((repository) => repository.name)).toContain(
      "concurrency"
    )
    const current = await protocolFetch(
      payload.remote_url,
      "/raw/refs/heads/main"
    )
    expect(["b\n", "c\n"]).toContain(await binaryText(current))
  })

  it("returns stable service errors for identity and persistence failures", async () => {
    vi.restoreAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const unavailableWorker = createGraftRemoteWorker({
      authenticate(request, workerEnv) {
        return authenticateEidosUser(request, workerEnv, async () => {
          throw new Error("simulated identity outage")
        })
      },
    })
    const unavailable = await unavailableWorker.request(
      ORIGIN + "/u-missing/repository",
      {
        headers: {
          Authorization: "Bearer alice-token",
          "Graft-Protocol": "1",
        },
      },
      env
    )
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get("graft-protocol")).toBe("1")
    expect(await unavailable.text()).not.toContain("simulated")

    const failingBackend = throwingBackend()
    const worker = createGraftRemoteWorker({
      async authenticate() {
        return {
          userId: "test-user",
          namespace: "u-test",
          syncAccess: activeAccessGrant(),
        }
      },
      async findRepository() {
        return { name: "repository", id: "u-test/repository", createdAt: 1 }
      },
      createBackend() {
        return failingBackend
      },
      async createRepository() {
        throw new Error("simulated directory failure")
      },
    })
    const persistenceFailure = await worker.request(
      ORIGIN + "/u-test/repository/raw/HEAD",
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer test-token",
          "Graft-Protocol": "1",
        },
        body: "value",
      },
      env
    )
    expect(persistenceFailure.status).toBe(500)
    expect(persistenceFailure.headers.get("graft-protocol")).toBe("1")
    expect(await persistenceFailure.text()).not.toContain("simulated")

    const directoryFailure = await worker.request(
      ORIGIN + "/api/graft/repositories/repository",
      {
        method: "PUT",
        headers: { Authorization: "Bearer test-token" },
      },
      env
    )
    expect(directoryFailure.status).toBe(500)
    expect(directoryFailure.headers.get("content-type")).toContain(
      "application/problem+json"
    )
    expect(await directoryFailure.text()).not.toContain("simulated")
  })
})

function serviceFetch(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(new URL(path, ORIGIN), init))
}

async function binaryText(response: Response): Promise<string> {
  return new TextDecoder().decode(await response.arrayBuffer())
}

async function namespaceFor(token: string): Promise<string> {
  return (await listRepositories(token)).namespace
}

async function listRepositories(
  token: string
): Promise<RepositoryListResponse> {
  const response = await serviceFetch("/api/graft/repositories", {
    headers: { Authorization: "Bearer " + token },
  })
  expect(response.status).toBe(200)
  return (await response.json()) as RepositoryListResponse
}

async function createRepository(
  token: string,
  name: string
): Promise<{ response: Response; payload: RepositoryResponse }> {
  const response = await serviceFetch(
    "/api/graft/repositories/" + encodeURIComponent(name),
    {
      method: "PUT",
      headers: { Authorization: "Bearer " + token },
    }
  )
  const payload = (await response.json()) as RepositoryResponse
  return { response, payload }
}

function protocolFetch(
  remoteUrl: string,
  suffix = "",
  options: {
    token?: string | null
    protocol?: string
    init?: RequestInit
  } = {}
): Promise<Response> {
  const headers = new Headers(options.init?.headers)
  if (options.token !== null) {
    headers.set("Authorization", "Bearer " + (options.token ?? "alice-token"))
  }
  headers.set("Graft-Protocol", options.protocol ?? "1")
  return exports.default.fetch(
    new Request(remoteUrl + suffix, {
      ...options.init,
      headers,
    })
  )
}

function mockIdentityService(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const request = new Request(args[0], args[1])
      if (request.url !== AUTH_USERINFO_URL) {
        throw new Error("Unexpected outbound request: " + request.url)
      }
      const authorization = request.headers.get("authorization")
      const users: Record<string, string> = {
        "Bearer alice-token": "alice",
        "Bearer bob-token": "bob",
      }
      const userId = authorization === null ? undefined : users[authorization]
      return userId === undefined
        ? Response.json({ error: "invalid_token" }, { status: 401 })
        : Response.json({
            id: userId,
            sync_access: activeAccessGrant(),
          })
    }
  )
}

function testIdentityFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, init)
}

function activeAccessGrant(): SyncAccessGrant {
  return {
    version: 1,
    revision: 1,
    service: "eidos_sync",
    access: "read_write",
    quotaBytes: 10 * 1024 * 1024 * 1024,
    deviceLimit: 0,
  }
}

function throwingBackend(): GraftRepositoryBackend {
  const fail = (): never => {
    throw new Error("simulated persistence failure")
  }
  return {
    head: fail,
    get: fail,
    put: fail,
    delete: fail,
    putIfAbsent: fail,
    compareAndSwap: fail,
    compareAndDelete: fail,
    list: fail,
  }
}

function memoryBackend(): GraftRepositoryBackend {
  const objects = new Map<string, Uint8Array<ArrayBuffer>>()
  const unsupported = (): never => {
    throw new Error("Unsupported test backend operation")
  }
  return {
    head(path) {
      const value = objects.get(path)
      return value === undefined ? null : { size: value.byteLength }
    },
    get: unsupported,
    put: unsupported,
    delete: unsupported,
    async putIfAbsent(path, value) {
      if (objects.has(path)) return false
      const bytes =
        value instanceof Uint8Array
          ? value
          : new Uint8Array(await new Response(value).arrayBuffer())
      objects.set(path, new Uint8Array(bytes))
      return true
    },
    compareAndSwap: unsupported,
    compareAndDelete: unsupported,
    list: unsupported,
  }
}
