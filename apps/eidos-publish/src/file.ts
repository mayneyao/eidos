import { gunzipSync } from "node:zlib"
import { sha256 } from "@noble/hashes/sha2.js"
import { parseManifest } from "../../../packages/plugin-runtime/src/manifest"
import {
  bootstrap,
  sandboxCsp,
} from "../../../packages/plugin-runtime/src/browser-bootstrap"
import { FILE_DRIVER, contentObjectKey, validateSourceBundle } from "./bundle"
import type {
  PublicationVersionRecord,
  ValidatedSourceBundle,
} from "./contracts"
import type { PublishTenant } from "./tenant"
import { prepareStaticTarget, StaticPreparationError } from "./static"

const MAX_VIEW_BYTES = 16 * 1024 * 1024
const decoder = new TextDecoder("utf-8", { fatal: true })

export const FILE_VIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob: 'wasm-unsafe-eval'; style-src 'unsafe-inline'; connect-src 'self' https:; img-src data: blob: https:; font-src data:; media-src blob: data: https:; worker-src blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

export async function loadFileBundle(
  env: Env,
  version: PublicationVersionRecord
): Promise<ValidatedSourceBundle> {
  const object = await env.PUBLISH_OBJECTS.get(version.sourceManifestKey)
  if (!object || object.size > 1048576)
    throw invalid("File manifest is unavailable")
  const bundle = await validateSourceBundle(JSON.parse(await object.text()), {
    maxObjectBytes: FILE_DRIVER.limits.maxObjectBytes,
    maxEidosFileBytes: FILE_DRIVER.limits.maxEntrypointBytes,
  })
  if (
    bundle.driver.id !== FILE_DRIVER.id ||
    bundle.manifestSha256 !== version.sourceManifestSha256
  )
    throw invalid("File manifest does not match the Version")
  return bundle
}

async function loadPlugin(
  env: Env,
  tenantId: string,
  bundle: ValidatedSourceBundle
) {
  const presentation = bundle.manifest.presentation
  if (!presentation) return null
  const descriptor = bundle.manifest.files.find(
    (file) => file.path === presentation.pluginPath
  )!
  const object = await env.PUBLISH_OBJECTS.get(
    contentObjectKey(tenantId, descriptor.sha256)
  )
  if (
    !object ||
    object.size > MAX_VIEW_BYTES ||
    object.size.toString() !== descriptor.bytes
  )
    throw invalid("Plugin package is unavailable or too large")
  const bytes = new Uint8Array(await object.arrayBuffer())
  if (hex(sha256(bytes)) !== descriptor.sha256)
    throw invalid("Plugin digest does not match")
  const raw: unknown = JSON.parse(
    decoder.decode(gunzipSync(bytes, { maxOutputLength: MAX_VIEW_BYTES }))
  )
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw invalid("Invalid plugin package")
  const pkg = raw as Record<string, unknown>
  if (
    pkg.format !== 2 ||
    Object.keys(pkg).sort().join() !== "format,manifest,modules"
  )
    throw invalid("Publish requires a format 2 plugin package")
  const manifest = parseManifest(pkg.manifest)
  const view = manifest.views?.find((view) => view.id === presentation.viewId)
  if (
    manifest.requires?.pluginApi !== "3.0.0" ||
    !view ||
    view.kind !== "file" ||
    view.access !== "read" ||
    view.capabilities?.length
  )
    throw invalid(
      "Publish supports read-only ordinary-file Views using plugin API 3.0.0"
    )
  if (
    manifest.workspace ||
    manifest.connections ||
    manifest.settings ||
    manifest.storage
  )
    throw invalid(
      "This View depends on local workspace, connections, settings or storage"
    )
  const origins = manifest.browser?.networkOrigins ?? []
  if (
    origins.some((origin) => {
      const host = new URL(origin).hostname
      return (
        host === "eidos.space" ||
        host.endsWith(".eidos.space") ||
        host === "eidos.ink" ||
        host.endsWith(".eidos.ink")
      )
    })
  )
    throw invalid(
      "Published plugins cannot request Eidos account or publication origins"
    )
  if (
    !pkg.modules ||
    typeof pkg.modules !== "object" ||
    Array.isArray(pkg.modules)
  )
    throw invalid("Invalid plugin modules")
  const code = (pkg.modules as Record<string, unknown>)[view.entry]
  if (typeof code !== "string" || !code.trim())
    throw invalid("Plugin View module is missing")
  return { manifest, view, code }
}

