import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import {
  EIDOS_LITE_MARKDOWN_IMAGE_BYTES_MAX,
  type EidosLiteMarkdownImageAsset,
  type EidosLiteMarkdownImageImportRequest,
  type EidosLiteMarkdownImageResolution,
} from "../../shared/contracts"
import {
  detectRasterMediaType,
  portableEidosFileAssetName,
} from "./eidos-file-attachments"
import { issueMediaPreviewUrl } from "./media-file-preview"
import { normalizeMutableRelativePath, resolveSpacePath } from "./space-paths"

const MARKDOWN_EXTENSION = /^\.(?:md|markdown)$/iu
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/iu
const GENERIC_PASTED_IMAGE_STEM =
  /^(?:clipboard[-_ ]?image|image|pasted[-_ ]?image)(?:\s*\(\d+\)|[-_ ]+\d+)?$/iu
const IMAGE_EXTENSION: Readonly<Record<string, string>> = {
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/x-icon": ".ico",
}

function pastedImageTimestamp(timestamp: number): string {
  const iso = new Date(timestamp).toISOString()
  return `${iso.slice(0, 10).replaceAll("-", "")}-${iso
    .slice(11, 19)
    .replaceAll(":", "")}-${iso.slice(20, 23)}`
}

function importedImageName(
  sourceName: string,
  mediaType: string,
  timestamp = Date.now()
): string {
  const portable = portableEidosFileAssetName(sourceName)
  const sourceExtension = path.extname(portable)
  const sourceStem = portable.slice(0, portable.length - sourceExtension.length)
  const extension = IMAGE_EXTENSION[mediaType]
  if (!extension) throw new Error("The clipboard file is not a supported image")
  const stem =
    !sourceName.trim() || GENERIC_PASTED_IMAGE_STEM.test(sourceStem)
      ? `pasted-image-${pastedImageTimestamp(timestamp)}`
      : sourceStem
  return portableEidosFileAssetName(`${stem}${extension}`)
}

async function requireMarkdownDocument(
  spaceRoot: string,
  relativePath: string
): Promise<{ documentPath: string; documentRoot: string }> {
  const documentPath = resolveSpacePath(
    spaceRoot,
    normalizeMutableRelativePath(relativePath)
  )
  if (!MARKDOWN_EXTENSION.test(path.extname(documentPath))) {
    throw new Error("Markdown images can only belong to .md or .markdown files")
  }
  const documentStats = await fs.lstat(documentPath)
  if (documentStats.isSymbolicLink() || !documentStats.isFile()) {
    throw new Error("The Markdown document must be an ordinary file")
  }
  const documentRoot = path.dirname(documentPath)
  if ((await fs.realpath(documentRoot)) !== path.resolve(documentRoot)) {
    throw new Error("The Markdown document folder cannot contain symlinks")
  }
  return { documentPath, documentRoot }
}

async function requireAssetDirectory(documentRoot: string): Promise<string> {
  const assetRoot = path.join(documentRoot, "assets")
  await fs.mkdir(assetRoot, { recursive: true, mode: 0o700 })
  const stats = await fs.lstat(assetRoot)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error("The Markdown assets path must be an ordinary folder")
  }
  if ((await fs.realpath(assetRoot)) !== path.resolve(assetRoot)) {
    throw new Error("The Markdown assets folder cannot contain symlinks")
  }
  return assetRoot
}

function collisionName(requested: string, ordinal: number): string {
  if (ordinal === 1) return requested
  const extension = path.extname(requested)
  const stem = requested.slice(0, requested.length - extension.length)
  return portableEidosFileAssetName(`${stem} (${ordinal})${extension}`)
}

async function writeUniqueImage(
  assetRoot: string,
  requestedName: string,
  data: Uint8Array
): Promise<{ name: string; targetPath: string }> {
  const existingKeys = new Set(
    (await fs.readdir(assetRoot)).map((name) =>
      name.normalize("NFC").toLocaleLowerCase("en-US")
    )
  )
  const stagePath = path.join(assetRoot, `.eidos-image-${randomUUID()}.tmp`)
  const stage = await fs.open(stagePath, "wx", 0o600)
  try {
    await stage.writeFile(data)
    await stage.sync()
  } finally {
    await stage.close()
  }
  try {
    for (let ordinal = 1; ordinal <= 10_000; ordinal += 1) {
      const name = collisionName(requestedName, ordinal)
      const key = name.normalize("NFC").toLocaleLowerCase("en-US")
      if (existingKeys.has(key)) continue
      const targetPath = path.join(assetRoot, name)
      try {
        await fs.link(stagePath, targetPath)
        return { name, targetPath }
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "EEXIST"
        ) {
          existingKeys.add(key)
          continue
        }
        throw error
      }
    }
    throw new Error("Could not allocate a unique Markdown image name")
  } finally {
    await fs.unlink(stagePath).catch(() => undefined)
  }
}

