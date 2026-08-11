import { randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"

import { EIDOS_SPACE_DOCUMENT_SCHEME } from "../../shared/contracts"
import { normalizeRelativePath, resolveSpacePath } from "./space-paths"

interface DocumentPreviewTicket {
  root: string
  relativePath: string
  directoryPath: string
  identity: string
}

interface DocumentPreviewRequest {
  ticket: DocumentPreviewTicket
  relativePath: string
  entryDocument: boolean
}

const DOCUMENT_PREVIEW_TICKETS_MAX = 64
const documentPreviewTickets = new Map<string, DocumentPreviewTicket>()
const documentPreviewTokensByIdentity = new Map<string, string>()

const PREVIEW_ASSET_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".css",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".mjs",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".png",
  ".svg",
  ".ttf",
  ".wasm",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
])

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

const HTML_PREVIEW_CONTENT_SECURITY_POLICY = [
  "default-src 'self' data: blob: https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ")

export function isHtmlFile(relativePath: string): boolean {
  const extension = path.extname(relativePath).toLowerCase()
  return extension === ".html" || extension === ".htm"
}

export function isMarkdownFile(relativePath: string): boolean {
  const extension = path.extname(relativePath).toLowerCase()
  return extension === ".md" || extension === ".markdown"
}

function encodePreviewPath(relativePath: string): string {
  return relativePath.split("/").map(encodeURIComponent).join("/")
}

function ticketIdentity(root: string, relativePath: string): string {
  return `${root}\0${relativePath}`
}

function trimPreviewTickets(): void {
  while (documentPreviewTickets.size > DOCUMENT_PREVIEW_TICKETS_MAX) {
    const oldest = documentPreviewTickets.entries().next().value as
      | [string, DocumentPreviewTicket]
      | undefined
    if (!oldest) break
    documentPreviewTickets.delete(oldest[0])
    if (documentPreviewTokensByIdentity.get(oldest[1].identity) === oldest[0]) {
      documentPreviewTokensByIdentity.delete(oldest[1].identity)
    }
  }
}

export function issueHtmlPreviewUrl(
  root: string,
  relativePath: string
): string {
  const normalizedPath = normalizeRelativePath(relativePath)
  const identity = ticketIdentity(root, normalizedPath)
  let token = documentPreviewTokensByIdentity.get(identity)
  if (!token || !documentPreviewTickets.has(token)) {
    token = randomUUID()
    const directoryPath = path.posix.dirname(normalizedPath)
    documentPreviewTickets.set(token, {
      root,
      relativePath: normalizedPath,
      directoryPath: directoryPath === "." ? "" : directoryPath,
      identity,
    })
    documentPreviewTokensByIdentity.set(identity, token)
    trimPreviewTickets()
  }
  return `${EIDOS_SPACE_DOCUMENT_SCHEME}://${token}/${encodePreviewPath(normalizedPath)}`
}

function parsePreviewUrl(url: string): { token: string; path: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${EIDOS_SPACE_DOCUMENT_SCHEME}:`) return null
  const token = parsed.hostname
  if (!token || parsed.username || parsed.password || parsed.port) return null
  let requestedPath: string
  try {
    requestedPath = parsed.pathname
      .replace(/^\//u, "")
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/")
  } catch {
    return null
  }
  if (!requestedPath) return null
  try {
    return { token, path: normalizeRelativePath(requestedPath) }
  } catch {
    return null
  }
}

function resolveDocumentPreviewRequest(
  url: string
): DocumentPreviewRequest | null {
  const parsed = parsePreviewUrl(url)
  if (!parsed) return null
  const ticket = documentPreviewTickets.get(parsed.token)
  if (!ticket) return null
  const entryDocument = parsed.path === ticket.relativePath
  if (!entryDocument) {
    const extension = path.extname(parsed.path).toLowerCase()
    if (!PREVIEW_ASSET_EXTENSIONS.has(extension)) return null
    const relativeToDirectory = path.posix.relative(
      ticket.directoryPath,
      parsed.path
    )
    if (
      relativeToDirectory === ".." ||
      relativeToDirectory.startsWith("../") ||
      path.posix.isAbsolute(relativeToDirectory)
    ) {
      return null
    }
  }
  return { ticket, relativePath: parsed.path, entryDocument }
}

export function htmlPreviewPartition(url: string): string | null {
  const parsed = parsePreviewUrl(url)
  return parsed && documentPreviewTickets.has(parsed.token)
    ? `eidos-html-preview-${parsed.token}`
    : null
}

export function isHtmlPreviewUrlForRoot(url: string, root: string): boolean {
  const request = resolveDocumentPreviewRequest(url)
  return Boolean(
    request?.entryDocument &&
    isHtmlFile(request.relativePath) &&
    path.resolve(request.ticket.root) === path.resolve(root)
  )
}

async function resolveServicableDocument(
  request: DocumentPreviewRequest
): Promise<string | null> {
  if (request.entryDocument && !isHtmlFile(request.relativePath)) return null
  const canonicalRoot = await fs.realpath(request.ticket.root).catch(() => null)
  if (!canonicalRoot) return null
  const candidate = resolveSpacePath(canonicalRoot, request.relativePath)
  const stats = await fs.lstat(candidate).catch(() => null)
  if (!stats?.isFile() || stats.isSymbolicLink()) return null
  const resolved = await fs.realpath(candidate).catch(() => null)
  return resolved === path.resolve(candidate) ? candidate : null
}

function responseHeaders(
  contentLength: number,
  relativePath: string,
  entryDocument: boolean
): Record<string, string> {
  const extension = path.extname(relativePath).toLowerCase()
  return {
    "Cache-Control": "no-store",
    "Content-Length": String(contentLength),
    ...(entryDocument
      ? { "Content-Security-Policy": HTML_PREVIEW_CONTENT_SECURITY_POLICY }
      : {}),
    "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  }
}

export async function serveDocumentPreview(url: string): Promise<Response> {
  const request = resolveDocumentPreviewRequest(url)
  if (!request) return new Response("Unknown document preview", { status: 404 })
  const candidate = await resolveServicableDocument(request)
  if (!candidate) {
    return new Response("Document is unavailable", { status: 404 })
  }
  const stats = await fs.stat(candidate)
  const body = Readable.toWeb(
    createReadStream(candidate)
  ) as ReadableStream<Uint8Array>
  return new Response(body, {
    status: 200,
    headers: responseHeaders(
      stats.size,
      request.relativePath,
      request.entryDocument
    ),
  })
}