export async function validateFileVersion(
  env: Env,
  tenantId: string,
  version: PublicationVersionRecord
) {
  const bundle = await loadFileBundle(env, version)
  const source = await env.PUBLISH_OBJECTS.head(
    contentObjectKey(tenantId, bundle.entrypoint.sha256)
  )
  if (
    !source ||
    source.size.toString() !== bundle.entrypoint.bytes ||
    source.customMetadata?.contentSha256 !== bundle.entrypoint.sha256
  )
    throw invalid("Published file is unavailable")
  await loadPlugin(env, tenantId, bundle)
  return {
    sourceManifestSha256: version.sourceManifestSha256,
    driverId: FILE_DRIVER.id,
    driverVersion: FILE_DRIVER.version,
    valid: true,
    diagnostics: [],
  }
}

export async function prepareFileVersion(
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  tenantId: string,
  slug: string,
  version: PublicationVersionRecord
) {
  const bundle = await loadFileBundle(env, version)
  const plugin = await loadPlugin(env, tenantId, bundle)
  const url = publishedFileUrl(
    slug,
    version.versionId,
    bundle.entrypoint.sha256,
    bundle.entrypoint.path
  )
  const name = bundle.entrypoint.path.split("/").at(-1)!
  let document =
    '<!doctype html><html><head><meta charset="utf-8"><title>Download file</title></head><body><a href="' +
    escapeHtml(url) +
    '">Download ' +
    escapeHtml(name) +
    "</a></body></html>"
  if (plugin) {
    const extension = name.includes(".")
      ? name.slice(name.lastIndexOf(".")).toLowerCase()
      : ""
    const binding = {
      kind: "file" as const,
      path: bundle.entrypoint.path,
      name,
      baseName: extension ? name.slice(0, -extension.length) : name,
      extension,
      mimeType: bundle.entrypoint.mediaType,
      size: Number(bundle.entrypoint.bytes),
    }
    const script =
      "const code=" +
      json(plugin.code) +
      ";const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));import(url).then(m=>(" +
      bootstrap.toString() +
      ")(m.default," +
      json(binding) +
      ")).catch(e=>{document.getElementById('app').textContent=e.message}).finally(()=>URL.revokeObjectURL(url));"
    const csp = sandboxCsp(plugin.manifest.browser)
      .replace("script-src 'unsafe-inline'", "script-src 'unsafe-inline' blob:")
      .replace("; sandbox allow-scripts", "")
    const frame =
      '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
      escapeHtml(csp) +
      '"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#app{height:100%;width:100%;margin:0;color-scheme:light}body{font-family:system-ui}</style></head><body><div id="app"></div><script>' +
      script.replace(/<\/script/gi, "<\\/script") +
      "</script></body></html>"
    document =
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      escapeHtml(name) +
      '</title><style>html,body{height:100%;margin:0}iframe{display:block;width:100%;height:100%;border:0}#error{font:14px system-ui;padding:16px}</style></head><body><p id="error" role="alert" hidden></p><iframe title="' +
      escapeHtml(plugin.view.title) +
      '" sandbox="allow-scripts"></iframe><script>(' +
      fileViewHost.toString() +
      ")(" +
      json({ frame, url, ...binding, sha256: bundle.entrypoint.sha256 }) +
      ");</script></body></html>"
  }
  const prepared = await prepareStaticTarget(
    env,
    tenant,
    tenantId,
    version,
    new TextEncoder().encode(document)
  )
  return {
    ...prepared,
    readyReceipt: {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: FILE_DRIVER.id,
      driverVersion: FILE_DRIVER.version,
      servingTargetSha256: prepared.targetSha256,
      readyAt: new Date().toISOString(),
      conformance: FILE_DRIVER.conformance,
    },
  }
}

