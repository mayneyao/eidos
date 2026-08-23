import { sha256 } from "@noble/hashes/sha2.js"
import { fromMarkdown } from "mdast-util-from-markdown"
import { micromark } from "micromark"
import { gfm, gfmHtml } from "micromark-extension-gfm"

import {
  MARKDOWN_DRIVER,
  validateRelativeUri,
  validateSourceBundle,
} from "./bundle"
import type {
  PublicationVersionRecord,
  ReadyReceipt,
  SourceBundleManifest,
  StaticArtifactRecord,
  StaticServingTarget,
  ValidationReceipt,
} from "./contracts"
import type { PublishTenant } from "./tenant"
import { prepareStaticTarget, probeStaticTarget } from "./static"

const decoder = new TextDecoder("utf-8", { fatal: true })
const encoder = new TextEncoder()
const MAX_MARKDOWN_BYTES = Number(MARKDOWN_DRIVER.limits.maxEntrypointBytes)

export class MarkdownPreparationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "MarkdownPreparationError"
    this.code = code
  }
}

export async function validateMarkdownVersion(
  env: Env,
  version: PublicationVersionRecord
): Promise<ValidationReceipt> {
  await loadMarkdownSource(env, version)
  return {
    sourceManifestSha256: version.sourceManifestSha256,
    driverId: MARKDOWN_DRIVER.id,
    driverVersion: MARKDOWN_DRIVER.version,
    valid: true,
    diagnostics: [],
  }
}

export async function prepareMarkdownVersion(
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  tenantId: string,
  slug: string,
  version: PublicationVersionRecord
): Promise<{
  target: StaticServingTarget
  targetSha256: string
  readyReceipt: ReadyReceipt
  artifact: StaticArtifactRecord
}> {
  const { bundle, markdown } = await loadMarkdownSource(env, version)
  const localAssets = new Map(
    bundle.manifest.assetReferences
      .filter((reference) => reference.kind === "markdown-link")
      .map((reference) => [reference.uri, reference.fileSha256] as const)
  )
  const rendered = micromark(markdown, {
    allowDangerousHtml: false,
    allowDangerousProtocol: false,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  })
  const document = await rewriteMarkdownAssets(
    markdownDocument(rendered),
    localAssets,
    slug,
    version.versionId
  )
  const { target, targetSha256, artifact } = await prepareStaticTarget(
    env,
    tenant,
    tenantId,
    version,
    encoder.encode(document)
  )
  return {
    target,
    targetSha256,
    readyReceipt: {
      sourceManifestSha256: version.sourceManifestSha256,
      driverId: MARKDOWN_DRIVER.id,
      driverVersion: MARKDOWN_DRIVER.version,
      servingTargetSha256: targetSha256,
      readyAt: new Date().toISOString(),
      conformance: MARKDOWN_DRIVER.conformance,
    },
    artifact: { ...artifact, state: "ready" },
  }
}

export async function probeMarkdownTarget(
  env: Env,
  target: StaticServingTarget,
  artifact: StaticArtifactRecord
): Promise<void> {
  try {
    await probeStaticTarget(env, target, artifact)
  } catch {
    throw new MarkdownPreparationError(
      "static_target_unavailable",
      "Markdown static target did not pass its readiness probe"
    )
  }
}

export function markdownLocalAssetUris(markdown: string): string[] {
  const root = fromMarkdown(markdown)
  const definitions = new Map<string, string>()
  visit(root, (node) => {
    if (
      node.type === "definition" &&
      typeof node.identifier === "string" &&
      typeof node.url === "string"
    ) {
      definitions.set(node.identifier.toLowerCase(), node.url)
    }
  })
  const uris = new Set<string>()
  visit(root, (node) => {
    let uri: string | undefined
    if (
      (node.type === "link" || node.type === "image") &&
      typeof node.url === "string"
    ) {
      uri = node.url
    } else if (
      (node.type === "linkReference" || node.type === "imageReference") &&
      typeof node.identifier === "string"
    ) {
      uri = definitions.get(node.identifier.toLowerCase())
    }
    if (uri === undefined) return
    const normalized = markdownLocalUri(uri)
    if (normalized !== null) uris.add(normalized)
  })
  return [...uris].sort(compareUtf8)
}

function markdownLocalUri(uri: string): string | null {
  if (uri.startsWith("#")) return null
  if (/^(?:https|mailto|data):/i.test(uri)) return null
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(uri)) {
    throw new MarkdownPreparationError(
      "unsupported_markdown_url",
      `Markdown URL uses an unsupported scheme: ${uri}`
    )
  }
  if (
    uri.startsWith("/") ||
    uri.startsWith("//") ||
    uri.includes("?") ||
    uri.includes("#")
  ) {
    throw new MarkdownPreparationError(
      "invalid_markdown_asset_uri",
      `Markdown local URL must be a relative path without query or fragment: ${uri}`
    )
  }
  validateRelativeUri(uri)
  return uri
}

