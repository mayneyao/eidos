import { env } from "cloudflare:workers"
import { SELF, abortAllDurableObjects } from "cloudflare:test"
import { afterEach, expect, it } from "vitest"
import { validateSourceBundle } from "../src/bundle"
import { freeBundleError } from "../src/free"
import { parsePrincipal } from "../src/auth"
import {
  validateMarkdownVersion,
  prepareMarkdownVersion,
} from "../src/markdown"

afterEach(async () => {
  await abortAllDurableObjects()
})

const ORIGIN = "https://publish.eidos.space"
const encoder = new TextEncoder()
async function request(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
  key: string = crypto.randomUUID()
) {
  return SELF.fetch(ORIGIN + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": key,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
async function context(token: string) {
  const response = await request(token, "/api/tenant")
  const summary = await response.json<{
    publicSiteId: string
    canonicalHost: string
  }>()
  return {
    ...summary,
    stub: env.PUBLISH_TENANTS.getByName(summary.publicSiteId),
  }
}
function manifest(
  bytes = 1,
  attachments: { bytes: number; mediaType: string }[] = []
) {
  return {
    spec: "eidos.publish/source-bundle@1",
    mediaType: "text/markdown",
    entrypoint: "source.md",
    files: [
      ...attachments.map((file, index) => ({
        path: `assets/${index}.bin`,
        role: "attachment",
        bytes: String(file.bytes),
        mediaType: file.mediaType,
        sha256: (index + 1).toString(16).padStart(64, "0"),
      })),
      {
        path: "source.md",
        role: "entrypoint",
        bytes: String(bytes),
        mediaType: "text/markdown",
        sha256: "f".repeat(64),
      },
    ].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    ),
    assetReferences: attachments
      .map((_, index) => ({
        kind: "markdown-link",
        uri: `assets/${index}.bin`,
        fileSha256: (index + 1).toString(16).padStart(64, "0"),
      }))
      .sort((left, right) =>
        left.uri < right.uri ? -1 : left.uri > right.uri ? 1 : 0
      ),
  }
}
async function begin(
  token: string,
  slug: string,
  source: ReturnType<typeof manifest>,
  key?: string
) {
  return request(
    token,
    `/api/publications/${slug}/versions`,
    "POST",
    {
      driver: { id: "org.eidos.driver.markdown", version: "1.0" },
      manifest: source,
      activate: false,
    },
    key
  )
}
async function readyMarkdown(token: string, slug: string) {
  expect(
    (await request(token, `/api/publications/${slug}`, "PUT")).status
  ).toBe(201)
  const bytes = encoder.encode(`# ${slug}`)
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("")
  const source = manifest(bytes.length)
  source.files[0]!.sha256 = hash
  const response = await begin(token, slug, source)
  expect(response.status).toBe(201)
  const { versionId } = await response.json<{ versionId: string }>()
  expect(
    (
      await SELF.fetch(
        `${ORIGIN}/api/publications/${slug}/versions/${versionId}/objects/${hash}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": crypto.randomUUID(),
            "Content-Length": String(bytes.length),
            "X-Eidos-Content-SHA256": hash,
          },
          body: bytes,
        }
      )
    ).status
  ).toBe(200)
  expect(
    (
      await request(
        token,
        `/api/publications/${slug}/versions/${versionId}/complete`,
        "POST"
      )
    ).status
  ).toBe(200)
  const { stub, publicSiteId } = await context(token)
  const status = await stub.getVersionStatus(slug, versionId)
  if (!status.ok) throw new Error(status.error.message)
  await stub.beginValidation(versionId)
  await stub.recordValidation(
    versionId,
    await validateMarkdownVersion(env, status.value)
  )
  const prepared = await prepareMarkdownVersion(
    env,
    stub,
    publicSiteId,
    slug,
    status.value
  )
  await stub.markReady(
    versionId,
    prepared.target,
    prepared.targetSha256,
    prepared.readyReceipt
  )
  return versionId
}

it("publishes Free Markdown with branding and noindex, and unpublishes without deleting source data", async () => {
  const token = "free-markdown-e2e"
  const versionId = await readyMarkdown(token, "report")
  const path = `/api/publications/report/versions/${versionId}/activate`
  expect((await request(token, path, "POST")).status).toBe(200)
  const { canonicalHost, stub } = await context(token)
  for (const method of ["GET", "HEAD"]) {
    const page = await SELF.fetch(`https://${canonicalHost}/report`, { method })
    expect(page.status).toBe(200)
    expect(page.headers.get("x-robots-tag")).toBe("noindex, nofollow")
    if (method === "GET")
      expect(await page.text()).toContain('class="eidos-publish-brand"')
  }
  const removed = await request(
    token,
    "/api/publications/report",
    "DELETE",
    undefined,
    "remove-report"
  )
  expect(removed.status).toBe(200)
  expect(await removed.json()).toMatchObject({ currentVersionId: null })
  expect(
    (
      await request(
        token,
        "/api/publications/report",
        "DELETE",
        undefined,
        "remove-report"
      )
    ).status
  ).toBe(200)
  expect((await SELF.fetch(`https://${canonicalHost}/report`)).status).toBe(404)
  expect(await stub.getVersionStatus("report", versionId)).toMatchObject({
    ok: true,
    value: { state: "ready" },
  })
  expect(
    await stub.activateVersion(
      "report",
      versionId,
      token,
      "canceled-automatic",
      null,
      "canceled-automatic",
      "0".repeat(64),
      true
    )
  ).toMatchObject({ ok: false, error: { code: "activation_canceled" } })
  await stub.runRetention(new Date(Date.now() + 11 * 60_000).toISOString())
  expect(await stub.getVersionStatus("report", versionId)).toMatchObject({
    ok: true,
    value: { state: "ready" },
  })
  await stub.runRetention(new Date(Date.now() + 25 * 60 * 60_000).toISOString())
  expect(await stub.getVersionStatus("report", versionId)).toMatchObject({
    ok: true,
    value: { state: "deleted" },
  })
})

it("serializes simultaneous activations at ten slots, allows republish, and releases an unpublished slot", async () => {
  const token = "free-ten-slots"
  const versions: string[] = []
  for (let index = 0; index < 11; index++)
    versions.push(await readyMarkdown(token, `page-${index}`))
  const activate = (index: number) =>
    request(
      token,
      `/api/publications/page-${index}/versions/${versions[index]}/activate`,
      "POST"
    )
  const results = await Promise.all(versions.map((_, index) => activate(index)))
  expect(results.filter((response) => response.status === 200)).toHaveLength(10)
  const rejected = results.findIndex((response) => response.status === 403)
  expect(await results[rejected]!.json()).toMatchObject({
    error: { code: "publication_limit_reached" },
  })
  const active = results.findIndex((response) => response.status === 200)
  expect((await activate(active)).status).toBe(200)
  expect(
    (await request(token, `/api/publications/page-${active}`, "DELETE")).status
  ).toBe(200)
  expect((await activate(rejected)).status).toBe(200)
})

it("rejects Runtime and Form bundles before reserving storage", async () => {
  const token = "free-drivers"
  await request(token, "/api/publications/report", "PUT")
  for (const [mediaType, id] of [
    ["application/vnd.eidos+sqlite3", "org.eidos.driver.eidos"],
    ["application/vnd.eidos.form+json", "org.eidos.driver.form"],
  ]) {
    const source = manifest()
    source.mediaType = mediaType!
    source.files[0]!.mediaType = mediaType!
    source.entrypoint =
      id === "org.eidos.driver.eidos" ? "source.eidos" : "form.json"
    source.files[0]!.path = source.entrypoint
    const response = await request(
      token,
      "/api/publications/report/versions",
      "POST",
      { driver: { id, version: "1.0" }, manifest: source }
    )
    expect(response.status).toBe(403)
  }
  expect(await (await context(token)).stub.getStorageUsage()).toMatchObject({
    usedBytes: "0",
    maxBytes: "104857600",
  })
})

it("caps Markdown size, bundle size, attachment count, and active content types", async () => {
  const limits = {
    maxObjectBytes: "1073741824",
    maxEidosFileBytes: "268435456",
  }
  for (const source of [
    manifest(2 * 1024 * 1024 + 1),
    manifest(
      1,
      Array.from({ length: 21 }, () => ({ bytes: 1, mediaType: "text/plain" }))
    ),
    manifest(1, [{ bytes: 26 * 1024 * 1024, mediaType: "image/png" }]),
    manifest(
      1,
      Array.from({ length: 3 }, () => ({
        bytes: 20 * 1024 * 1024,
        mediaType: "image/png",
      }))
    ),
    ...[
      "text/html",
      "image/svg+xml",
      "application/javascript",
      "application/zip",
    ].map((mediaType) => manifest(1, [{ bytes: 1, mediaType }])),
  ])
    expect(
      freeBundleError(await validateSourceBundle(source, limits))
    ).not.toBeNull()
  expect(
    freeBundleError(
      await validateSourceBundle(manifest(2 * 1024 * 1024), limits)
    )
  ).toBeNull()
})

it("reserves aggregate storage atomically and does not charge retries twice", async () => {
  const token = "free-storage-race"
  await request(token, "/api/publications/report", "PUT")
  const bundle = (index: number) => {
    const value = manifest(1, [
      { bytes: 25 * 1024 * 1024, mediaType: "image/png" },
      { bytes: 20 * 1024 * 1024, mediaType: "image/png" },
    ])
    value.files.forEach((file, fileIndex) => {
      file.sha256 = (index * 3 + fileIndex + 1).toString(16).padStart(64, "0")
    })
    value.assetReferences.forEach((reference) => {
      reference.fileSha256 = value.files.find(
        (file) => file.path === reference.uri
      )!.sha256
    })
    return value
  }
  const results = await Promise.all(
    [0, 1, 2].map((index) =>
      begin(token, "report", bundle(index), `storage-${index}`)
    )
  )
  expect(
    results.filter((result) => result.status === 201),
    (await Promise.all(results.map((result) => result.clone().text()))).join(
      "\n"
    )
  ).toHaveLength(2)
  const rejected = results.findIndex((result) => result.status === 403)
  expect(await results[rejected]!.json()).toMatchObject({
    error: { code: "storage_limit_reached" },
  })
  const accepted = results.findIndex((result) => result.status === 201)
  const { stub } = await context(token)
  const usage = await stub.getStorageUsage()
  expect(
    (await begin(token, "report", bundle(accepted), `storage-${accepted}`))
      .status
  ).toBe(201)
  expect(await stub.getStorageUsage()).toEqual(usage)
})

it("limits new uploads to twenty per UTC day while preserving idempotent retries", async () => {
  const token = "free-upload-rate"
  await request(token, "/api/publications/report", "PUT")
  for (let index = 0; index < 20; index++)
    expect(
      (await begin(token, "report", manifest(), `upload-rate-${index}`)).status
    ).toBe(201)
  expect(
    (await begin(token, "report", manifest(), "upload-rate-0")).status
  ).toBe(201)
  expect(
    (await begin(token, "report", manifest(), "upload-rate-20")).status
  ).toBe(429)
})

it("enforces the serving cap after downgrade and ignores a stale paid activation grant", async () => {
  const token = "standard-downgrade-free"
  const versions: string[] = []
  for (let index = 0; index < 11; index++) {
    const versionId = await readyMarkdown(token, `page-${index}`)
    versions.push(versionId)
    expect(
      (
        await request(
          token,
          `/api/publications/page-${index}/versions/${versionId}/activate`,
          "POST"
        )
      ).status
    ).toBe(200)
  }
  const { stub, publicSiteId } = await context(token)
  const paid = await stub.getAccessGrant()
  const free = parsePrincipal({
    sub: token,
    publish_access: { ...paid, plan: "free", revision: 10 },
  }).access
  await stub.initialize(token, publicSiteId, free, null)
  const resolved = await Promise.all(
    versions.map((_, index) => stub.resolvePublication(`page-${index}`))
  )
  expect(resolved.filter((result) => result.ok)).toHaveLength(10)
  const held = versions[0]!
  expect(
    await stub.unpublishPublication(
      "page-0",
      "downgrade-unpublish",
      "0".repeat(64)
    )
  ).toMatchObject({ ok: true })
  expect(
    await stub.activateVersion(
      "page-0",
      held,
      token,
      "stale-paid-activation",
      paid,
      "stale-paid-activation",
      "1".repeat(64)
    )
  ).toMatchObject({ ok: false, error: { code: "publication_limit_reached" } })
  expect(await stub.getAccessGrant()).toMatchObject({
    maxStorageBytes: "104857600",
    runtimeSecondsPerPeriod: "0",
    removeBranding: false,
  })
})

it("requires the account service secret for unpublishing and isolates owners", async () => {
  const token = "free-account-unpublish"
  const versionId = await readyMarkdown(token, "report")
  await request(
    token,
    `/api/publications/report/versions/${versionId}/activate`,
    "POST"
  )
  const { stub } = await context(token)
  const principal = { sub: token, publish_access: await stub.getAccessGrant() }
  const send = (body: unknown, secret?: string) =>
    SELF.fetch(ORIGIN + "/_internal/publications/report", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        ...(secret ? { "X-Eidos-Publish-Service": secret } : {}),
      },
      body: JSON.stringify(body),
    })
  expect((await send(principal)).status).toBe(404)
  const secret = "test-only-publish-service-secret-32-bytes-minimum"
  expect(
    (await send({ ...principal, sub: "another-user" }, secret)).status
  ).toBe(404)
  expect(await stub.resolvePublication("report")).toMatchObject({ ok: true })
  expect((await send(principal, secret)).status).toBe(200)
  expect(await stub.resolvePublication("report")).toMatchObject({ ok: false })
})
