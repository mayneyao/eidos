import fs from "node:fs/promises"
import path from "node:path"
import type { Stats } from "node:fs"
import {
  explorerMediaKind,
  type ExplorerThumbnailRequest,
} from "../../shared/explorer-media"
import { normalizeMutableRelativePath, resolveSpacePath } from "./space-paths"
import type { FileThumbnailProvider } from "./file-thumbnails"
import type { EidosLiteThumbnailSize } from "../../shared/contracts"

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 24) return null
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    !buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  )
    return null
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  return width && height ? { width, height } : null
}

export async function readExplorerFileThumbnail(
  root: string,
  request: ExplorerThumbnailRequest,
  provider: FileThumbnailProvider | undefined
): Promise<string | null> {
  const relativePath = normalizeMutableRelativePath(request.relativePath)
  if (!provider || !explorerMediaKind(relativePath)) return null
  const canonicalRoot = await fs.realpath(root)
  if (canonicalRoot !== path.resolve(root)) throw Error("Space folder changed")
  const candidate = resolveSpacePath(canonicalRoot, relativePath)
  const inspect = async () => {
    const stats = await fs.lstat(candidate)
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      (await fs.realpath(candidate)) !== path.resolve(candidate)
    )
      throw Error("Thumbnail requires an ordinary Space file")
    return stats
  }
  const sameVersion = (stats: Stats) =>
    stats.size === request.size && stats.mtimeMs === request.modifiedAtMs
  const initial = await inspect()
  if (!sameVersion(initial)) return null
  try {
    const pixels = Math.max(32, Math.min(512, request.pixelSize ?? 112))
    const sizes: EidosLiteThumbnailSize[] =
      pixels <= 64 ? [128, 512, 1024] : [512, 1024]
    let bytes: Uint8Array | null = null
    for (const size of sizes) {
      try {
        const next = await provider(
          candidate,
          {
            device: initial.dev,
            inode: initial.ino,
            size: initial.size,
            modifiedAtMs: initial.mtimeMs,
          },
          size
        )
        if (!next.byteLength || next.byteLength > 4 * 1024 * 1024 + 65536) break
        bytes = next
        const dimensions = pngSize(next)
        // object-fit: cover uses the short edge; a large long edge alone can still look blurry.
        if (
          !dimensions ||
          Math.min(dimensions.width, dimensions.height) >= pixels ||
          Math.max(dimensions.width, dimensions.height) < size
        )
          break
      } catch {
        if (!bytes) return null
        break
      }
    }
    if (!bytes) return null
    const current = await inspect()
    if (
      !sameVersion(current) ||
      current.dev !== initial.dev ||
      current.ino !== initial.ino ||
      bytes.byteLength === 0
    )
      return null
    return "data:image/png;base64," + Buffer.from(bytes).toString("base64")
  } catch {
    return null
  }
}
