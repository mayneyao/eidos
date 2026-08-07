import { randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"

import {
  EIDOS_SPACE_MEDIA_SCHEME,
  type MediaFileKind,
} from "../../shared/contracts"
import { resolveSpacePath } from "./space-paths"

interface MediaFileType {
  mediaKind: MediaFileKind
  mimeType: string
}

const MEDIA_FILE_TYPES: Record<string, MediaFileType> = {
  ".png": { mediaKind: "image", mimeType: "image/png" },
  ".jpg": { mediaKind: "image", mimeType: "image/jpeg" },
  ".jpeg": { mediaKind: "image", mimeType: "image/jpeg" },
  ".gif": { mediaKind: "image", mimeType: "image/gif" },
  ".webp": { mediaKind: "image", mimeType: "image/webp" },
  ".avif": { mediaKind: "image", mimeType: "image/avif" },
  ".bmp": { mediaKind: "image", mimeType: "image/bmp" },
  ".ico": { mediaKind: "image", mimeType: "image/x-icon" },
  ".mp4": { mediaKind: "video", mimeType: "video/mp4" },
  ".m4v": { mediaKind: "video", mimeType: "video/mp4" },
  ".webm": { mediaKind: "video", mimeType: "video/webm" },
  ".mp3": { mediaKind: "audio", mimeType: "audio/mpeg" },
  ".wav": { mediaKind: "audio", mimeType: "audio/wav" },
  ".ogg": { mediaKind: "audio", mimeType: "audio/ogg" },
  ".m4a": { mediaKind: "audio", mimeType: "audio/mp4" },
  ".flac": { mediaKind: "audio", mimeType: "audio/flac" },
  ".opus": { mediaKind: "audio", mimeType: "audio/ogg" },
  ".weba": { mediaKind: "audio", mimeType: "audio/webm" },
}

export function detectMediaFileType(
  relativePath: string
): MediaFileType | undefined {
  return MEDIA_FILE_TYPES[path.extname(relativePath).toLowerCase()]
}

interface MediaPreviewTicket {
  root: string
  relativePath: string
  mimeType: string
}

const MEDIA_PREVIEW_HOST = "preview"
const MEDIA_PREVIEW_TICKETS_MAX = 256
const mediaPreviewTickets = new Map<string, MediaPreviewTicket>()

export function issueMediaPreviewUrl(
  root: string,
  relativePath: string,
  mimeType: string
): string {
  const token = randomUUID()
  mediaPreviewTickets.set(token, { root, relativePath, mimeType })
  while (mediaPreviewTickets.size > MEDIA_PREVIEW_TICKETS_MAX) {
    const oldest = mediaPreviewTickets.keys().next().value
    if (oldest === undefined) break
    mediaPreviewTickets.delete(oldest)
  }
  return `${EIDOS_SPACE_MEDIA_SCHEME}://${MEDIA_PREVIEW_HOST}/${token}`
}

function resolveMediaPreviewUrl(url: string): MediaPreviewTicket | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${EIDOS_SPACE_MEDIA_SCHEME}:`) return null
  if (parsed.host !== MEDIA_PREVIEW_HOST) return null
  const token = decodeURIComponent(parsed.pathname.replace(/^\//u, ""))
  if (!token || token.includes("/")) return null
  return mediaPreviewTickets.get(token) ?? null
}

async function statServicableFile(
  root: string,
  relativePath: string
): Promise<string | null> {
  const canonicalRoot = await fs.realpath(root)
  const candidate = resolveSpacePath(canonicalRoot, relativePath)
  const stats = await fs.lstat(candidate).catch(() => null)
  if (!stats?.isFile() || stats.isSymbolicLink()) return null
  const resolved = await fs.realpath(candidate).catch(() => null)
  if (resolved !== path.resolve(candidate)) return null
  return candidate
}

function streamFile(
  candidate: string,
  range?: { start: number; end: number }
): ReadableStream<Uint8Array> {
  const stream = createReadStream(candidate, range)
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>
}

export async function serveMediaPreview(
  url: string,
  headers: Headers
): Promise<Response> {
  const ticket = resolveMediaPreviewUrl(url)
  if (!ticket) return new Response("Unknown media preview", { status: 404 })
  const candidate = await statServicableFile(ticket.root, ticket.relativePath)
  if (!candidate) {
    return new Response("Media file is unavailable", { status: 404 })
  }

  const stats = await fs.stat(candidate)
  const range = /^bytes=(\d+)-(\d*)$/u.exec(headers.get("range") ?? "")
  if (range) {
    const start = Number(range[1])
    const end = range[2]
      ? Math.min(Number(range[2]), stats.size - 1)
      : stats.size - 1
    if (start >= stats.size || end < start) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stats.size}` },
      })
    }
    return new Response(streamFile(candidate, { start, end }), {
      status: 206,
      headers: {
        "Content-Type": ticket.mimeType,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Accept-Ranges": "bytes",
      },
    })
  }

  return new Response(streamFile(candidate), {
    status: 200,
    headers: {
      "Content-Type": ticket.mimeType,
      "Content-Length": String(stats.size),
      "Accept-Ranges": "bytes",
    },
  })
}