async function loadMarkdownSource(
  env: Env,
  version: PublicationVersionRecord
): Promise<{
  bundle: Awaited<ReturnType<typeof validateSourceBundle>>
  markdown: string
}> {
  if (
    version.driverId !== MARKDOWN_DRIVER.id ||
    version.driverVersion !== MARKDOWN_DRIVER.version
  ) {
    throw new MarkdownPreparationError(
      "unsupported_driver",
      "Version is not bound to the Markdown Driver"
    )
  }
  const manifestObject = await env.PUBLISH_OBJECTS.get(
    version.sourceManifestKey
  )
  if (manifestObject === null || manifestObject.size > 1024 * 1024) {
    throw new MarkdownPreparationError(
      "source_manifest_unavailable",
      "Markdown Source Bundle manifest is unavailable"
    )
  }
  const manifestValue = await manifestObject.json<SourceBundleManifest>()
  const bundle = await validateSourceBundle(manifestValue, {
    maxObjectBytes: MARKDOWN_DRIVER.limits.maxObjectBytes,
  })
  if (
    bundle.manifestSha256 !== version.sourceManifestSha256 ||
    bundle.driver.id !== MARKDOWN_DRIVER.id ||
    bundle.entrypoint.sha256 !== version.entrypoint.sha256
  ) {
    throw new MarkdownPreparationError(
      "source_manifest_mismatch",
      "Markdown Source Bundle no longer matches the Version"
    )
  }
  const source = await env.PUBLISH_OBJECTS.get(version.entrypointObjectKey)
  if (
    source === null ||
    source.size > MAX_MARKDOWN_BYTES ||
    source.size.toString() !== bundle.entrypoint.bytes ||
    source.customMetadata?.contentSha256 !== bundle.entrypoint.sha256
  ) {
    throw new MarkdownPreparationError(
      "invalid_markdown_source",
      "Markdown entrypoint is unavailable or exceeds 16 MiB"
    )
  }
  const bytes = new Uint8Array(await source.arrayBuffer())
  if (hex(sha256(bytes)) !== bundle.entrypoint.sha256) {
    throw new MarkdownPreparationError(
      "source_digest_mismatch",
      "Markdown entrypoint digest does not match the manifest"
    )
  }
  let markdown: string
  try {
    markdown = decoder.decode(bytes)
  } catch {
    throw new MarkdownPreparationError(
      "invalid_markdown_utf8",
      "Markdown entrypoint must be valid UTF-8"
    )
  }
  const manifestUris = bundle.manifest.assetReferences
    .filter((reference) => reference.kind === "markdown-link")
    .map((reference) => reference.uri)
  const sourceUris = markdownLocalAssetUris(markdown)
  if (
    manifestUris.length !== sourceUris.length ||
    manifestUris.some((uri, index) => uri !== sourceUris[index])
  ) {
    throw new MarkdownPreparationError(
      "markdown_asset_manifest_mismatch",
      "Markdown local links do not match the Source Bundle attachments"
    )
  }
  return { bundle, markdown }
}

async function rewriteMarkdownAssets(
  html: string,
  assets: ReadonlyMap<string, string>,
  slug: string,
  versionId: string
): Promise<string> {
  const handler = (attribute: "href" | "src") => ({
    element(element: Element): void {
      const value = element.getAttribute(attribute)
      if (value === null) return
      const uri = markdownLocalUri(value)
      if (uri === null) return
      const digest = assets.get(uri)
      if (digest === undefined) {
        throw new MarkdownPreparationError(
          "markdown_asset_manifest_mismatch",
          "Rendered Markdown contains an undeclared local attachment"
        )
      }
      element.setAttribute(
        attribute,
        `/_eidos/files/${slug}/${versionId}/${digest}/${uri}`
      )
    },
  })
  return await new HTMLRewriter()
    .on("a[href]", handler("href"))
    .on("img[src]", handler("src"))
    .transform(new Response(html))
    .text()
}

function markdownDocument(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Published Markdown</title>
  <style>
    :root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}
    body{margin:0;color:#24292f;background:#fff}main{max-width:760px;margin:0 auto;padding:48px 24px 96px}
    h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.5em 0 .6em}h1{font-size:2.25rem}h2{font-size:1.7rem;border-bottom:1px solid #d0d7de;padding-bottom:.3em}
    a{color:#0969da}img{max-width:100%;height:auto;border-radius:6px}pre{overflow:auto;padding:16px;border-radius:6px;background:#f6f8fa}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}blockquote{margin-left:0;padding-left:1em;border-left:4px solid #d0d7de;color:#57606a}table{display:block;overflow:auto;border-collapse:collapse}th,td{padding:6px 13px;border:1px solid #d0d7de}
    @media(prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}a{color:#58a6ff}h2,th,td{border-color:#30363d}pre{background:#161b22}blockquote{color:#8b949e;border-color:#30363d}}
  </style>
</head>
<body><main>${body}</main></body>
</html>`
}

function visit(
  value: unknown,
  callback: (node: Record<string, unknown>) => void
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return
  const node = value as Record<string, unknown>
  callback(node)
  if (Array.isArray(node.children)) {
    for (const child of node.children) visit(child, callback)
  }
}

function compareUtf8(left: string, right: string): number {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!
  }
  return a.length - b.length
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
