import { env } from "cloudflare:workers"
import {
  SELF,
  abortAllDurableObjects,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { validateSourceBundle } from "../src/bundle"
import { brandPublishedDocument } from "../src/branding"
import { canonicalJson, canonicalSha256 } from "../src/canonical"
import { refreshTenantEntitlements } from "../src/entitlements"
import { runtimeProxyRequestHeaders } from "../src/gateway"
import {
  isRelayPublicHostname,
  publicationHostLabel,
  publicationHostname,
  reservedPublishHandle,
} from "../src/hostnames"
import { withRequestId } from "../src/response"
import {
  createPublicationPasswordVerifier,
  PASSWORD_TOTAL_ITERATIONS,
  validPublicationPassword,
  verifyPublicationPassword,
} from "../src/passwords"
import {
  RuntimeVersionReadinessCache,
  RuntimePreparationError,
  runtimeShardName,
  sourceStartupTimeoutSeconds,
} from "../src/runtime"
import {
  markdownLocalAssetUris,
  prepareMarkdownVersion,
  probeMarkdownTarget,
  validateMarkdownVersion,
} from "../src/markdown"
import {
  prepareFormVersion,
  probeFormTarget,
  validateFormVersion,
} from "../src/form"
import { authoritativeMultipartObject } from "../src/index"

const ORIGIN = "https://publish.eidos.space"
const FILE_ID = "0198c72d-82b5-7000-8000-000000000001"
const TABLE_ID = "0198c72d-82b5-7000-8000-000000000010"
const VIEW_ID = "0198c72d-82b5-7000-8000-000000000011"
const EMAIL_FIELD_ID = "0198c72d-82b5-7000-8000-000000000012"
const FILE_FIELD_ID = "0198c72d-82b5-7000-8000-000000000013"
const SELECT_FIELD_ID = "0198c72d-82b5-7000-8000-000000000014"
const MULTI_SELECT_FIELD_ID = "0198c72d-82b5-7000-8000-000000000015"

afterEach(async () => {
  await abortAllDurableObjects()
})

describe("Publish branding", () => {
  it("passes the hidden-brand preference to the Eidos shell without injecting a footer", async () => {
    const response = brandPublishedDocument(
      new Response(
        '<html><head></head><body><div id="root"></div></body></html>',
        {
          headers: { "content-type": "text/html; charset=utf-8" },
        }
      ),
      "demo",
      false
    )
    const html = await response.text()

    expect(html).toContain(
      '<meta name="eidos-publish-branding" content="hide">'
    )
    expect(html).not.toContain('class="eidos-publish-brand"')
    expect(html).not.toContain("publish-brand.v4.css")
  })
})

describe("Publish runtime sizing", () => {
  it("reuses a recent Version readiness probe only for the initial request burst", () => {
    const cache = new RuntimeVersionReadinessCache()
    cache.mark("version-1", 1_000)

    expect(cache.has("version-1", 10_999)).toBe(true)
    expect(cache.has("version-1", 11_000)).toBe(false)

    cache.mark("version-1", 20_000)
    cache.delete("version-1")
    expect(cache.has("version-1", 20_001)).toBe(false)

    cache.mark("version-1", 30_000)
    cache.mark("version-2", 30_000)
    cache.clear()
    expect(cache.has("version-1", 30_001)).toBe(false)
    expect(cache.has("version-2", 30_001)).toBe(false)
  })

  it("normalizes public browser authority for the loopback Runtime", () => {
    const headers = runtimeProxyRequestHeaders(
      new Headers({
        Host: "u-0123456789abcdef.eidos.ink",
        Origin: "https://u-0123456789abcdef.eidos.ink",
      })
    )
    expect(headers.get("Host")).toBe("127.0.0.1:8420")
    expect(headers.get("Origin")).toBe("http://127.0.0.1:8420")
  })

  it("maps tenants deterministically into a bounded shared Runtime pool", () => {
    const shard = runtimeShardName("u-0123456789abcdef", "8")
    expect(shard).toMatch(/^runtime-pool-v1-000[0-7]$/)
    expect(runtimeShardName("u-0123456789abcdef", "8")).toBe(shard)

    const tenantsByShard = new Map<string, number>()
    for (let index = 0; index < 64; index += 1) {
      const candidate = runtimeShardName(`tenant-${index}`, "8")
      tenantsByShard.set(candidate, (tenantsByShard.get(candidate) ?? 0) + 1)
    }
    expect(tenantsByShard.size).toBeGreaterThan(1)
    expect([...tenantsByShard.values()].some((count) => count > 1)).toBe(true)
    expect(() => runtimeShardName("tenant", "0")).toThrowError(
      RuntimePreparationError
    )
  })

  it("sizes cold-start budgets for small and large immutable sources", () => {
    expect(sourceStartupTimeoutSeconds("1")).toBe(60)
    expect(sourceStartupTimeoutSeconds((512 * 1024 * 1024).toString())).toBe(
      158
    )
    expect(
      sourceStartupTimeoutSeconds((2 * 1024 * 1024 * 1024).toString())
    ).toBe(542)
    expect(sourceStartupTimeoutSeconds("999999999999")).toBe(900)
  })
})

describe("Publish multipart completion", () => {
  it("verifies the authoritative object after complete instead of its optional response metadata", async () => {
    const expected = {
      size: 128,
      customMetadata: {
        contentBytes: "128",
        contentSha256: "a".repeat(64),
      },
    }
    let completed = false
    const complete = vi.fn(async () => {
      completed = true
      return { size: 0 }
    })
    const store = {
      head: vi.fn(async () => (completed ? expected : null)),
      resumeMultipartUpload: vi.fn(() => ({ complete })),
    }

    await expect(
      authoritativeMultipartObject(store, "source-key", "upload-id", [
        { partNumber: 1, etag: "part-etag" },
      ])
    ).resolves.toBe(expected)
    expect(complete).toHaveBeenCalledOnce()
    expect(store.head).toHaveBeenCalledTimes(2)
  })
})

describe("Publish password verifiers", () => {
  it("uses a salted adaptive verifier and accepts international passwords", async () => {
    const password = "正确 horse battery staple"
    const pepper = "test-only-password-pepper-at-least-32-bytes"
    expect(validPublicationPassword(password)).toBe(true)
    expect(validPublicationPassword("short")).toBe(false)
    const first = await createPublicationPasswordVerifier(password, pepper)
    const second = await createPublicationPasswordVerifier(password, pepper)
    expect(first.algorithm).toBe("pbkdf2-sha256-chain-v1+hmac-sha256")
    expect(first.iterations).toBe(100_000)
    expect(PASSWORD_TOTAL_ITERATIONS).toBe(600_000)
    expect(first.salt).not.toBe(second.salt)
    expect(JSON.stringify(first)).not.toContain(password)
    expect(await verifyPublicationPassword(password, first, pepper)).toBe(true)
    expect(
      await verifyPublicationPassword("incorrect-password", first, pepper)
    ).toBe(false)
  })
})

describe("shared eidos.ink hostname routing", () => {
  const staging = {
    PUBLISH_ROOT: "eidos.ink",
    PUBLISH_HOST_LABEL_SUFFIX: "-staging",
  }

  it("keeps staging hosts inside the one-label wildcard", () => {
    expect(publicationHostname("mayne", staging)).toBe(
      "mayne-staging.eidos.ink"
    )
    expect(publicationHostLabel("mayne-staging.eidos.ink", staging)).toBe(
      "mayne"
    )
    expect(publicationHostLabel("mayne.eidos.ink", staging)).toBeNull()
    expect(
      isRelayPublicHostname("r-0123456789abcdefabcd-staging.eidos.ink", staging)
    ).toBe(true)
    expect(
      isRelayPublicHostname("u-0123456789abcdefabcd-staging.eidos.ink", staging)
    ).toBe(true)
  })

  it("reserves Relay and staging namespaces from Pro handles", () => {
    expect(reservedPublishHandle("r-customer")).toBe(true)
    expect(reservedPublishHandle("customer-staging")).toBe(true)
    expect(reservedPublishHandle("customer")).toBe(false)
  })

  it("preserves a Relay WebSocket upgrade without reconstructing it", async () => {
    const pair = new WebSocketPair()
    const response = new Response(null, {
      status: 101,
      webSocket: pair[0],
    })
    expect(await withRequestId(response, crypto.randomUUID())).toBe(response)
  })
})

describe("Eidos Publish control plane", () => {
  it("serves the immutable Form client without requiring a claimed tenant", async () => {
    const response = await SELF.fetch(
      "https://u-0123456789abcdef.eidos.ink/_eidos/forms/client.v3.js"
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("immutable")
    expect(await response.text()).toContain("embeddedDefinition()")
  })

  it("publishes discovery and rejects unauthenticated tenant access", async () => {
    const health = await SELF.fetch(ORIGIN + "/healthz")
    expect(await health.json()).toEqual({
      service: "eidos-publish",
      status: "ok",
    })
    const discovery = await SELF.fetch(ORIGIN + "/.well-known/eidos-publish")
    expect(await discovery.json()).toMatchObject({
      drivers: [
        {
          id: "org.eidos.driver.eidos",
          targetKinds: ["runtime"],
        },
        {
          id: "org.eidos.driver.markdown",
          mediaTypes: ["text/markdown"],
          targetKinds: ["static"],
          maxEntrypointBytes: "16777216",
        },
        {
          id: "org.eidos.driver.form",
          mediaTypes: ["application/vnd.eidos.form+json"],
          targetKinds: ["static"],
          maxEntrypointBytes: "262144",
        },
      ],
    })

    const response = await SELF.fetch(ORIGIN + "/api/tenant")
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain("Bearer")
    const requestId = response.headers.get("x-eidos-request-id")
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(await response.json()).toMatchObject({
      error: { code: "unauthorized", requestId },
    })
  })

  it("allocates one stable opaque Public Site ID per account", async () => {
    const first = await tenant("free-stable")
    const second = await tenant("free-stable")
    expect(first.publicSiteId).toMatch(/^u-[0-9abcdefghjkmnpqrstvwxyz]{16}$/)
    expect(second.publicSiteId).toBe(first.publicSiteId)
    expect(first.canonicalHost).toBe(first.publicSiteId + ".eidos.ink")
  })

  it("rejects hosted publishing without an active subscription", async () => {
    const response = await authenticatedFetch("/api/tenant", "blocked-token")
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: { code: "publish_subscription_required" },
    })
  })

  it("dispatches the reserved Relay hostname namespace", async () => {
    const hostname = "r-0123456789abcdefabcd.eidos.ink"
    const response = await SELF.fetch(`https://${hostname}/api/manifest`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      service: "eidos-file-relay",
      hostname,
    })

    const control = await SELF.fetch("https://relay.eidos.ink/healthz")
    expect(await control.json()).toEqual({
      service: "eidos-file-relay",
      hostname: "relay.eidos.ink",
    })

    const legacyHostname = "u-0123456789abcdefabcd.eidos.ink"
    const legacy = await SELF.fetch(`https://${legacyHostname}/api/manifest`)
    expect(await legacy.json()).toEqual({
      service: "eidos-file-relay",
      hostname: legacyHostname,
    })
  })

  it("exposes a secret-authenticated account summary without a CLI credential", async () => {
    const response = await SELF.fetch(ORIGIN + "/_internal/account-summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Eidos-Publish-Service":
          "test-only-publish-service-secret-32-bytes-minimum",
      },
      body: JSON.stringify({
        sub: "account-summary-user",
        publish_access: freeAccessGrant(),
      }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      publicSiteId: expect.stringMatching(/^u-/),
      canonicalHost: expect.stringMatching(/\.eidos\.ink$/),
      publications: [],
      usage: { sourceBytes: "0", runtimeStarts: 0 },
    })
    const denied = await SELF.fetch(ORIGIN + "/_internal/account-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sub: "account-summary-user",
        publish_access: freeAccessGrant(),
      }),
    })
    expect(denied.status).toBe(404)
  })

  it("updates Publication branding through the account service binding", async () => {
    const created = await authenticatedFetch(
      "/api/publications/internal-branding",
      "pro-token",
      mutation("create-internal-branding")
    )
    expect(created.status).toBe(201)
    const principal = {
      sub: "pro-user",
      publish_access: {
        ...freeAccessGrant(),
        revision: 2,
        plan: "pro" as const,
        handle: true,
        privatePublications: true,
        removeBranding: true,
      },
    }
    const response = await SELF.fetch(
      ORIGIN + "/_internal/publications/internal-branding/branding",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "account-hide-branding",
          "X-Eidos-Publish-Service":
            "test-only-publish-service-secret-32-bytes-minimum",
        },
        body: JSON.stringify({ principal, showBranding: false }),
      }
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      slug: "internal-branding",
      showBranding: false,
    })

    const denied = await SELF.fetch(
      ORIGIN + "/_internal/publications/internal-branding/branding",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "account-show-branding",
        },
        body: JSON.stringify({ principal, showBranding: true }),
      }
    )
    expect(denied.status).toBe(404)
  })

  it("supports multiple tenant-local slugs without a publication-count quota", async () => {
    const created = await authenticatedFetch(
      "/api/publications/company-wiki",
      "free-limit",
      mutation("create-company")
    )
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ slug: "company-wiki" })

    const retry = await authenticatedFetch(
      "/api/publications/company-wiki",
      "free-limit",
      mutation("create-company")
    )
    expect(retry.status).toBe(201)

    const second = await authenticatedFetch(
      "/api/publications/second",
      "free-limit",
      mutation("create-second")
    )
    expect(second.status).toBe(201)
    expect(await second.json()).toMatchObject({ slug: "second" })

    const visibilityConflict = await authenticatedFetch(
      "/api/publications/company-wiki",
      "free-limit",
      publicationMutation("create-company-private", "private")
    )
    expect(visibilityConflict.status).toBe(403)
  })

  it("stores a canonical manifest and streams a digest-checked immutable file into R2", async () => {
    const publicationResponse = await authenticatedFetch(
      "/api/publications/tasks",
      "free-upload",
      mutation("create-tasks")
    )
    expect(publicationResponse.status).toBe(201)
    const bytes = new TextEncoder().encode("immutable eidos source")
    const sha256 = await digestHex(bytes)
    const versionResponse = await authenticatedFetch(
      "/api/publications/tasks/versions",
      "free-upload",
      mutation("begin-tasks-version", {
        driver: { id: "org.eidos.driver.eidos", version: "1.0" },
        manifest: manifest("source.eidos", bytes.byteLength, sha256),
      })
    )
    expect(versionResponse.status).toBe(201)
    const version = (await versionResponse.json()) as {
      versionId: string
      publicationId: string
      sourceManifestKey: string
      entrypointObjectKey: string
      sourceManifestSha256: string
    }
    const uploaded = await authenticatedFetch(
      `/api/publications/tasks/versions/${version.versionId}/objects/${sha256}`,
      "free-upload",
      {
        method: "PUT",
        headers: {
          "Idempotency-Key": "upload-tasks-source",
          "Content-Length": bytes.byteLength.toString(),
          "X-Eidos-Content-SHA256": sha256,
        },
        body: bytes,
      }
    )
    expect(uploaded.status).toBe(200)
    expect(await uploaded.json()).toMatchObject({
      state: "ready",
      bytes: bytes.byteLength.toString(),
      sha256,
    })
    const finalized = await authenticatedFetch(
      `/api/publications/tasks/versions/${version.versionId}/complete`,
      "free-upload",
      {
        method: "POST",
        headers: { "Idempotency-Key": "complete-tasks-source" },
      }
    )
    expect(finalized.status).toBe(200)
    expect(await finalized.json()).toMatchObject({ state: "uploaded" })
    const object = await env.PUBLISH_OBJECTS.get(version.entrypointObjectKey)
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(bytes)
    const storedManifest = await env.PUBLISH_OBJECTS.get(
      version.sourceManifestKey
    )
    expect(storedManifest?.customMetadata?.sourceManifestSha256).toBe(
      version.sourceManifestSha256
    )

    const otherBytes = new TextEncoder().encode("different immutable source")
    const otherSha256 = await digestHex(otherBytes)
    const otherVersionResponse = await authenticatedFetch(
      "/api/publications/tasks/versions",
      "free-upload",
      mutation("begin-other-tasks-version", {
        driver: { id: "org.eidos.driver.eidos", version: "1.0" },
        manifest: manifest("source.eidos", otherBytes.byteLength, otherSha256),
        activate: false,
      })
    )
    const otherVersion = (await otherVersionResponse.json()) as {
      versionId: string
    }
    const unequalUploadRetry = await authenticatedFetch(
      `/api/publications/tasks/versions/${otherVersion.versionId}/objects/${otherSha256}`,
      "free-upload",
      {
        method: "PUT",
        headers: {
          "Idempotency-Key": "upload-tasks-source",
          "Content-Length": otherBytes.byteLength.toString(),
          "X-Eidos-Content-SHA256": otherSha256,
        },
        body: otherBytes,
      }
    )
    expect(unequalUploadRetry.status).toBe(409)
    expect(await unequalUploadRetry.json()).toMatchObject({
      error: { code: "idempotency_conflict" },
    })

    const tenantState = await tenant("free-upload")
    expect(tenantState.usage.sourceBytes).toBe(bytes.byteLength.toString())
    const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
    const validating = await tenantStub.beginValidation(version.versionId)
    expect(validating).toMatchObject({
      ok: true,
      value: { state: "validating" },
    })
    await tenantStub.recordValidation(version.versionId, {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: "org.eidos.driver.eidos",
      driverVersion: "1.0",
      valid: true,
      diagnostics: [],
    })
    const target = {
      kind: "runtime" as const,
      runtimeProfile: "eidos-serve-publish/1" as const,
      instanceKey: version.versionId,
      versionId: version.versionId,
      sourceManifestSha256: version.sourceManifestSha256,
    }
    const targetSha256 = await canonicalSha256(target)
    await tenantStub.markReady(version.versionId, target, targetSha256, {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: "org.eidos.driver.eidos",
      driverVersion: "1.0",
      servingTargetSha256: targetSha256,
      readyAt: new Date().toISOString(),
      conformance: ["EP-Eidos-1.0"],
    })
    const activated = await authenticatedFetch(
      `/api/publications/tasks/versions/${version.versionId}/activate`,
      "free-upload",
      {
        method: "POST",
        headers: { "Idempotency-Key": "activate-tasks-version" },
      }
    )
    expect(activated.status).toBe(200)
    expect(await activated.json()).toMatchObject({
      toVersionId: version.versionId,
    })
    expect(
      await tenantStub.reconcileActivation(
        version.publicationId,
        version.versionId,
        activated.headers.get("x-eidos-request-id")!
      )
    ).toMatchObject({ ok: true, value: { toVersionId: version.versionId } })
    expect((await tenant("free-upload")).publications[0]).toMatchObject({
      slug: "tasks",
      currentVersionId: version.versionId,
    })
    const proxyAuthorization = await tenantStub.authorizeRuntimeProxyRequest(
      {
        slug: "tasks",
        publicationId: version.publicationId,
        versionId: version.versionId,
        servingTargetSha256: targetSha256,
        visibility: "public",
        accessMode: "public",
        accessRevision: 0,
      },
      "proxy-client",
      "proxy-runtime-lease",
      "2026-08-22T08:00:00.000Z"
    )
    expect(proxyAuthorization).toMatchObject({
      ok: true,
      value: {
        runtimeIdleSeconds: 60,
        version: { versionId: version.versionId },
      },
    })
    await tenantStub.completeRuntimeRequest("proxy-runtime-lease")
    expect(
      await tenantStub.authorizeRuntimeProxyRequest(
        {
          slug: "tasks",
          publicationId: version.publicationId,
          versionId: version.versionId,
          servingTargetSha256: targetSha256,
          visibility: "public",
          accessMode: "public",
          accessRevision: 1,
        },
        "stale-proxy-client",
        "stale-proxy-runtime-lease",
        "2026-08-22T08:00:00.000Z"
      )
    ).toMatchObject({
      ok: false,
      error: { code: "stale_runtime_ticket" },
    })
    for (let index = 0; index < 4; index += 1) {
      expect(
        await tenantStub.authorizeRuntimeRequest(
          version.publicationId,
          version.versionId,
          `client-${index}`,
          false,
          `runtime-lease-${index}`,
          "2026-08-22T08:00:00.000Z"
        )
      ).toMatchObject({ ok: true })
    }
    expect(
      await tenantStub.authorizeRuntimeRequest(
        version.publicationId,
        version.versionId,
        "client-over-limit",
        false,
        "runtime-lease-over-limit",
        "2026-08-22T08:00:00.000Z"
      )
    ).toMatchObject({
      ok: false,
      error: { code: "runtime_concurrency_exceeded" },
    })
    await tenantStub.completeRuntimeRequest("runtime-lease-0")
    expect(
      await tenantStub.authorizeRuntimeRequest(
        version.publicationId,
        version.versionId,
        "client-after-release",
        false,
        "runtime-lease-after-release",
        "2026-08-22T08:00:01.000Z"
      )
    ).toMatchObject({ ok: true })
    const shell = await SELF.fetch(
      `https://${tenantState.publicSiteId}.eidos.ink/tasks`
    )
    expect(shell.status).toBe(200)
    expect(shell.headers.get("content-type")).toContain("text/html")
    expect(shell.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    )
    expect(shell.headers.get("x-content-type-options")).toBe("nosniff")
    const shellHtml = await shell.text()
    expect(shellHtml).toContain('name="eidos-publish-slug" content="tasks"')
    expect(shellHtml).toContain('name="eidos-publish-branding" content="show"')
    expect(shellHtml).not.toContain('class="eidos-publish-brand"')
    expect(shellHtml).not.toContain("publish-brand.v4.css")
    const brandStyles = await SELF.fetch(
      `https://${tenantState.publicSiteId}.eidos.ink/_eidos/publish-brand.v4.css`
    )
    expect(brandStyles.status).toBe(200)
    expect(brandStyles.headers.get("content-type")).toContain("text/css")
    const brandCss = await brandStyles.text()
    expect(brandCss).toContain("box-sizing: border-box")
    expect(brandCss).toContain("min-height: 100dvh")
    expect(brandCss).toContain("margin-top: auto")
    expect(brandCss).toContain(".eidos-publish-brand-footer")
    expect(brandCss).toContain("justify-content: center")
    expect(brandCss).not.toContain("position: fixed")
    const session = await SELF.fetch(
      `https://${tenantState.publicSiteId}.eidos.ink/_eidos/session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "tasks" }),
      }
    )
    expect(session.status).toBe(202)
    expect(await session.json()).toMatchObject({
      status: "starting",
      runtimeBase: "/_eidos/runtime/tasks",
    })
    const invalidProxy = await SELF.fetch(
      `https://${tenantState.publicSiteId}.eidos.ink/_eidos/runtime/tasks/api/manifest`,
      { headers: { Authorization: "EidosRuntime invalid" } }
    )
    expect(invalidProxy.status).toBe(401)
    const deleteCurrent = await authenticatedFetch(
      `/api/publications/tasks/versions/${version.versionId}`,
      "free-upload",
      {
        method: "DELETE",
        headers: { "Idempotency-Key": "delete-current-version" },
      }
    )
    expect(deleteCurrent.status).toBe(409)
    expect(await deleteCurrent.json()).toMatchObject({
      error: { code: "current_version_delete_forbidden" },
    })
    await tenantStub.markTargetUnhealthy(
      version.versionId,
      "source_unavailable"
    )
    const unavailableSession = await SELF.fetch(
      `https://${tenantState.publicSiteId}.eidos.ink/_eidos/session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "tasks" }),
      }
    )
    expect(unavailableSession.status).toBe(503)
    expect(await unavailableSession.json()).toMatchObject({
      error: { code: "runtime_unavailable" },
    })
  })

  it("deduplicates attachment objects and serves authorized immutable assets with ranges", async () => {
    const slug = "attachments"
    const token = "free-attachments"
    await authenticatedFetch(
      `/api/publications/${slug}`,
      token,
      mutation("create-attachments")
    )
    const source = new TextEncoder().encode("attachment manifest source")
    const attachment = new TextEncoder().encode("shared attachment body")
    const sourceSha256 = await digestHex(source)
    const attachmentSha256 = await digestHex(attachment)
    const begun = await authenticatedFetch(
      `/api/publications/${slug}/versions`,
      token,
      mutation("begin-attachments", {
        driver: { id: "org.eidos.driver.eidos", version: "1.0" },
        manifest: {
          spec: "eidos.publish/source-bundle@1",
          mediaType: "application/vnd.eidos+sqlite3",
          entrypoint: "source.eidos",
          files: [
            {
              path: "assets/report.txt",
              role: "attachment",
              mediaType: "text/plain",
              bytes: attachment.byteLength.toString(),
              sha256: attachmentSha256,
            },
            {
              path: "source.eidos",
              role: "entrypoint",
              mediaType: "application/vnd.eidos+sqlite3",
              bytes: source.byteLength.toString(),
              sha256: sourceSha256,
            },
          ],
          assetReferences: [
            {
              kind: "eidos-file-entry",
              entryId: TABLE_ID,
              uri: "assets/report.txt",
              fileSha256: attachmentSha256,
            },
            {
              kind: "eidos-file-entry",
              entryId: VIEW_ID,
              uri: "assets/report.txt",
              fileSha256: attachmentSha256,
            },
          ],
        },
        activate: false,
      })
    )
    expect(begun.status).toBe(201)
    const version = (await begun.json()) as {
      versionId: string
      sourceManifestSha256: string
      uploadPlan: Array<{ sha256: string; state: string }>
      storage: { usedBytes: string }
    }
    expect(version.uploadPlan).toHaveLength(2)
    expect(version.storage.usedBytes).toBe(
      (source.byteLength + attachment.byteLength).toString()
    )
    for (const object of [
      { bytes: source, sha256: sourceSha256 },
      { bytes: attachment, sha256: attachmentSha256 },
    ]) {
      const uploaded = await authenticatedFetch(
        `/api/publications/${slug}/versions/${version.versionId}/objects/${object.sha256}`,
        token,
        {
          method: "PUT",
          headers: {
            "Idempotency-Key": `upload-${object.sha256}`,
            "Content-Length": object.bytes.byteLength.toString(),
            "X-Eidos-Content-SHA256": object.sha256,
          },
          body: object.bytes,
        }
      )
      expect(uploaded.status).toBe(200)
    }
    await authenticatedFetch(
      `/api/publications/${slug}/versions/${version.versionId}/complete`,
      token,
      {
        method: "POST",
        headers: { "Idempotency-Key": "complete-attachments" },
      }
    )
    const tenantState = await tenant(token)
    const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
    await tenantStub.beginValidation(version.versionId)
    await tenantStub.recordValidation(version.versionId, {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: "org.eidos.driver.eidos",
      driverVersion: "1.0",
      valid: true,
      diagnostics: [],
    })
    const target = {
      kind: "runtime" as const,
      runtimeProfile: "eidos-serve-publish/1" as const,
      instanceKey: version.versionId,
      versionId: version.versionId,
      sourceManifestSha256: version.sourceManifestSha256,
    }
    const targetSha256 = await canonicalSha256(target)
    await tenantStub.markReady(version.versionId, target, targetSha256, {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: "org.eidos.driver.eidos",
      driverVersion: "1.0",
      servingTargetSha256: targetSha256,
      readyAt: new Date().toISOString(),
      conformance: [],
    })
    const activated = await authenticatedFetch(
      `/api/publications/${slug}/versions/${version.versionId}/activate`,
      token,
      {
        method: "POST",
        headers: { "Idempotency-Key": "activate-attachments" },
      }
    )
    expect(activated.status).toBe(200)
    const assetUrl = `https://${tenantState.canonicalHost}/_eidos/files/${slug}/${version.versionId}/${attachmentSha256}/assets/report.txt`
    const asset = await SELF.fetch(assetUrl)
    expect(asset.status).toBe(200)
    expect(asset.headers.get("content-type")).toBe("text/plain")
    expect(asset.headers.get("content-disposition")).toContain("attachment")
    expect(await asset.text()).toBe("shared attachment body")

    const range = await SELF.fetch(assetUrl, {
      headers: { Range: "bytes=0-5" },
    })
    expect(range.status).toBe(206)
    expect(range.headers.get("content-range")).toBe(
      `bytes 0-5/${attachment.byteLength}`
    )
    expect(await range.text()).toBe("shared")
  })

  it("renders Markdown safely and serves its immutable attachments", async () => {
    const token = "pro-token"
    const slug = "release-notes"
    await authenticatedFetch(
      `/api/publications/${slug}`,
      token,
      mutation("create-markdown")
    )
    const markdown = new TextEncoder().encode(
      "# Release notes\n\n![Diagram](assets/diagram.png)\n\n[Download](files/guide.pdf)\n\n<script>alert('unsafe')</script>"
    )
    const diagram = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const guide = new TextEncoder().encode("published guide")
    const markdownSha256 = await digestHex(markdown)
    const diagramSha256 = await digestHex(diagram)
    const guideSha256 = await digestHex(guide)
    const begun = await authenticatedFetch(
      `/api/publications/${slug}/versions`,
      token,
      mutation("begin-markdown", {
        driver: { id: "org.eidos.driver.markdown", version: "1.0" },
        manifest: {
          spec: "eidos.publish/source-bundle@1",
          mediaType: "text/markdown",
          entrypoint: "source.md",
          files: [
            {
              path: "assets/diagram.png",
              role: "attachment",
              mediaType: "image/png",
              bytes: diagram.byteLength.toString(),
              sha256: diagramSha256,
            },
            {
              path: "files/guide.pdf",
              role: "attachment",
              mediaType: "application/pdf",
              bytes: guide.byteLength.toString(),
              sha256: guideSha256,
            },
            {
              path: "source.md",
              role: "entrypoint",
              mediaType: "text/markdown",
              bytes: markdown.byteLength.toString(),
              sha256: markdownSha256,
            },
          ],
          assetReferences: [
            {
              kind: "markdown-link",
              uri: "assets/diagram.png",
              fileSha256: diagramSha256,
            },
            {
              kind: "markdown-link",
              uri: "files/guide.pdf",
              fileSha256: guideSha256,
            },
          ],
        },
        activate: false,
      })
    )
    expect(begun.status).toBe(201)
    const version = (await begun.json()) as {
      versionId: string
      publicationId: string
      sourceManifestSha256: string
    }
    for (const object of [
      { bytes: diagram, sha256: diagramSha256 },
      { bytes: guide, sha256: guideSha256 },
      { bytes: markdown, sha256: markdownSha256 },
    ]) {
      expect(
        (
          await authenticatedFetch(
            `/api/publications/${slug}/versions/${version.versionId}/objects/${object.sha256}`,
            token,
            {
              method: "PUT",
              headers: {
                "Idempotency-Key": `upload-${object.sha256}`,
                "Content-Length": object.bytes.byteLength.toString(),
                "X-Eidos-Content-SHA256": object.sha256,
              },
              body: object.bytes,
            }
          )
        ).status
      ).toBe(200)
    }
    expect(
      (
        await authenticatedFetch(
          `/api/publications/${slug}/versions/${version.versionId}/complete`,
          token,
          {
            method: "POST",
            headers: { "Idempotency-Key": "complete-markdown" },
          }
        )
      ).status
    ).toBe(200)

    const tenantState = await tenant(token)
    const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
    const status = await tenantStub.getVersionStatus(slug, version.versionId)
    expect(status.ok).toBe(true)
    if (!status.ok) throw new Error(status.error.message)
    await tenantStub.beginValidation(version.versionId)
    const validation = await validateMarkdownVersion(env, status.value)
    expect(validation.valid).toBe(true)
    await tenantStub.recordValidation(version.versionId, validation)
    const prepared = await prepareMarkdownVersion(
      env,
      tenantStub,
      tenantState.publicSiteId,
      slug,
      status.value
    )
    await probeMarkdownTarget(env, prepared.target, prepared.artifact)
    await tenantStub.markReady(
      version.versionId,
      prepared.target,
      prepared.targetSha256,
      prepared.readyReceipt
    )
    const activated = await authenticatedFetch(
      `/api/publications/${slug}/versions/${version.versionId}/activate`,
      token,
      {
        method: "POST",
        headers: { "Idempotency-Key": "activate-markdown" },
      }
    )
    expect(activated.status).toBe(200)
    await tenantStub.reconcileActivation(
      version.publicationId,
      version.versionId,
      activated.headers.get("x-eidos-request-id")!
    )

    const page = await SELF.fetch(
      `https://${tenantState.canonicalHost}/${slug}`
    )
    expect(page.status).toBe(200)
    expect(page.headers.get("content-security-policy")).toContain(
      "default-src 'none'"
    )
    const html = await page.text()
    expect(html).toContain("<h1>Release notes</h1>")
    expect(html).not.toContain("<script>")
    expect(html).toContain('class="eidos-publish-brand-footer"')
    expect(html).toContain('class="eidos-publish-brand"')
    expect(html).toContain('class="eidos-publish-brand-page"')
    expect(html).toContain("Built with <strong>Eidos</strong>")
    expect(html).toContain('href="/_eidos/publish-brand.v4.css"')
    expect(html).toContain(
      `/_eidos/files/${slug}/${version.versionId}/${diagramSha256}/assets/diagram.png`
    )
    expect(html).toContain(
      `/_eidos/files/${slug}/${version.versionId}/${guideSha256}/files/guide.pdf`
    )

    const hiddenBranding = await authenticatedFetch(
      `/api/publications/${slug}/branding`,
      token,
      brandingMutation("hide-markdown-branding", false)
    )
    expect(hiddenBranding.status).toBe(200)
    expect(await hiddenBranding.json()).toMatchObject({ showBranding: false })
    const unbrandedPage = await SELF.fetch(
      `https://${tenantState.canonicalHost}/${slug}`
    )
    expect(unbrandedPage.status).toBe(200)
    const unbrandedHtml = await unbrandedPage.text()
    expect(unbrandedHtml).toContain("<h1>Release notes</h1>")
    expect(unbrandedHtml).not.toContain('class="eidos-publish-brand"')
    expect(unbrandedHtml).not.toContain("publish-brand.v4.css")

    const restoredBranding = await authenticatedFetch(
      `/api/publications/${slug}/branding`,
      token,
      brandingMutation("show-markdown-branding", true)
    )
    expect(restoredBranding.status).toBe(200)
    expect(await restoredBranding.json()).toMatchObject({ showBranding: true })

    const image = await SELF.fetch(
      `https://${tenantState.canonicalHost}/_eidos/files/${slug}/${version.versionId}/${diagramSha256}/assets/diagram.png`
    )
    expect(image.status).toBe(200)
    expect(image.headers.get("content-disposition")).toContain("inline")

    const attachment = await SELF.fetch(
      `https://${tenantState.canonicalHost}/_eidos/files/${slug}/${version.versionId}/${guideSha256}/files/guide.pdf`
    )
    expect(attachment.status).toBe(200)
    expect(attachment.headers.get("content-type")).toBe("application/pdf")
    expect(new TextDecoder().decode(await attachment.arrayBuffer())).toBe(
      "published guide"
    )
  })

  it("publishes a Form revision, accepts deduplicated attachments, and leases the Inbox", async () => {
    const token = "free-form"
    const slug = "feedback"
    await authenticatedFetch(
      `/api/publications/${slug}`,
      token,
      mutation("create-feedback-form")
    )
    const definition = {
      spec: "eidos.publish/form-definition@1",
      source: {
        fileId: FILE_ID,
        tableId: TABLE_ID,
        viewId: VIEW_ID,
        schemaRevision: "1",
        schemaFingerprint: "f".repeat(64),
      },
      presentation: {
        title: "Product feedback",
        description: "Tell us what should improve.",
        submitLabel: "Send feedback",
        successMessage: "Thank you. Your response was received.",
      },
      fields: [
        {
          fieldId: EMAIL_FIELD_ID,
          inputKey: "input_email_00000001",
          type: "text",
          label: "Email",
          description: null,
          placeholder: "you@example.com",
          multiline: true,
          required: true,
          nullable: false,
          constraints: { maxBytes: 320 },
        },
        {
          fieldId: FILE_FIELD_ID,
          inputKey: "input_file_000000001",
          type: "file",
          label: "Screenshot",
          description: null,
          placeholder: null,
          multiline: false,
          required: false,
          nullable: false,
          constraints: { multiple: false },
        },
        {
          fieldId: SELECT_FIELD_ID,
          inputKey: "input_select_00000001",
          type: "select",
          label: "Importance",
          description: null,
          placeholder: null,
          multiline: false,
          required: false,
          nullable: true,
          constraints: {
            options: [
              { name: "Blocking", color: "red" },
              { name: "Helpful", color: "blue" },
            ],
          },
        },
        {
          fieldId: MULTI_SELECT_FIELD_ID,
          inputKey: "input_multi_000000001",
          type: "multi-select",
          label: "Platforms",
          description: null,
          placeholder: null,
          multiline: false,
          required: false,
          nullable: true,
          constraints: {
            options: [
              { name: "macOS", color: "purple" },
              { name: "Web", color: "green" },
            ],
          },
        },
      ],
    }
    const bytes = new TextEncoder().encode(canonicalJson(definition))
    const sha256 = await digestHex(bytes)
    const begun = await authenticatedFetch(
      `/api/publications/${slug}/versions`,
      token,
      mutation("begin-feedback-form", {
        driver: { id: "org.eidos.driver.form", version: "1.0" },
        manifest: {
          spec: "eidos.publish/source-bundle@1",
          mediaType: "application/vnd.eidos.form+json",
          entrypoint: "form.json",
          files: [
            {
              path: "form.json",
              role: "entrypoint",
              mediaType: "application/vnd.eidos.form+json",
              bytes: bytes.byteLength.toString(),
              sha256,
            },
          ],
          assetReferences: [],
        },
        activate: false,
      })
    )
    expect(begun.status).toBe(201)
    const version = (await begun.json()) as {
      publicationId: string
      versionId: string
      sourceManifestSha256: string
    }
    expect(
      (
        await authenticatedFetch(
          `/api/publications/${slug}/versions/${version.versionId}/objects/${sha256}`,
          token,
          {
            method: "PUT",
            headers: {
              "Idempotency-Key": "upload-feedback-form",
              "Content-Length": bytes.byteLength.toString(),
              "X-Eidos-Content-SHA256": sha256,
            },
            body: bytes,
          }
        )
      ).status
    ).toBe(200)
    expect(
      (
        await authenticatedFetch(
          `/api/publications/${slug}/versions/${version.versionId}/complete`,
          token,
          {
            method: "POST",
            headers: { "Idempotency-Key": "complete-feedback-form" },
          }
        )
      ).status
    ).toBe(200)

    const tenantState = await tenant(token)
    const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
    const status = await tenantStub.getVersionStatus(slug, version.versionId)
    expect(status.ok).toBe(true)
    if (!status.ok) throw new Error(status.error.message)
    await tenantStub.beginValidation(version.versionId)
    const validation = await validateFormVersion(env, status.value)
    await tenantStub.recordValidation(version.versionId, validation)
    const prepared = await prepareFormVersion(
      env,
      tenantStub,
      tenantState.publicSiteId,
      slug,
      status.value
    )
    await probeFormTarget(env, prepared.target, prepared.artifact)
    await tenantStub.markReady(
      version.versionId,
      prepared.target,
      prepared.targetSha256,
      prepared.readyReceipt
    )
    const activated = await authenticatedFetch(
      `/api/publications/${slug}/versions/${version.versionId}/activate`,
      token,
      {
        method: "POST",
        headers: { "Idempotency-Key": "activate-feedback-form" },
      }
    )
    expect(activated.status).toBe(200)
    await tenantStub.reconcileActivation(
      version.publicationId,
      version.versionId,
      activated.headers.get("x-eidos-request-id")!
    )

    const publicOrigin = `https://${tenantState.canonicalHost}`
    const pageInboxStub = env.FORM_INBOXES.getByName(tenantState.publicSiteId)
    const inboxUpdatedBeforePage = await runInDurableObject(
      pageInboxStub,
      (_instance, state) =>
        state.storage.sql
          .exec<{ updated_at: string }>(
            "SELECT updated_at FROM form_state WHERE publication_id = ?",
            version.publicationId
          )
          .one().updated_at
    )
    const initiallyPublicPage = await SELF.fetch(`${publicOrigin}/${slug}`)
    expect(initiallyPublicPage.status).toBe(200)
    expect(initiallyPublicPage.headers.get("cache-control")).toBe(
      "private, no-store"
    )
    const inboxUpdatedAfterPage = await runInDurableObject(
      pageInboxStub,
      (_instance, state) =>
        state.storage.sql
          .exec<{ updated_at: string }>(
            "SELECT updated_at FROM form_state WHERE publication_id = ?",
            version.publicationId
          )
          .one().updated_at
    )
    expect(inboxUpdatedAfterPage).toBe(inboxUpdatedBeforePage)

    const formPolicy = await authenticatedFetch(
      `/api/publications/${slug}/form-policy`,
      token,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "restrict-feedback-form",
        },
        body: JSON.stringify({
          respondentAccess: "signed_in",
          allowMultipleResponses: false,
        }),
      }
    )
    expect(formPolicy.status).toBe(200)
    expect(await formPolicy.json()).toMatchObject({
      respondentAccess: "signed_in",
      allowMultipleResponses: false,
      revision: 1,
    })

    const signIn = await SELF.fetch(`${publicOrigin}/${slug}`, {
      redirect: "manual",
    })
    expect(signIn.status).toBe(303)
    const signInLocation = new URL(signIn.headers.get("location")!)
    expect(signInLocation.searchParams.get("purpose")).toBe("form")
    const unauthorizedDefinition = await SELF.fetch(
      `${publicOrigin}/_eidos/forms/${slug}/definition`
    )
    expect(unauthorizedDefinition.status).toBe(401)
    expect(await unauthorizedDefinition.json()).toMatchObject({
      error: { code: "form_authentication_required" },
      authorizationUrl: expect.stringContaining("purpose=form"),
    })
    const exchange = await SELF.fetch(
      `${publicOrigin}/_eidos/form/exchange?code=${"b".repeat(43)}`,
      { redirect: "manual" }
    )
    expect(exchange.status).toBe(303)
    const respondentCookie = exchange.headers
      .get("set-cookie")!
      .split(";", 1)[0]!
    expect(respondentCookie).toContain("__Host-eidos_publish_respondent=")

    const revokedExchange = await SELF.fetch(
      `${publicOrigin}/_eidos/form/exchange?code=${"c".repeat(43)}`,
      { redirect: "manual" }
    )
    expect(revokedExchange.status).toBe(303)
    const revokedCookie = revokedExchange.headers
      .get("set-cookie")!
      .split(";", 1)[0]!
    expect(
      (
        await SELF.fetch(`${publicOrigin}/${slug}`, {
          redirect: "manual",
          headers: { Cookie: revokedCookie },
        })
      ).status
    ).toBe(303)
    expect(
      (
        await SELF.fetch(`${publicOrigin}/_eidos/forms/${slug}/definition`, {
          headers: { Cookie: revokedCookie },
        })
      ).status
    ).toBe(401)

    const page = await SELF.fetch(`${publicOrigin}/${slug}`, {
      headers: { Cookie: respondentCookie },
    })
    expect(page.status).toBe(200)
    expect(page.headers.get("cache-control")).toBe("private, no-store")
    expect(page.headers.get("content-security-policy")).toContain(
      "script-src 'self'"
    )
    const formHtml = await page.text()
    expect(formHtml).toContain('id="eidos-form-root"')
    expect(formHtml).toContain("data-eidos-published-form")
    expect(formHtml).toContain('data-eidos-form-theme="v2"')
    expect(formHtml).toContain(".form-header")
    expect(formHtml).toContain(".choice-trigger")
    expect(formHtml).toContain(".choice-menu")
    expect(formHtml).toContain(".option-tag")
    expect(formHtml).toContain('data-option-color="red"')
    expect(formHtml).toContain(".file-control")
    expect(formHtml).toContain('class="eidos-publish-brand-footer"')
    expect(formHtml).toContain('class="eidos-publish-brand"')
    expect(formHtml).toContain('class="eidos-publish-brand-page"')
    expect(formHtml).toContain("Built with <strong>Eidos</strong>")
    expect(formHtml).toContain('href="/_eidos/publish-brand.v4.css"')
    expect(formHtml).toContain('src="/_eidos/forms/client.v3.js"')
    expect(formHtml).toContain('id="eidos-form-definition"')
    expect(formHtml).toContain('"title":"Product feedback"')
    expect(formHtml).toContain('"inputKey":"input_email_00000001"')
    expect(formHtml).not.toContain(EMAIL_FIELD_ID)
    const script = await SELF.fetch(`${publicOrigin}/_eidos/forms/client.v3.js`)
    expect(script.status).toBe(200)
    const scriptSource = await script.text()
    expect(scriptSource).not.toContain('"Content-Length"')
    expect(scriptSource).toContain('field.type === "text" && field.multiline')
    expect(scriptSource).toContain("choiceControl(field, false)")
    expect(scriptSource).toContain("choiceControl(field, true)")
    expect(scriptSource).toContain('class: "choice-trigger"')
    expect(scriptSource).toContain('role: "listbox"')
    expect(scriptSource).toContain('class: "option-tag"')
    expect(scriptSource).not.toContain('el("select"')
    expect(scriptSource).toContain('class: "file-control"')
    expect(scriptSource).not.toContain("selectedOptions")
    expect(scriptSource).toContain("embeddedDefinition()")
    expect(scriptSource).toContain("loadSubmissionIntent")
    expect(scriptSource).not.toContain("load().then")
    expect(() => new Function(scriptSource)).not.toThrow()

    const publicDefinitionResponse = await SELF.fetch(
      `${publicOrigin}/_eidos/forms/${slug}/definition`,
      { headers: { Cookie: respondentCookie } }
    )
    expect(publicDefinitionResponse.status).toBe(200)
    const publicDefinition = (await publicDefinitionResponse.json()) as {
      publicationVersionId: string
      submissionIntent: string
      fields: Array<{
        inputKey: string
        fieldId?: string
        multiline: boolean
      }>
    }
    expect(publicDefinition.publicationVersionId).toBe(version.versionId)
    expect(publicDefinition.fields[0]).not.toHaveProperty("fieldId")
    expect(publicDefinition.fields[0]?.multiline).toBe(true)

    const attachment = new TextEncoder().encode("same screenshot bytes")
    const attachmentSha256 = await digestHex(attachment)
    const attachmentId = "attachment00000001"
    const initialized = await SELF.fetch(
      `${publicOrigin}/_eidos/forms/${slug}/submissions/init`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: respondentCookie,
        },
        body: JSON.stringify({
          intent: publicDefinition.submissionIntent,
          idempotencyKey: "submission-feedback-0001",
          values: { input_email_00000001: "person@example.com" },
          attachments: [
            {
              attachmentId,
              inputKey: "input_file_000000001",
              name: "screenshot.txt",
              mediaType: "text/plain",
              bytes: attachment.byteLength.toString(),
              sha256: attachmentSha256,
            },
          ],
        }),
      }
    )
    expect(initialized.status).toBe(201)
    const submission = (await initialized.json()) as {
      submissionId: string
      attachments: Array<{ attachmentId: string; uploadUrl: string }>
    }
    expect(submission.attachments).toHaveLength(1)
    const uploaded = await SELF.fetch(
      publicOrigin + submission.attachments[0]!.uploadUrl,
      {
        method: "PUT",
        headers: {
          "Content-Length": attachment.byteLength.toString(),
          "Content-Type": "text/plain",
          "X-Eidos-Content-SHA256": attachmentSha256,
          "X-Eidos-Submission-Intent": publicDefinition.submissionIntent,
          Cookie: respondentCookie,
        },
        body: attachment,
      }
    )
    expect(uploaded.status).toBe(200)
    const completed = await SELF.fetch(
      `${publicOrigin}/_eidos/forms/${slug}/submissions/${submission.submissionId}/complete`,
      {
        method: "POST",
        headers: {
          "X-Eidos-Submission-Intent": publicDefinition.submissionIntent,
          Cookie: respondentCookie,
        },
      }
    )
    expect(completed.status).toBe(200)
    expect(await completed.json()).toMatchObject({
      submissionId: submission.submissionId,
      state: "committed",
      sequence: "1",
    })
    const duplicate = await SELF.fetch(
      `${publicOrigin}/_eidos/forms/${slug}/submissions/init`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: respondentCookie,
        },
        body: JSON.stringify({
          intent: publicDefinition.submissionIntent,
          idempotencyKey: "submission-feedback-0002",
          values: { input_email_00000001: "again@example.com" },
          attachments: [],
        }),
      }
    )
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toMatchObject({
      error: { code: "response_already_submitted" },
    })

    const metadataBeforeCollect = await authenticatedFetch(
      `/api/forms/${version.publicationId}`,
      token
    )
    expect(metadataBeforeCollect.status).toBe(200)
    expect(await metadataBeforeCollect.json()).toMatchObject({
      stats: {
        pendingCount: 1,
        importedCount: 0,
      },
    })

    const listed = await authenticatedFetch(
      `/api/forms/${version.publicationId}/inbox`,
      token
    )
    expect(listed.status).toBe(200)
    const inbox = (await listed.json()) as {
      submissions: Array<{
        submissionId: string
        payloadJson: string
        payloadSha256: string
      }>
    }
    expect(JSON.parse(inbox.submissions[0]!.payloadJson)).toEqual({
      [EMAIL_FIELD_ID]: "person@example.com",
      [FILE_FIELD_ID]: { attachments: [attachmentId] },
    })

    const collectorId = "collector-lite-01"
    const takeover = await authenticatedFetch(
      `/api/forms/${version.publicationId}/collector/takeover`,
      token,
      mutation("takeover-feedback-collector", { collectorId })
    )
    expect(takeover.status).toBe(200)
    const collector = (await takeover.json()) as { collectorGeneration: number }
    const leased = await authenticatedFetch(
      `/api/forms/${version.publicationId}/inbox`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectorId,
          generation: collector.collectorGeneration,
          after: 0,
          limit: 10,
        }),
      }
    )
    expect(leased.status).toBe(200)
    expect(await leased.json()).toMatchObject({
      submissions: [
        {
          submissionId: submission.submissionId,
          publicationVersionId: version.versionId,
          state: "leased",
        },
      ],
    })

    const downloaded = await authenticatedFetch(
      `/api/forms/${version.publicationId}/inbox/${submission.submissionId}/attachments/${attachmentId}`,
      token
    )
    expect(downloaded.status).toBe(200)
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(attachment)
    const acknowledged = await authenticatedFetch(
      `/api/forms/${version.publicationId}/inbox/${submission.submissionId}/ack`,
      token,
      mutation("ack-feedback-submission", {
        collectorId,
        generation: collector.collectorGeneration,
        payloadSha256: inbox.submissions[0]!.payloadSha256,
      })
    )
    expect(acknowledged.status).toBe(200)
    expect(await acknowledged.json()).toMatchObject({ state: "imported" })

    const metadataAfterCollect = await authenticatedFetch(
      `/api/forms/${version.publicationId}`,
      token
    )
    expect(metadataAfterCollect.status).toBe(200)
    expect(await metadataAfterCollect.json()).toMatchObject({
      stats: { pendingCount: 0, importedCount: 1, inboxBytes: "0" },
    })

    const deduplicatedObject = await env.PUBLISH_OBJECTS.head(
      `form-inbox/${tenantState.publicSiteId}/objects/sha256/${attachmentSha256.slice(0, 2)}/${attachmentSha256}`
    )
    expect(deduplicatedObject?.size).toBe(attachment.byteLength)

    const inboxStub = env.FORM_INBOXES.getByName(tenantState.publicSiteId)
    await runInDurableObject(inboxStub, (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE submission SET purge_after = ?
            WHERE publication_id = ? AND state = 'imported'`,
        "2000-01-01T00:00:00.000Z",
        version.publicationId
      )
    })
    expect(await runDurableObjectAlarm(inboxStub)).toBe(true)
    const duplicateAfterContentRetention = await SELF.fetch(
      `${publicOrigin}/_eidos/forms/${slug}/submissions/init`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: respondentCookie,
        },
        body: JSON.stringify({
          intent: publicDefinition.submissionIntent,
          idempotencyKey: "submission-feedback-after-retention-0003",
          values: { input_email_00000001: "third@example.com" },
          attachments: [],
        }),
      }
    )
    expect(duplicateAfterContentRetention.status).toBe(409)
    expect(await duplicateAfterContentRetention.json()).toMatchObject({
      error: { code: "response_already_submitted" },
    })
  })

  it("streams multipart parts and verifies the completed whole-object digest", async () => {
    await authenticatedFetch(
      "/api/publications/multipart",
      "pro-token",
      mutation("create-multipart-publication")
    )
    const bytes = new TextEncoder().encode("multipart eidos source")
    const sha256 = await digestHex(bytes)
    const versionResponse = await authenticatedFetch(
      "/api/publications/multipart/versions",
      "pro-token",
      mutation("begin-multipart-version", {
        driver: { id: "org.eidos.driver.eidos", version: "1.0" },
        manifest: manifest("source.eidos", bytes.byteLength, sha256),
        activate: false,
      })
    )
    expect(versionResponse.status).toBe(201)
    const version = (await versionResponse.json()) as { versionId: string }
    const initiated = await authenticatedFetch(
      `/api/publications/multipart/versions/${version.versionId}/objects/${sha256}/multipart`,
      "pro-token",
      {
        method: "POST",
        headers: { "Idempotency-Key": "init-multipart-upload" },
      }
    )
    expect(initiated.status).toBe(201)
    const session = (await initiated.json()) as { sessionId: string }
    const part = await authenticatedFetch(
      `/api/publications/multipart/versions/${version.versionId}/multipart/${session.sessionId}/parts/1`,
      "pro-token",
      {
        method: "PUT",
        headers: {
          "Idempotency-Key": "upload-multipart-part-1",
          "Content-Length": bytes.byteLength.toString(),
          "X-Eidos-Content-SHA256": sha256,
        },
        body: bytes,
      }
    )
    expect(part.status).toBe(200)
    expect(await part.json()).toMatchObject({ partNumber: 1, sha256 })
    const completed = await authenticatedFetch(
      `/api/publications/multipart/versions/${version.versionId}/multipart/${session.sessionId}/complete`,
      "pro-token",
      {
        method: "POST",
        headers: { "Idempotency-Key": "complete-multipart-upload" },
      }
    )
    expect(completed.status).toBe(200)
    expect(await completed.json()).toMatchObject({
      sha256,
      state: "ready",
    })
    const finalized = await authenticatedFetch(
      `/api/publications/multipart/versions/${version.versionId}/complete`,
      "pro-token",
      {
        method: "POST",
        headers: { "Idempotency-Key": "finalize-multipart-version" },
      }
    )
    expect(finalized.status).toBe(200)
    expect(await finalized.json()).toMatchObject({
      versionId: version.versionId,
      state: "uploaded",
    })
  })

  it("allows an interrupted multipart upload to be explicitly aborted", async () => {
    await authenticatedFetch(
      "/api/publications/multipart-abort",
      "free-multipart-abort",
      mutation("create-multipart-abort")
    )
    const bytes = new TextEncoder().encode("aborted multipart source")
    const sha256 = await digestHex(bytes)
    const begun = await authenticatedFetch(
      "/api/publications/multipart-abort/versions",
      "free-multipart-abort",
      mutation("begin-multipart-abort", {
        driver: { id: "org.eidos.driver.eidos", version: "1.0" },
        manifest: manifest("source.eidos", bytes.byteLength, sha256),
        activate: false,
      })
    )
    const version = (await begun.json()) as { versionId: string }
    const initiated = await authenticatedFetch(
      `/api/publications/multipart-abort/versions/${version.versionId}/objects/${sha256}/multipart`,
      "free-multipart-abort",
      { method: "POST", headers: { "Idempotency-Key": "init-multipart-abort" } }
    )
    const session = (await initiated.json()) as { sessionId: string }
    const aborted = await authenticatedFetch(
      `/api/publications/multipart-abort/versions/${version.versionId}/multipart/${session.sessionId}`,
      "free-multipart-abort",
      {
        method: "DELETE",
        headers: { "Idempotency-Key": "abort-multipart-upload" },
      }
    )
    expect(aborted.status).toBe(200)
    expect(await aborted.json()).toMatchObject({
      sessionId: session.sessionId,
      state: "aborted",
    })
  })

  it("retries an interrupted Version deletion and never retires the active pointer", async () => {
    await authenticatedFetch(
      "/api/publications/retention",
      "free-retention",
      mutation("create-retention-publication")
    )
    const oldVersion = await uploadVersion(
      "retention",
      "free-retention",
      "retention-old",
      "old immutable source"
    )
    const activeVersion = await uploadVersion(
      "retention",
      "free-retention",
      "retention-active",
      "active immutable source"
    )
    const tenantState = await tenant("free-retention")
    const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
    await tenantStub.beginValidation(activeVersion.versionId)
    await tenantStub.recordValidation(activeVersion.versionId, {
      sourceManifestSha256: activeVersion.sourceManifestSha256,
      driverId: "org.eidos.driver.eidos",
      driverVersion: "1.0",
      valid: true,
      diagnostics: [],
    })
    const target = {
      kind: "runtime" as const,
      runtimeProfile: "eidos-serve-publish/1" as const,
      instanceKey: activeVersion.versionId,
      versionId: activeVersion.versionId,
      sourceManifestSha256: activeVersion.sourceManifestSha256,
    }
    const targetSha256 = await canonicalSha256(target)
    await tenantStub.markReady(activeVersion.versionId, target, targetSha256, {
      sourceManifestSha256: activeVersion.sourceManifestSha256,
      driverId: "org.eidos.driver.eidos",
      driverVersion: "1.0",
      servingTargetSha256: targetSha256,
      readyAt: new Date().toISOString(),
      conformance: [],
    })
    expect(
      await tenantStub.activateVersion(
        "retention",
        activeVersion.versionId,
        "test",
        "retention-activation-request",
        null,
        "retention-activation-key",
        await canonicalSha256({
          slug: "retention",
          versionId: activeVersion.versionId,
        })
      )
    ).toMatchObject({ ok: true })

    expect(
      await tenantStub.beginVersionDeletion(
        "retention",
        oldVersion.versionId,
        "test-user",
        "retention-delete-request",
        "retention-delete-key",
        await canonicalSha256({
          slug: "retention",
          versionId: oldVersion.versionId,
        })
      )
    ).toMatchObject({ ok: true, value: { state: "deleting" } })
    expect(
      await env.PUBLISH_OBJECTS.head(oldVersion.entrypointObjectKey)
    ).not.toBeNull()

    await tenantStub.runRetention("2026-08-22T12:00:00.000Z")

    expect(
      await tenantStub.getVersionStatus("retention", oldVersion.versionId)
    ).toMatchObject({
      ok: true,
      value: { state: "deleted" },
    })
    expect(
      await env.PUBLISH_OBJECTS.head(oldVersion.entrypointObjectKey)
    ).toBeNull()
    expect(
      await tenantStub.getVersionLifecycleEvents(oldVersion.versionId)
    ).toEqual([
      expect.objectContaining({
        eventType: "deletion_started",
        actor: "test-user",
        requestId: "retention-delete-request",
        reason: "user",
      }),
      expect.objectContaining({
        eventType: "deletion_completed",
        actor: "test-user",
        requestId: "retention-delete-request",
        reason: "user",
      }),
    ])
    expect(
      await tenantStub.getVersionStatus("retention", activeVersion.versionId)
    ).toMatchObject({ ok: true, value: { state: "ready" } })
    expect((await tenant("free-retention")).publications[0]).toMatchObject({
      currentVersionId: activeVersion.versionId,
    })
  })

  it("keeps only the previous Free Version and starts its one-day window when replaced", async () => {
    await authenticatedFetch(
      "/api/publications/free-history",
      "free-history",
      mutation("create-free-history-publication")
    )
    const first = await publishReadyVersion(
      "free-history",
      "free-history",
      "free-history-first",
      "first source"
    )
    const second = await publishReadyVersion(
      "free-history",
      "free-history",
      "free-history-second",
      "second source"
    )
    const current = await publishReadyVersion(
      "free-history",
      "free-history",
      "free-history-current",
      "current source"
    )
    const abandoned = await uploadVersion(
      "free-history",
      "free-history",
      "free-history-abandoned",
      "never activated source"
    )
    const tenantState = await tenant("free-history")
    const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
    const retentionStart = Date.now()

    await tenantStub.runRetention(
      new Date(retentionStart + 11 * 60_000).toISOString()
    )

    expect(
      await tenantStub.getVersionStatus("free-history", first.versionId)
    ).toMatchObject({ ok: true, value: { state: "deleted" } })
    expect(
      await tenantStub.getVersionStatus("free-history", second.versionId)
    ).toMatchObject({ ok: true, value: { state: "ready" } })
    expect(
      await tenantStub.getVersionStatus("free-history", current.versionId)
    ).toMatchObject({ ok: true, value: { state: "ready" } })
    expect(
      await tenantStub.getVersionStatus("free-history", abandoned.versionId)
    ).toMatchObject({ ok: true, value: { state: "uploaded" } })

    await tenantStub.runRetention(
      new Date(retentionStart + 25 * 60 * 60_000).toISOString()
    )

    expect(
      await tenantStub.getVersionStatus("free-history", second.versionId)
    ).toMatchObject({ ok: true, value: { state: "deleted" } })
    expect(
      await tenantStub.getVersionStatus("free-history", current.versionId)
    ).toMatchObject({ ok: true, value: { state: "ready" } })
    expect(
      await tenantStub.getVersionStatus("free-history", abandoned.versionId)
    ).toMatchObject({ ok: true, value: { state: "deleted" } })
  })

  it("keeps Pro history for 30 days from replacement", async () => {
    await authenticatedFetch(
      "/api/publications/pro-history",
      "pro-token",
      mutation("create-pro-history-publication")
    )
    const previous = await publishReadyVersion(
      "pro-history",
      "pro-token",
      "pro-history-previous",
      "previous source"
    )
    const current = await publishReadyVersion(
      "pro-history",
      "pro-token",
      "pro-history-current",
      "current source"
    )
    const tenantState = await tenant("pro-token")
    const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
    const retentionStart = Date.now()

    await tenantStub.runRetention(
      new Date(retentionStart + 29 * 24 * 60 * 60_000).toISOString()
    )
    expect(
      await tenantStub.getVersionStatus("pro-history", previous.versionId)
    ).toMatchObject({ ok: true, value: { state: "ready" } })

    await tenantStub.runRetention(
      new Date(retentionStart + 31 * 24 * 60 * 60_000).toISOString()
    )
    expect(
      await tenantStub.getVersionStatus("pro-history", previous.versionId)
    ).toMatchObject({ ok: true, value: { state: "deleted" } })
    expect(
      await tenantStub.getVersionStatus("pro-history", current.versionId)
    ).toMatchObject({ ok: true, value: { state: "ready" } })
  })

  it("rejects unequal reuse of an idempotency key", async () => {
    const first = await authenticatedFetch(
      "/api/publications/first",
      "free-idempotency",
      mutation("same-operation-key")
    )
    expect(first.status).toBe(201)
    const conflict = await authenticatedFetch(
      "/api/publications/second",
      "free-idempotency",
      mutation("same-operation-key")
    )
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({
      error: { code: "idempotency_conflict" },
    })
  })

  it("reserves bounded runtime starts before a Container can wake", async () => {
    await authenticatedFetch(
      "/api/publications/budget",
      "free-budget",
      mutation("create-budget")
    )
    const bytes = new TextEncoder().encode("budget source")
    const sha256 = await digestHex(bytes)
    const begun = await authenticatedFetch(
      "/api/publications/budget/versions",
      "free-budget",
      mutation("begin-budget", {
        driver: { id: "org.eidos.driver.eidos", version: "1.0" },
        manifest: manifest("source.eidos", bytes.byteLength, sha256),
        activate: false,
      })
    )
    const version = (await begun.json()) as { versionId: string }
    await authenticatedFetch(
      `/api/publications/budget/versions/${version.versionId}/objects/${sha256}`,
      "free-budget",
      {
        method: "PUT",
        headers: {
          "Idempotency-Key": "upload-budget",
          "Content-Length": bytes.byteLength.toString(),
          "X-Eidos-Content-SHA256": sha256,
        },
        body: bytes,
      }
    )
    await authenticatedFetch(
      `/api/publications/budget/versions/${version.versionId}/complete`,
      "free-budget",
      {
        method: "POST",
        headers: { "Idempotency-Key": "complete-budget" },
      }
    )
    const tenantState = await tenant("free-budget")
    const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
    await tenantStub.initialize(
      "free-budget",
      tenantState.publicSiteId,
      {
        ...freeAccessGrant(),
        revision: 10,
        runtimeSecondsPerPeriod: "60",
        runtimeStartsPerPeriod: 1,
      },
      null
    )
    await tenantStub.beginValidation(version.versionId)
    const first = await tenantStub.authorizeBuildRuntime(
      version.versionId,
      "build:first",
      "2026-08-22T00:00:00.000Z"
    )
    expect(first).toMatchObject({
      ok: true,
      value: { runtimeActiveSeconds: "60", runtimeStarts: 1, builds: 1 },
    })
    const replay = await tenantStub.authorizeBuildRuntime(
      version.versionId,
      "build:first",
      "2026-08-22T00:00:01.000Z"
    )
    expect(replay).toMatchObject({
      ok: true,
      value: { runtimeStarts: 1, builds: 1 },
    })
    const exhausted = await tenantStub.authorizeBuildRuntime(
      version.versionId,
      "build:second",
      "2026-08-22T00:00:02.000Z"
    )
    expect(exhausted).toMatchObject({
      ok: false,
      error: { status: 429, code: "quota_exceeded" },
    })
  })

  it("claims an independent Publish handle explicitly", async () => {
    const initial = await tenant("pro-token")
    expect(initial.preferredHandle).toBeNull()
    expect(initial.canonicalHost).toBe(initial.publicSiteId + ".eidos.ink")

    const reserved = await SELF.fetch(ORIGIN + "/_internal/handle", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Eidos-Publish-Service":
          "test-only-publish-service-secret-32-bytes-minimum",
      },
      body: JSON.stringify({
        principal: proPrincipal("pro-user"),
        handle: "r-mayne",
      }),
    })
    expect(reserved.status).toBe(400)
    expect(await reserved.json()).toMatchObject({
      error: { code: "invalid_publish_handle" },
    })

    const claimed = await SELF.fetch(ORIGIN + "/_internal/handle", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Eidos-Publish-Service":
          "test-only-publish-service-secret-32-bytes-minimum",
      },
      body: JSON.stringify({
        principal: proPrincipal("pro-user"),
        handle: "mayne",
      }),
    })
    expect(claimed.status).toBe(200)
    const result = await claimed.json<Awaited<ReturnType<typeof tenant>>>()
    expect(result.preferredHandle).toBe("mayne")
    expect(result.canonicalHost).toBe("mayne.eidos.ink")
    expect(result.access.plan).toBe("pro")

    const collision = await SELF.fetch(ORIGIN + "/_internal/handle", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Eidos-Publish-Service":
          "test-only-publish-service-secret-32-bytes-minimum",
      },
      body: JSON.stringify({
        principal: proPrincipal("pro-collision-user"),
        handle: "mayne",
      }),
    })
    expect(collision.status).toBe(409)
    expect(await collision.json()).toMatchObject({
      error: { code: "publish_handle_unavailable" },
    })

    expect(
      (
        await authenticatedFetch(
          "/api/publications/visibility-policy",
          "pro-token",
          publicationMutation("create-public-policy", "public")
        )
      ).status
    ).toBe(201)
    const ensured = await authenticatedFetch(
      "/api/publications/visibility-policy",
      "pro-token",
      publicationMutation("replace-private-policy", "private")
    )
    expect(ensured.status).toBe(201)
    expect(await ensured.json()).toMatchObject({
      visibility: "public",
      accessMode: "public",
    })
  })

  it("does not resolve a Handle until both Handle and Tenant authorities activate the same claim", async () => {
    const publicSiteId = "u-0123456789abcdef"
    const otherSiteId = "u-fedcba9876543210"
    const claimExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
    const laterClaimExpiresAt = new Date(Date.now() + 6 * 60_000).toISOString()
    const handle = env.PUBLISH_HANDLES.getByName("alice")
    const tenantStub = env.PUBLISH_TENANTS.getByName(publicSiteId)
    const claim = await handle.beginClaim("alice", publicSiteId, claimExpiresAt)
    expect(claim).not.toBeNull()
    expect(
      await handle.beginClaim("alice", otherSiteId, laterClaimExpiresAt)
    ).toBeNull()
    expect(await handle.activate(publicSiteId, claim!.claimId)).toBe(true)
    expect(await handle.resolve()).toBeNull()

    await tenantStub.initialize(
      "alice-owner",
      publicSiteId,
      {
        ...freeAccessGrant(),
        revision: 1,
        plan: "pro",
        handle: true,
        privatePublications: true,
        removeBranding: true,
      },
      null
    )
    expect(
      await tenantStub.recordHandleClaim(
        "alice",
        claim!.claimId,
        claim!.expiresAt
      )
    ).toBe(true)
    expect(await tenantStub.activateHandleClaim("alice", claim!.claimId)).toBe(
      true
    )
    expect(await handle.resolve()).toBe(publicSiteId)
    expect(
      await handle.beginClaim("alice", otherSiteId, laterClaimExpiresAt)
    ).toBeNull()

    const renamedHandle = env.PUBLISH_HANDLES.getByName("alice-new")
    const renamedClaim = await renamedHandle.beginClaim(
      "alice-new",
      publicSiteId,
      claimExpiresAt
    )
    expect(renamedClaim).not.toBeNull()
    expect(
      await tenantStub.recordHandleClaim(
        "alice-new",
        renamedClaim!.claimId,
        renamedClaim!.expiresAt
      )
    ).toBe(true)
    expect(
      await renamedHandle.activate(publicSiteId, renamedClaim!.claimId)
    ).toBe(true)
    expect(
      await tenantStub.activateHandleClaim("alice-new", renamedClaim!.claimId)
    ).toBe(true)
    expect(await tenantStub.getActiveHandle()).toBe("alice-new")
    expect(await handle.resolve()).toBe(publicSiteId)
    expect(await renamedHandle.resolve()).toBe(publicSiteId)

    await tenantStub.initialize(
      "alice-owner",
      publicSiteId,
      { ...freeAccessGrant(), revision: 2 },
      null
    )
    expect(await tenantStub.getActiveHandle()).toBeNull()
    expect(await handle.resolve()).toBe(publicSiteId)
  })

  it("rechecks current entitlements and blocks an expired Publish subscription", async () => {
    const claimed = await SELF.fetch(ORIGIN + "/_internal/handle", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Eidos-Publish-Service":
          "test-only-publish-service-secret-32-bytes-minimum",
      },
      body: JSON.stringify({
        principal: proPrincipal("downgrade-user"),
        handle: "downgrade",
      }),
    })
    expect(claimed.status).toBe(200)
    const before = await tenant("downgrade-token")
    expect(before.preferredHandle).toBe("downgrade")
    const tenantStub = env.PUBLISH_TENANTS.getByName(before.publicSiteId)
    const principal = await refreshTenantEntitlements(
      env,
      before.publicSiteId,
      tenantStub,
      true
    )
    expect(principal.access.plan).toBe("free")
    expect(principal.access.state).toBe("blocked")
    expect(await tenantStub.getActiveHandle()).toBeNull()
    expect(await env.PUBLISH_HANDLES.getByName("downgrade").resolve()).toBe(
      before.publicSiteId
    )
  })

  it("exchanges a one-time account authorization for a host-only private viewer session", async () => {
    const created = await authenticatedFetch(
      "/api/publications/private-data",
      "pro-token",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "create-private-data",
        },
        body: JSON.stringify({ visibility: "private" }),
      }
    )
    expect(created.status).toBe(201)
    const bytes = new TextEncoder().encode("private immutable source")
    const sourceSha256 = await digestHex(bytes)
    const begun = await authenticatedFetch(
      "/api/publications/private-data/versions",
      "pro-token",
      mutation("begin-private-data", {
        driver: { id: "org.eidos.driver.eidos", version: "1.0" },
        manifest: manifest("source.eidos", bytes.byteLength, sourceSha256),
        activate: false,
      })
    )
    const version = (await begun.json()) as {
      versionId: string
      sourceManifestSha256: string
    }
    await authenticatedFetch(
      `/api/publications/private-data/versions/${version.versionId}/objects/${sourceSha256}`,
      "pro-token",
      {
        method: "PUT",
        headers: {
          "Idempotency-Key": "upload-private-data",
          "Content-Length": bytes.byteLength.toString(),
          "X-Eidos-Content-SHA256": sourceSha256,
        },
        body: bytes,
      }
    )
    await authenticatedFetch(
      `/api/publications/private-data/versions/${version.versionId}/complete`,
      "pro-token",
      {
        method: "POST",
        headers: { "Idempotency-Key": "complete-private-data" },
      }
    )
    const tenantState = await tenant("pro-token")
    const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
    await tenantStub.beginValidation(version.versionId)
    await tenantStub.recordValidation(version.versionId, {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: "org.eidos.driver.eidos",
      driverVersion: "1.0",
      valid: true,
      diagnostics: [],
    })
    const target = {
      kind: "runtime" as const,
      runtimeProfile: "eidos-serve-publish/1" as const,
      instanceKey: version.versionId,
      versionId: version.versionId,
      sourceManifestSha256: version.sourceManifestSha256,
    }
    const targetSha256 = await canonicalSha256(target)
    await tenantStub.markReady(version.versionId, target, targetSha256, {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: "org.eidos.driver.eidos",
      driverVersion: "1.0",
      servingTargetSha256: targetSha256,
      readyAt: new Date().toISOString(),
      conformance: [],
    })
    const activated = await authenticatedFetch(
      `/api/publications/private-data/versions/${version.versionId}/activate`,
      "pro-token",
      {
        method: "POST",
        headers: { "Idempotency-Key": "activate-private-data" },
      }
    )
    expect(activated.status).toBe(200)
    expect((await tenant("pro-token")).publications).toContainEqual(
      expect.objectContaining({
        slug: "private-data",
        currentVersionId: version.versionId,
      })
    )
    expect(await tenantStub.resolvePublication("private-data")).toMatchObject({
      ok: true,
      value: {
        ownerUserId: "pro-user",
        publication: { visibility: "private" },
      },
    })
    const hostLabel = tenantState.canonicalHost.split(".", 1)[0]!
    if (hostLabel !== tenantState.publicSiteId) {
      expect(await env.PUBLISH_HANDLES.getByName(hostLabel).resolve()).toBe(
        tenantState.publicSiteId
      )
    }

    const publicationUrl = `https://${tenantState.canonicalHost}/private-data`
    const fallbackRedirect = await SELF.fetch(
      `https://${tenantState.publicSiteId}.eidos.ink/private-data?code=secret&password=secret&view=table`,
      { redirect: "manual" }
    )
    expect(fallbackRedirect.status).toBe(308)
    expect(fallbackRedirect.headers.get("location")).toBe(
      `${publicationUrl}?view=table`
    )
    const unauthorized = await SELF.fetch(
      `${publicationUrl}?table=${TABLE_ID}&view=${VIEW_ID}`,
      {
        redirect: "manual",
      }
    )
    expect(unauthorized.status).toBe(303)
    const authorizationLocation = new URL(unauthorized.headers.get("location")!)
    expect(authorizationLocation.origin + authorizationLocation.pathname).toBe(
      "https://eidos.space/api/publish/viewer-authorize"
    )
    expect(authorizationLocation.searchParams.get("table")).toBe(TABLE_ID)
    expect(authorizationLocation.searchParams.get("view")).toBe(VIEW_ID)
    const exchange = await SELF.fetch(
      `https://${tenantState.canonicalHost}/_eidos/private/exchange?code=` +
        `${"a".repeat(43)}&table=${TABLE_ID}&view=${VIEW_ID}`,
      { redirect: "manual" }
    )
    expect(exchange.status).toBe(303)
    expect(exchange.headers.get("location")).toBe(
      `/private-data?table=${TABLE_ID}&view=${VIEW_ID}`
    )
    const cookie = exchange.headers.get("set-cookie")
    expect(cookie).toContain("__Host-eidos_publish_viewer=")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("Secure")
    expect(cookie).not.toContain("Domain=")
    const cookieValue = cookie!.split(";", 1)[0]!

    const shell = await SELF.fetch(publicationUrl, {
      headers: { Cookie: cookieValue },
    })
    expect(shell.status).toBe(200)
    expect(shell.headers.get("cache-control")).toBe("private, no-store")
    const session = await SELF.fetch(
      `https://${tenantState.canonicalHost}/_eidos/session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieValue },
        body: JSON.stringify({ slug: "private-data" }),
      }
    )
    expect(session.status).toBe(202)
  })

  it("protects a Pro publication with a password and invalidates rotated sessions", async () => {
    const created = await authenticatedFetch(
      "/api/publications/protected-data",
      "pro-token",
      publicationMutation("create-protected-data", "public")
    )
    expect(created.status).toBe(201)
    const protectedResponse = await authenticatedFetch(
      "/api/publications/protected-data/access",
      "pro-token",
      accessMutation("protect-protected-data", {
        mode: "password",
        password: "first secure password",
      })
    )
    expect(protectedResponse.status).toBe(200)
    const protectedRecord = await protectedResponse.json()
    expect(protectedRecord).toMatchObject({
      slug: "protected-data",
      visibility: "public",
      accessMode: "password",
      accessRevision: 1,
    })
    expect(JSON.stringify(protectedRecord)).not.toContain(
      "first secure password"
    )

    const version = await uploadVersion(
      "protected-data",
      "pro-token",
      "protected-data",
      "password protected immutable source"
    )
    const tenantState = await tenant("pro-token")
    const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
    await tenantStub.beginValidation(version.versionId)
    await tenantStub.recordValidation(version.versionId, {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: "org.eidos.driver.eidos",
      driverVersion: "1.0",
      valid: true,
      diagnostics: [],
    })
    const target = {
      kind: "runtime" as const,
      runtimeProfile: "eidos-serve-publish/1" as const,
      instanceKey: version.versionId,
      versionId: version.versionId,
      sourceManifestSha256: version.sourceManifestSha256,
    }
    const targetSha256 = await canonicalSha256(target)
    await tenantStub.markReady(version.versionId, target, targetSha256, {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: "org.eidos.driver.eidos",
      driverVersion: "1.0",
      servingTargetSha256: targetSha256,
      readyAt: new Date().toISOString(),
      conformance: [],
    })
    const activated = await authenticatedFetch(
      `/api/publications/protected-data/versions/${version.versionId}/activate`,
      "pro-token",
      {
        method: "POST",
        headers: { "Idempotency-Key": "activate-protected-data" },
      }
    )
    expect(activated.status).toBe(200)

    const publicationUrl = `https://${tenantState.canonicalHost}/protected-data`
    const challenge = await SELF.fetch(
      `${publicationUrl}?table=${TABLE_ID}&view=${VIEW_ID}`
    )
    expect(challenge.status).toBe(401)
    expect(challenge.headers.get("cache-control")).toBe("private, no-store")
    expect(challenge.headers.get("content-security-policy")).toContain(
      "form-action 'self'"
    )
    const challengeHtml = await challenge.text()
    expect(challengeHtml).toContain('action="/_eidos/password"')
    expect(challengeHtml).toContain(`name="table" value="${TABLE_ID}"`)
    expect(challengeHtml).toContain(`name="view" value="${VIEW_ID}"`)
    expect(challengeHtml).not.toContain("first secure password")

    const denied = await passwordExchange(
      tenantState.canonicalHost,
      "protected-data",
      "incorrect-password"
    )
    expect(denied.status).toBe(401)
    expect(denied.headers.get("set-cookie")).toBeNull()

    const exchange = await passwordExchange(
      tenantState.canonicalHost,
      "protected-data",
      "first secure password",
      { tableId: TABLE_ID, viewId: VIEW_ID }
    )
    expect(exchange.status).toBe(303)
    expect(exchange.headers.get("location")).toBe(
      `/protected-data?table=${TABLE_ID}&view=${VIEW_ID}`
    )
    const cookie = exchange.headers.get("set-cookie")
    expect(cookie).toContain("__Host-eidos_publish_password_protected-data=")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("Secure")
    expect(cookie).not.toContain("Domain=")
    const cookieValue = cookie!.split(";", 1)[0]!
    const shell = await SELF.fetch(publicationUrl, {
      headers: { Cookie: cookieValue },
    })
    expect(shell.status).toBe(200)
    expect(shell.headers.get("cache-control")).toBe("private, no-store")
    const session = await SELF.fetch(
      `https://${tenantState.canonicalHost}/_eidos/session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieValue },
        body: JSON.stringify({ slug: "protected-data" }),
      }
    )
    expect(session.status).toBe(202)

    const rotated = await authenticatedFetch(
      "/api/publications/protected-data/access",
      "pro-token",
      accessMutation("rotate-protected-data", {
        mode: "password",
        password: "second secure password",
      })
    )
    expect(rotated.status).toBe(200)
    expect(await rotated.json()).toMatchObject({ accessRevision: 2 })
    const staleSession = await SELF.fetch(publicationUrl, {
      headers: { Cookie: cookieValue },
    })
    expect(staleSession.status).toBe(401)
    const newExchange = await passwordExchange(
      tenantState.canonicalHost,
      "protected-data",
      "second secure password"
    )
    expect(newExchange.status).toBe(303)

    const opened = await authenticatedFetch(
      "/api/publications/protected-data/access",
      "pro-token",
      accessMutation("open-protected-data", { mode: "public" })
    )
    expect(opened.status).toBe(200)
    expect(await opened.json()).toMatchObject({
      accessMode: "public",
      accessRevision: 3,
    })
    expect((await SELF.fetch(publicationUrl)).status).toBe(200)
  })

  it("keeps password access behind the Pro entitlement", async () => {
    await authenticatedFetch(
      "/api/publications/free-password",
      "free-password",
      publicationMutation("create-free-password", "public")
    )
    const response = await authenticatedFetch(
      "/api/publications/free-password/access",
      "free-password",
      accessMutation("protect-free-password", {
        mode: "password",
        password: "a sufficiently long password",
      })
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: { code: "restricted_publication_not_allowed" },
    })

    const branding = await authenticatedFetch(
      "/api/publications/free-password/branding",
      "free-password",
      brandingMutation("hide-free-branding", false)
    )
    expect(branding.status).toBe(403)
    expect(await branding.json()).toMatchObject({
      error: { code: "branding_removal_not_allowed" },
    })
  })
})

describe("Source Bundle conformance", () => {
  it("uses RFC 8785 member ordering", () => {
    expect(
      canonicalJson({ z: 1, a: "x", nested: { beta: true, alpha: null } })
    ).toBe('{"a":"x","nested":{"alpha":null,"beta":true},"z":1}')
  })

  it("rejects traversal and a non-canonical file order", async () => {
    await expect(
      validateSourceBundle(manifest("../source.eidos", 1, "0".repeat(64)), {
        maxObjectBytes: "100",
      })
    ).rejects.toMatchObject({ code: "invalid_source_path" })

    await expect(
      validateSourceBundle(
        {
          spec: "eidos.publish/source-bundle@1",
          mediaType: "application/vnd.eidos+sqlite3",
          entrypoint: "z.eidos",
          files: [
            {
              path: "z.eidos",
              role: "entrypoint",
              mediaType: "application/vnd.eidos+sqlite3",
              bytes: "1",
              sha256: "0".repeat(64),
            },
            {
              path: "a.eidos",
              role: "attachment",
              mediaType: "application/octet-stream",
              bytes: "1",
              sha256: "1".repeat(64),
            },
          ],
          assetReferences: [],
        },
        { maxObjectBytes: "100" }
      )
    ).rejects.toMatchObject({ code: "invalid_source_order" })
  })

  it("validates Markdown attachments and rejects source-specific references", async () => {
    expect(
      markdownLocalAssetUris(
        "![Inline](assets/diagram.png)\n\n[Guide][guide]\n\n[guide]: files/guide.pdf\n\n[Remote](https://eidos.space)"
      )
    ).toEqual(["assets/diagram.png", "files/guide.pdf"])
    await expect(
      validateSourceBundle(
        {
          spec: "eidos.publish/source-bundle@1",
          mediaType: "text/markdown",
          entrypoint: "source.md",
          files: [
            {
              path: "assets/diagram.png",
              role: "attachment",
              mediaType: "image/png",
              bytes: "1",
              sha256: "0".repeat(64),
            },
            {
              path: "source.md",
              role: "entrypoint",
              mediaType: "text/markdown",
              bytes: "10",
              sha256: "1".repeat(64),
            },
          ],
          assetReferences: [
            {
              kind: "eidos-file-entry",
              entryId: TABLE_ID,
              uri: "assets/diagram.png",
              fileSha256: "0".repeat(64),
            },
          ],
        },
        { maxObjectBytes: "1073741824" }
      )
    ).rejects.toMatchObject({ code: "invalid_asset_reference" })
    expect(() => markdownLocalAssetUris("[bad](javascript:alert(1))")).toThrow(
      /unsupported scheme/
    )
  })
})

async function tenant(token: string): Promise<{
  publicSiteId: string
  canonicalHost: string
  preferredHandle: string | null
  access: { plan: string }
  usage: { sourceBytes: string }
  publications: Array<{ slug: string; currentVersionId: string | null }>
}> {
  const response = await authenticatedFetch("/api/tenant", token)
  expect(response.status).toBe(200)
  return await response.json()
}

function freeAccessGrant() {
  return {
    version: 1 as const,
    revision: 0,
    service: "eidos_publish" as const,
    state: "active" as const,
    plan: "free" as const,
    handle: false,
    privatePublications: false,
    removeBranding: false,
    maxStorageBytes: "104857600",
    maxObjectBytes: "1073741824",
    retentionDays: 1,
    runtimeSecondsPerPeriod: "18000",
    runtimeStartsPerPeriod: 100,
    runtimeIdleSeconds: 60,
    collect: {
      submissionsPerPeriod: 10,
      maxSubmissionBodyBytes: 65536,
      maxAttachmentsPerSubmission: 1,
      maxFormAttachmentBytes: "5242880",
      maxInboxBytes: "52428800",
      importedRetentionDays: 1,
      passwordForms: false,
      emailNotifications: false,
    },
  }
}

function proPrincipal(userId: string) {
  return {
    sub: userId,
    publish_access: {
      ...freeAccessGrant(),
      revision: 2,
      plan: "pro" as const,
      handle: true,
      privatePublications: true,
      removeBranding: true,
      maxStorageBytes: "10737418240",
      retentionDays: 30,
    },
  }
}

async function authenticatedFetch(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${token}`)
  return await SELF.fetch(ORIGIN + path, { ...init, headers })
}

async function uploadVersion(
  slug: string,
  token: string,
  operation: string,
  content: string
): Promise<{
  versionId: string
  sourceManifestSha256: string
  sourceManifestKey: string
  entrypointObjectKey: string
}> {
  const bytes = new TextEncoder().encode(content)
  const sha256 = await digestHex(bytes)
  const begun = await authenticatedFetch(
    `/api/publications/${slug}/versions`,
    token,
    mutation(`begin-${operation}`, {
      driver: { id: "org.eidos.driver.eidos", version: "1.0" },
      manifest: manifest("source.eidos", bytes.byteLength, sha256),
      activate: false,
    })
  )
  expect(begun.status).toBe(201)
  const version = (await begun.json()) as {
    versionId: string
    sourceManifestSha256: string
    sourceManifestKey: string
    entrypointObjectKey: string
  }
  const uploaded = await authenticatedFetch(
    `/api/publications/${slug}/versions/${version.versionId}/objects/${sha256}`,
    token,
    {
      method: "PUT",
      headers: {
        "Idempotency-Key": `upload-${operation}`,
        "Content-Length": bytes.byteLength.toString(),
        "X-Eidos-Content-SHA256": sha256,
      },
      body: bytes,
    }
  )
  expect(uploaded.status).toBe(200)
  const completed = await authenticatedFetch(
    `/api/publications/${slug}/versions/${version.versionId}/complete`,
    token,
    {
      method: "POST",
      headers: { "Idempotency-Key": `complete-${operation}` },
    }
  )
  expect(completed.status).toBe(200)
  return version
}

async function publishReadyVersion(
  slug: string,
  token: string,
  operation: string,
  content: string
): Promise<{ versionId: string }> {
  const version = await uploadVersion(slug, token, operation, content)
  const tenantState = await tenant(token)
  const tenantStub = env.PUBLISH_TENANTS.getByName(tenantState.publicSiteId)
  await tenantStub.beginValidation(version.versionId)
  await tenantStub.recordValidation(version.versionId, {
    sourceManifestSha256: version.sourceManifestSha256,
    driverId: "org.eidos.driver.eidos",
    driverVersion: "1.0",
    valid: true,
    diagnostics: [],
  })
  const target = {
    kind: "runtime" as const,
    runtimeProfile: "eidos-serve-publish/1" as const,
    instanceKey: version.versionId,
    versionId: version.versionId,
    sourceManifestSha256: version.sourceManifestSha256,
  }
  const targetSha256 = await canonicalSha256(target)
  await tenantStub.markReady(version.versionId, target, targetSha256, {
    sourceManifestSha256: version.sourceManifestSha256,
    driverId: "org.eidos.driver.eidos",
    driverVersion: "1.0",
    servingTargetSha256: targetSha256,
    readyAt: new Date().toISOString(),
    conformance: [],
  })
  expect(
    await tenantStub.activateVersion(
      slug,
      version.versionId,
      "test",
      `${operation}-activation-request`,
      null,
      `${operation}-activation-key`,
      await canonicalSha256({ slug, versionId: version.versionId })
    )
  ).toMatchObject({ ok: true })
  return { versionId: version.versionId }
}

function mutation(key: string, body?: unknown): RequestInit {
  const headers = new Headers({ "Idempotency-Key": key })
  if (body !== undefined) headers.set("Content-Type", "application/json")
  return {
    method: body === undefined ? "PUT" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}

function brandingMutation(key: string, showBranding: boolean): RequestInit {
  return {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ showBranding }),
  }
}

function publicationMutation(
  key: string,
  visibility: "public" | "private"
): RequestInit {
  return {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ visibility }),
  }
}

function accessMutation(
  key: string,
  body: { mode: "password"; password: string } | { mode: "public" | "private" }
): RequestInit {
  return {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  }
}

async function passwordExchange(
  hostname: string,
  slug: string,
  password: string,
  navigation?: { tableId: string; viewId: string }
): Promise<Response> {
  const body = new URLSearchParams({ slug, password })
  if (navigation !== undefined) {
    body.set("table", navigation.tableId)
    body.set("view", navigation.viewId)
  }
  return await SELF.fetch(`https://${hostname}/_eidos/password`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  })
}

function manifest(path: string, bytes: number, sha256: string) {
  return {
    spec: "eidos.publish/source-bundle@1",
    mediaType: "application/vnd.eidos+sqlite3",
    entrypoint: path,
    files: [
      {
        path,
        role: "entrypoint",
        mediaType: "application/vnd.eidos+sqlite3",
        bytes: bytes.toString(),
        sha256,
      },
    ],
    assetReferences: [],
  }
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
