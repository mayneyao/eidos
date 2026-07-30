import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"

import type { SpaceVersionTextContentState } from "../../shared/contracts"
import { normalizeMutableRelativePath, resolveSpacePath } from "./space-paths"

function isFileMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  )
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

function sameFile(
  left: {
    dev: number
    ino: number
    size: number
    mtimeMs: number
    ctimeMs: number
  },
  right: {
    dev: number
    ino: number
    size: number
    mtimeMs: number
    ctimeMs: number
  }
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  )
}

async function readExact(
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

export async function readWorkingTextContent(
  root: string,
  requestedPath: string,
  maxBytes: number
): Promise<SpaceVersionTextContentState> {
  const relativePath = normalizeMutableRelativePath(requestedPath)
  const canonicalRoot = await fs.realpath(root)
  const candidate = resolveSpacePath(canonicalRoot, relativePath)
  let pathStats
  try {
    pathStats = await fs.lstat(candidate)
  } catch (error) {
    if (isFileMissing(error)) return { state: "absent" }
    throw error
  }
  if (pathStats.isSymbolicLink() || !pathStats.isFile()) {
    return { state: "unsafe_path", size: pathStats.size }
  }

  let resolved: string
  try {
    resolved = await fs.realpath(candidate)
  } catch (error) {
    if (isFileMissing(error)) {
      return { state: "changed_during_read", size: pathStats.size }
    }
    throw error
  }
  if (resolved !== path.resolve(candidate)) {
    return { state: "unsafe_path", size: pathStats.size }
  }

  let handle
  try {
    handle = await fs.open(
      candidate,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
    )
  } catch (error) {
    if (isFileMissing(error)) {
      return { state: "changed_during_read", size: pathStats.size }
    }
    throw error
  }
  try {
    const before = await handle.stat()
    if (!before.isFile() || !sameFile(pathStats, before)) {
      return { state: "changed_during_read", size: before.size }
    }
    if (before.size > maxBytes) {
      return { state: "too_large", size: before.size }
    }

    const bytes = await readExact(handle, before.size)
    const after = await handle.stat()
    let finalPathStats
    try {
      finalPathStats = await fs.lstat(candidate)
    } catch (error) {
      if (isFileMissing(error)) {
        return { state: "changed_during_read", size: after.size }
      }
      throw error
    }
    if (
      bytes.byteLength !== before.size ||
      finalPathStats.isSymbolicLink() ||
      !finalPathStats.isFile() ||
      !sameFile(before, after) ||
      !sameFile(after, finalPathStats)
    ) {
      return { state: "changed_during_read", size: after.size }
    }

    try {
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      if (hasBinaryControls(content)) {
        return { state: "invalid_utf8", size: before.size }
      }
      return { state: "utf8", content, size: before.size }
    } catch {
      return { state: "invalid_utf8", size: before.size }
    }
  } finally {
    await handle.close()
  }
}