export async function importMarkdownDocumentImage(
  spaceRoot: string,
  request: EidosLiteMarkdownImageImportRequest
): Promise<EidosLiteMarkdownImageAsset> {
  if (request.name.length > 1_024) {
    throw new Error("The clipboard image name is too long")
  }
  if (
    request.data.byteLength === 0 ||
    request.data.byteLength > EIDOS_LITE_MARKDOWN_IMAGE_BYTES_MAX
  ) {
    throw new Error("Markdown images must be between 1 byte and 64 MiB")
  }
  const mediaType = detectRasterMediaType(request.data.subarray(0, 32))
  if (!mediaType) throw new Error("The clipboard file is not a supported image")

  const { documentRoot } = await requireMarkdownDocument(
    spaceRoot,
    request.relativePath
  )
  const assetRoot = await requireAssetDirectory(documentRoot)
  const requestedName = importedImageName(request.name, mediaType)
  const imported = await writeUniqueImage(
    assetRoot,
    requestedName,
    request.data
  )
  const relativePath = path
    .relative(spaceRoot, imported.targetPath)
    .split(path.sep)
    .join("/")
  return {
    markdownUrl: `assets/${encodeURIComponent(imported.name)}`,
    relativePath,
    mediaType,
  }
}

function localMarkdownImageSegments(markdownUrl: string): string[] | null {
  const value = markdownUrl.trim()
  if (!value || value.startsWith("#") || /^https?:/iu.test(value)) return null
  if (
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#") ||
    URI_SCHEME.test(value)
  ) {
    throw new Error("The Markdown image URL is not a safe local path")
  }

  const segments: string[] = []
  for (const encoded of value.split("/")) {
    if (!encoded || encoded === ".") continue
    let decoded: string
    try {
      decoded = decodeURIComponent(encoded)
    } catch {
      throw new Error("The Markdown image URL contains invalid encoding")
    }
    if (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0") ||
      decoded.toLocaleLowerCase("en-US") === ".graft"
    ) {
      throw new Error("The Markdown image URL escapes its document folder")
    }
    segments.push(decoded)
  }
  return segments.length > 0 ? segments : null
}

export async function resolveMarkdownDocumentImage(
  spaceRoot: string,
  relativePath: string,
  markdownUrl: string
): Promise<EidosLiteMarkdownImageResolution | null> {
  const segments = localMarkdownImageSegments(markdownUrl)
  if (!segments) return null
  const { documentRoot } = await requireMarkdownDocument(
    spaceRoot,
    relativePath
  )
  const candidate = path.resolve(documentRoot, ...segments)
  const relativeToDocument = path.relative(documentRoot, candidate)
  if (
    !relativeToDocument ||
    relativeToDocument === ".." ||
    relativeToDocument.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToDocument)
  ) {
    throw new Error("The Markdown image URL escapes its document folder")
  }
  const stats = await fs.lstat(candidate).catch(() => null)
  if (
    !stats?.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > EIDOS_LITE_MARKDOWN_IMAGE_BYTES_MAX
  ) {
    return null
  }
  if ((await fs.realpath(candidate).catch(() => null)) !== candidate)
    return null
  const handle = await fs.open(candidate, "r")
  let header: Uint8Array
  try {
    const bytes = Buffer.alloc(32)
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    header = bytes.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
  const mediaType = detectRasterMediaType(header)
  if (!mediaType) return null
  const resolvedRelativePath = path
    .relative(spaceRoot, candidate)
    .split(path.sep)
    .join("/")
  return {
    relativePath: resolvedRelativePath,
    mediaType,
    previewUrl: issueMediaPreviewUrl(
      spaceRoot,
      resolvedRelativePath,
      mediaType
    ),
  }
}
