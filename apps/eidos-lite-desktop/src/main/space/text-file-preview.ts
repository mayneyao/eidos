import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"

import {
  EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX,
  type TextFileEncoding,
  type TextFilePreviewResult,
} from "../../shared/contracts"
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
): { content: string; encoding: TextFileEncoding } | null {
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
    return hasBinaryControls(content) ? null : { content, encoding }
  } catch {
    return null
  }
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
      size: stats.size,
      modifiedAtMs: stats.mtimeMs,
      truncated,
    }
  } finally {
    await handle.close()
  }
}