export function publishedFileUrl(
  slug: string,
  versionId: string,
  digest: string,
  path: string
) {
  return (
    "/_eidos/files/" +
    slug +
    "/" +
    versionId +
    "/" +
    digest +
    "/" +
    path.split("/").map(encodeURIComponent).join("/")
  )
}

// Trusted parent: only the bound immutable file is exposed to the opaque iframe.
export function fileViewHost(input: {
  frame: string
  url: string
  path: string
  name: string
  size: number
  mimeType: string
  sha256: string
}) {
  const frame = document.querySelector("iframe")!
  let pending: Promise<Uint8Array> | undefined
  let dataUrl: string | undefined
  let inflight = 0
  const watches = new Set<string>()
  const read = () =>
    (pending ??= (async () => {
      const response = await fetch(input.url, { credentials: "same-origin" })
      if (!response.ok || !response.body)
        throw new Error("Published file is unavailable; reload this page.")
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = []
      let size = 0
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length
        if (size > input.size || size > 16 * 1024 * 1024) {
          await reader.cancel()
          throw new Error("File size mismatch")
        }
        chunks.push(value)
      }
      if (size !== input.size) throw new Error("File size mismatch")
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes)
      )
      if (
        Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("") !==
        input.sha256
      )
        throw new Error("File integrity check failed")
      return bytes
    })())
  const binary = (bytes: Uint8Array) => {
    let text = ""
    for (let i = 0; i < bytes.length; i += 8192)
      text += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return btoa(text)
  }
  window.addEventListener("message", async (event) => {
    const r = event.data
    if (
      event.source !== frame.contentWindow ||
      !r ||
      r.protocol !== "eidos-plugin" ||
      r.apiVersion !== 1 ||
      typeof r.id !== "string" ||
      r.id.length > 128 ||
      typeof r.method !== "string"
    )
      return
    const reply = (payload: object) =>
      frame.contentWindow?.postMessage(
        { protocol: "eidos-plugin", apiVersion: 1, id: r.id, ...payload },
        "*"
      )
    if (inflight >= 16) {
      reply({
        error: { code: "INVALID_REQUEST", message: "Too many requests" },
      })
      return
    }
    inflight++
    try {
      const p = r.params ?? {}
      let result: unknown = null
      if (r.method === "view.ready" || r.method === "ui.notify") {
        /* No persistent host state. */
      } else if (r.method === "fs.unwatch") watches.delete(p.id)
      else {
        if (
          p.path !== input.path &&
          p.path !== input.name &&
          p.path !== "./" + input.name &&
          !(r.method === "fs.url" && p.path === undefined)
        )
          throw new Error("Only the published file is available")
        switch (r.method) {
          case "fs.readText":
            result = {
              text: new TextDecoder("utf-8", { fatal: true }).decode(
                await read()
              ),
            }
            break
          case "fs.readBinary":
            result = { data: binary(await read()) }
            break
          case "fs.stat":
            result = {
              path: input.path,
              name: input.name,
              extension: input.name.includes(".")
                ? input.name.slice(input.name.lastIndexOf(".")).toLowerCase()
                : "",
              size: input.size,
              isDirectory: false,
            }
            break
          case "fs.url":
            dataUrl ??=
              "data:" + input.mimeType + ";base64," + binary(await read())
            result = { url: dataUrl }
            break
          case "fs.watch":
            if (typeof p.id !== "string" || watches.size >= 64)
              throw new Error("Invalid watch")
            watches.add(p.id)
            break
          default:
            throw new Error(
              "This capability is unavailable in a published View"
            )
        }
      }
      reply({ result })
    } catch (cause) {
      reply({
        error: {
          code: "PERMISSION_DENIED",
          message:
            cause instanceof Error
              ? cause.message
              : "Published View request failed",
        },
      })
    } finally {
      inflight--
    }
  })
  frame.srcdoc = input.frame
}

function json(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
}
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
function invalid(message: string): StaticPreparationError {
  return new StaticPreparationError("invalid_file_view", message)
}
