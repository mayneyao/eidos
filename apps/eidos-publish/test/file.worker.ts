import { env, SELF } from "cloudflare:test"
import { describe, expect, it, vi } from "vitest"
import { gzipSync } from "node:zlib"
import { validateSourceBundle, FILE_DRIVER } from "../src/bundle"
import {
  validateFileVersion,
  prepareFileVersion,
  publishedFileUrl,
  fileViewHost,
} from "../src/file"
import { probeStaticTarget } from "../src/static"
import type { SourceBundleManifest } from "../src/contracts"

const encoder = new TextEncoder()
const source = encoder.encode("<gpx>staging fixture</gpx>")

it("reads the bound file relative to its directory without exposing other paths", async () => {
  const postMessage = vi.fn()
  const frame = { contentWindow: { postMessage }, srcdoc: "" }
  let receive!: (event: MessageEvent) => Promise<void>
  vi.stubGlobal("document", { querySelector: () => frame })
  vi.stubGlobal("window", {
    addEventListener: (_type: string, listener: typeof receive) => {
      receive = listener
    },
  })
  const fetchSource = vi.fn(async () => new Response(source))
  vi.stubGlobal("fetch", fetchSource)
  try {
    fileViewHost({
      frame: "fixture",
      url: "/source",
      path: "files/ride.gpx",
      name: "ride.gpx",
      size: source.length,
      mimeType: "application/gpx+xml",
      sha256: await hash(source),
    })
    const request = async (method: string, path: string) => {
      await receive({
        source: frame.contentWindow,
        data: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          id: crypto.randomUUID(),
          method,
          params: { path, id: "watch" },
        },
      } as unknown as MessageEvent)
      return postMessage.mock.lastCall![0]
    }
    for (const path of ["ride.gpx", "./ride.gpx", "files/ride.gpx"]) {
      expect((await request("fs.readText", path)).result.text).toContain(
        "<gpx>"
      )
      expect((await request("fs.readBinary", path)).result.data).toBeTruthy()
      expect((await request("fs.stat", path)).result.name).toBe("ride.gpx")
      expect((await request("fs.url", path)).result.url).toMatch(/^data:/)
      expect((await request("fs.watch", path)).error).toBeUndefined()
      expect((await request("fs.writeText", path)).error.code).toBe(
        "PERMISSION_DENIED"
      )
      expect((await request("fs.list", path)).error.code).toBe(
        "PERMISSION_DENIED"
      )
    }
    for (const path of [
      "secret.gpx",
      "other/ride.gpx",
      "../ride.gpx",
      "/ride.gpx",
      "files/../ride.gpx",
    ]) {
      expect((await request("fs.readText", path)).error.code).toBe(
        "PERMISSION_DENIED"
      )
    }
    expect(fetchSource).toHaveBeenCalledTimes(1)
  } finally {
    vi.unstubAllGlobals()
  }
})
const hash = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
    ),
    (b) => b.toString(16).padStart(2, "0")
  ).join("")
const fetchApi = (path: string, token: string, init: RequestInit = {}) =>
  SELF.fetch("https://publish.eidos.space" + path, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers)),
      Authorization: "Bearer " + token,
    },
  })
