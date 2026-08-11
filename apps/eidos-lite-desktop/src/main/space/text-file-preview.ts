import { createHash, randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"

import {
  EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX,
  type TextFileEncoding,
  type TextFilePreviewResult,
  type TextFileSaveRequest,
  type TextFileSaveResult,
} from "../../shared/contracts"
import {
  isHtmlFile,
  isMarkdownFile,
  issueHtmlPreviewUrl,
} from "./document-file-preview"
import { detectMediaFileType, issueMediaPreviewUrl } from "./media-file-preview"
import { normalizeMutableRelativePath, resolveSpacePath } from "./space-paths"

function unavailable(
  relativePath: string,
  reason: Extract<TextFilePreviewResult, { type: "unavailable" }>["reason"],
  stats: { size: number; mtimeMs: number }
): TextFilePreviewResult {
  return {
    type: "unavailable",
    relativePath,
    reason,
    size: stats.size,
    modifiedAtMs: stats.mtimeMs,
  }
}

function hasBinaryControls(content: string): boolean {
  if (content.includes("\u0000")) return true
  let controls = 0
  for (const character of content) {
    const codePoint = character.codePointAt(0) ?? 0
    if (
      codePoint < 32 &&
      codePoint !== 9 &&
      codePoint !== 10 &&
      codePoint !== 12 &&
      codePoint !== 13
    ) {
      controls += 1
    }
  }
  return controls > Math.max(2, content.length * 0.01)
}

function decodeText(
  bytes: Uint8Array,
  truncated: boolean
): { content: string; encoding: TextFileEncoding; bom: boolean } | null {
  let encoding: TextFileEncoding = "utf-8"
  let offset = 0
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le"
    offset = 2
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be"
    offset = 2
  } else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    offset = 3
  }

  try {
    const decoder = new TextDecoder(encoding, { fatal: true })
    const content = decoder.decode(bytes.subarray(offset), {
      stream: truncated,
    })
    return hasBinaryControls(content)
      ? null
      : { content, encoding, bom: offset > 0 }
  } catch {
    return null
  }
}

function bytesRevision(bytes: Uint8Array, suffix = ""): string {
  return createHash("sha256").update(bytes).update(suffix).digest("hex")
}

function encodeText(
  content: string,
  encoding: TextFileEncoding,
  bom: boolean
): Buffer {
  if (encoding === "utf-8") {
    const body = Buffer.from(content, "utf8")
    return bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body
  }

  const body = Buffer.from(content, "utf16le")
  if (encoding === "utf-16be") {
    for (let index = 0; index + 1 < body.length; index += 2) {
      const first = body[index]
      body[index] = body[index + 1]
      body[index + 1] = first
    }
    return bom ? Buffer.concat([Buffer.from([0xfe, 0xff]), body]) : body
  }
  return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body
}

async function readPrefix(
  handle: Awaited<ReturnType<typeof fs.open>>,
  length: number
): Promise<Uint8Array> {
  const buffer = Buffer.allocUnsafe(length)
  let offset = 0
  while (offset < length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      length - offset,
      offset
    )
    if (bytesRead === 0) break
    offset += bytesRead
  }
  return buffer.subarray(0, offset)
}

export async function readTextFilePreview(
  root: string,
  requestedPath: string
): Promise<TextFilePreviewResult> {
  const relativePath = normalizeMutableRelativePath(requestedPath)
  const canonicalRoot = await fs.realpath(root)
  const candidate = resolveSpacePath(canonicalRoot, relativePath)
  const pathStats = await fs.lstat(candidate)
  if (pathStats.isSymbolicLink()) {
    return unavailable(relativePath, "symlink", pathStats)
  }
  if (!pathStats.isFile()) {
    return unavailable(relativePath, "not-file", pathStats)
  }

  const resolved = await fs.realpath(candidate)
  if (resolved !== path.resolve(candidate)) {
    return unavailable(relativePath, "symlink", pathStats)
  }

  const mediaType = detectMediaFileType(relativePath)
  if (mediaType) {
    return {
      type: "media",
      relativePath,
      mediaKind: mediaType.mediaKind,
      mimeType: mediaType.mimeType,
      previewUrl: issueMediaPreviewUrl(
        canonicalRoot,
        relativePath,
        mediaType.mimeType
      ),
      size: pathStats.size,
      modifiedAtMs: pathStats.mtimeMs,
    }
  }

  const handle = await fs.open(
    candidate,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
  )
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) return unavailable(relativePath, "not-file", pathStats)
    const truncated = stats.size > EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX
    const bytes = await readPrefix(
      handle,
      Math.min(stats.size, EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX)
    )
    const decoded = decodeText(bytes, truncated)
    if (!decoded) return unavailable(relativePath, "binary", pathStats)
    return {
      type: "text",
      relativePath,
      content: decoded.content,
      encoding: decoded.encoding,
      bom: decoded.bom,
      revision: bytesRevision(
        bytes,
        truncated ? `:${stats.size}:${stats.mtimeMs}` : ""
      ),
      ...(!truncated && isHtmlFile(relativePath)
        ? {
            browserPreview: {
              kind: "html" as const,
              url: issueHtmlPreviewUrl(canonicalRoot, relativePath),
            },
          }
        : !truncated && isMarkdownFile(relativePath)
          ? {
              browserPreview: {
                kind: "markdown" as const,
              },
            }
          : {}),
      size: stats.size,
      modifiedAtMs: stats.mtimeMs,
      truncated,
    }
  } finally {
    await handle.close()
  }
}

export async function saveTextFile(
  root: string,
  request: TextFileSaveRequest
): Promise<TextFileSaveResult> {
  const current = await readTextFilePreview(root, request.relativePath)
  if (
    current.type !== "text" ||
    current.revision !== request.expectedRevision
  ) {
    return { status: "conflict", current }
  }
  if (current.truncated) {
    throw new Error("Files larger than 2 MB are read-only")
  }

  const bytes = encodeText(request.content, current.encoding, current.bom)
  if (bytes.byteLength > EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX) {
    throw new Error("Edited text exceeds the 2 MB file limit")
  }

  const canonicalRoot = await fs.realpath(root)
  const candidate = resolveSpacePath(canonicalRoot, current.relativePath)
  const currentStats = await fs.lstat(candidate)
  if (!currentStats.isFile() || currentStats.isSymbolicLink()) {
    return {
      status: "conflict",
      current: await readTextFilePreview(root, current.relativePath),
    }
  }

  const temporaryPath = path.join(
    path.dirname(candidate),
    `.${path.basename(candidate)}.eidos-lite-${randomUUID()}.tmp`
  )
  try {
    const handle = await fs.open(
      temporaryPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
      currentStats.mode
    )
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }

    const latest = await readTextFilePreview(root, current.relativePath)
    if (latest.type !== "text" || latest.revision !== current.revision) {
      return { status: "conflict", current: latest }
    }

    await fs.rename(temporaryPath, candidate)
    const saved = await readTextFilePreview(root, current.relativePath)
    if (saved.type !== "text") {
      throw new Error("Saved text could not be read back")
    }
    return { status: "saved", file: saved }
  } finally {
    await fs.rm(temporaryPath, { force: true })
  }
}