const mutation = (body?: unknown, method = "POST"): RequestInit => ({
  method,
  headers: {
    "Idempotency-Key": crypto.randomUUID(),
    "Content-Type": "application/json",
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
function pkg(options: { access?: string; api?: string; origin?: string } = {}) {
  return new Uint8Array(
    gzipSync(
      JSON.stringify({
        format: 2,
        manifest: {
          apiVersion: 1,
          id: "local.publish-test",
          name: "File test",
          version: "1.0.0",
          requires: { pluginApi: options.api ?? "3.0.0" },
          views: [
            {
              id: "view",
              title: "File test",
              entry: "./view.js",
              kind: "file",
              access: options.access ?? "read",
            },
          ],
          ...(options.origin
            ? { browser: { networkOrigins: [options.origin] } }
            : {}),
        },
        modules: {
          "./view.js":
            "export default async function(ctx,root){root.textContent=await ctx.capabilities.fs.readText(ctx.binding.file.path)}",
        },
      })
    )
  )
}
async function bundle(plugin?: Uint8Array): Promise<SourceBundleManifest> {
  return {
    spec: "eidos.publish/source-bundle@1",
    mediaType: "application/vnd.eidos.file",
    entrypoint: "files/ride.gpx",
    files: [
      {
        path: "files/ride.gpx",
        role: "entrypoint",
        mediaType: "application/gpx+xml",
        bytes: String(source.length),
        sha256: await hash(source),
      },
      ...(plugin
        ? [
            {
              path: "plugins/view.eidos-plugin",
              role: "plugin" as const,
              mediaType: "application/octet-stream",
              bytes: String(plugin.length),
              sha256: await hash(plugin),
            },
          ]
        : []),
    ],
    assetReferences: [],
    ...(plugin
      ? {
          presentation: {
            kind: "plugin-view" as const,
            pluginPath: "plugins/view.eidos-plugin",
            viewId: "view",
          },
        }
      : {}),
  }
}
async function upload(
  plugin?: Uint8Array,
  token = "standard-file-" + crypto.randomUUID()
) {
  const slug = "file-" + crypto.randomUUID()
  const tenantResponse = await fetchApi("/api/tenant", token)
  expect(tenantResponse.status).toBe(200)
  const tenant = await tenantResponse.json<{
    publicSiteId: string
    canonicalHost: string
  }>()
  const stub = env.PUBLISH_TENANTS.getByName(tenant.publicSiteId)
  expect(
    (
      await fetchApi(
        "/api/publications/" + slug,
        token,
        mutation({ visibility: "public" }, "PUT")
      )
    ).status
  ).toBe(201)
  const manifest = await bundle(plugin)
  const begin = await fetchApi(
    "/api/publications/" + slug + "/versions",
    token,
    mutation({
      driver: { id: FILE_DRIVER.id, version: "1.0" },
      manifest,
      activate: false,
    })
  )
  expect(begin.status, await begin.clone().text()).toBe(201)
  const { versionId } = await begin.json<{ versionId: string }>()
  for (const bytes of plugin ? [source, plugin] : [source]) {
    const digest = await hash(bytes)
    const response = await fetchApi(
      "/api/publications/" +
        slug +
        "/versions/" +
        versionId +
        "/objects/" +
        digest,
      token,
      {
        method: "PUT",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "Content-Length": String(bytes.length),
          "X-Eidos-Content-SHA256": digest,
        },
        body: new Uint8Array(bytes),
      }
    )
    expect(response.status, await response.clone().text()).toBe(200)
  }
  expect(
    (
      await fetchApi(
        "/api/publications/" + slug + "/versions/" + versionId + "/complete",
        token,
        mutation()
      )
    ).status
  ).toBe(200)
  const status = await stub.getVersionStatus(slug, versionId)
  if (!status.ok) throw new Error(status.error.message)
  return { slug, token, tenant, stub, version: status.value, manifest }
}
async function activate(data: Awaited<ReturnType<typeof upload>>) {
  const { stub, version, tenant, slug, token } = data
  await stub.beginValidation(version.versionId)
  await stub.recordValidation(
    version.versionId,
    await validateFileVersion(env, tenant.publicSiteId, version)
  )
  const prepared = await prepareFileVersion(
    env,
    stub,
    tenant.publicSiteId,
    slug,
    version
  )
  await probeStaticTarget(env, prepared.target, prepared.artifact)
  const ready = await stub.markReady(
    version.versionId,
    prepared.target,
    prepared.targetSha256,
    prepared.readyReceipt
  )
  expect(ready.ok).toBe(true)
  const response = await fetchApi(
    "/api/publications/" +
      slug +
      "/versions/" +
      version.versionId +
      "/activate",
    token,
    mutation()
  )
  expect(response.status, await response.clone().text()).toBe(200)
}
describe("File publications", () => {
  it("streams the original file from its stable URL, supports ranges and HEAD", async () => {
    const data = await upload()
    await activate(data)
    const url = "https://" + data.tenant.canonicalHost + "/" + data.slug
    const response = await SELF.fetch(url)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toContain("attachment")
    expect(response.headers.get("content-disposition")).toContain("ride.gpx")
    expect(await response.text()).toBe(decoder(source))
    expect(
      (await SELF.fetch(url, { method: "HEAD" })).headers.get("content-length")
    ).toBe(String(source.length))
    const range = await SELF.fetch(url, { headers: { Range: "bytes=0-4" } })
    expect(range.status).toBe(206)
    expect(await range.text()).toBe("<gpx>")
  })
  it("binds the plugin to the version without a public package download", async () => {
    const data = await upload(pkg())
    await activate(data)
    const response = await SELF.fetch(
      "https://" + data.tenant.canonicalHost + "/" + data.slug
    )
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('sandbox="allow-scripts"')
    expect(html).not.toContain('sandbox="allow-scripts allow-same-origin"')
    expect(html).toContain("Only the published file is available")
    const plugin = data.manifest.files[1]!
    const download = await SELF.fetch(
      "https://" +
        data.tenant.canonicalHost +
        publishedFileUrl(
          data.slug,
          data.version.versionId,
          plugin.sha256,
          plugin.path
        )
    )
    expect(download.status).toBe(404)
  })
  it("checks authorization on the file itself after access changes", async () => {
    const data = await upload(undefined, "pro-token")
    await activate(data)
    const direct =
      "https://" +
      data.tenant.canonicalHost +
      publishedFileUrl(
        data.slug,
        data.version.versionId,
        data.manifest.files[0]!.sha256,
        data.manifest.entrypoint
      )
    expect((await SELF.fetch(direct)).status).toBe(200)
    const updated = await fetchApi(
      "/api/publications/" + data.slug + "/access",
      data.token,
      mutation({ mode: "password", password: "test-password-1234" }, "PUT")
    )
    expect(updated.status).toBe(200)
    expect((await SELF.fetch(direct)).status).toBe(404)
  })
  it.each([
    { access: "write" },
    { api: "3.1.0" },
    { origin: "https://eidos.space" },
  ])("rejects unsupported or privileged plugin Views %j", async (options) => {
    const data = await upload(pkg(options))
    await expect(
      validateFileVersion(env, data.tenant.publicSiteId, data.version)
    ).rejects.toThrow()
  })
  it("validates dependency membership and includes View selection in the fingerprint", async () => {
    const manifest = await bundle(pkg())
    const first = await validateSourceBundle(manifest, {
      maxObjectBytes: "1073741824",
      maxEidosFileBytes: "1073741824",
    })
    const second = await validateSourceBundle(
      {
        ...manifest,
        presentation: { ...manifest.presentation, viewId: "other" },
      },
      { maxObjectBytes: "1073741824", maxEidosFileBytes: "1073741824" }
    )
    expect(first.manifestSha256).not.toBe(second.manifestSha256)
    await expect(
      validateSourceBundle(
        { ...manifest, presentation: undefined },
        { maxObjectBytes: "1073741824", maxEidosFileBytes: "1073741824" }
      )
    ).rejects.toThrow()
  })
})
function decoder(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes)
}
