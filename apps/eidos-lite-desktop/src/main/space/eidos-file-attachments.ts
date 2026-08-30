import { randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { FileEntry } from "@eidos.space/eidos-file"

import { resolveSpacePath } from "./space-paths"

export const EIDOS_LITE_ASSET_BYTES_MAX = 256 * 1024 * 1024
export const EIDOS_LITE_ASSET_PREVIEW_BYTES_MAX = 64 * 1024 * 1024
export const EIDOS_LITE_ASSET_IMPORT_COUNT_MAX = 64

const PORTABLE_INVALID_NAME = /[<>:"/\\|?*\u0000-\u001f]/gu
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu
const SAFE_RASTER_MEDIA_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/x-icon",
])
const GENERIC_PASTED_IMAGE_STEM =
  /^(?:clipboard[-_ ]?image|image|pasted[-_ ]?image)(?:\s*\(\d+\)|[-_ ]+\d+)?$/iu
const PASTED_ASSET_EXTENSION: Readonly<Record<string, string>> = {
  "application/pdf": ".pdf",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/x-icon": ".ico",
}
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/iu
const URI_REFERENCE_ASCII =
  /^(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/?#\[\]]|%[0-9A-Fa-f]{2})*$/u

export interface ImportedEidosFileAssets {
  entries: FileEntry[]
  relativePaths: string[]
}

export type ResolvedEidosFileAsset =
  | {
      kind: "local"
      absolutePath: string
      identity: EidosFileAssetIdentity
      bytes?: Uint8Array
    }
  | {
      kind: "network"
      bytes: Uint8Array
    }

export interface EidosFileAssetIdentity {
  device: number
  inode: number
  size: number
  modifiedAtMs: number
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8")
}

function createAttachmentUuidV7(timestamp = Date.now()): string {
  const bytes = randomBytes(16)
  let remaining = timestamp
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remaining % 256
    remaining = Math.floor(remaining / 256)
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f)
  bytes[8] = 0x80 | (bytes[8]! & 0x3f)
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function normalizeRelativeAssetUri(value: string): string | null {
  const trimmed = value.trim()
  if (
    !trimmed ||
    trimmed.includes("\0") ||
    trimmed.startsWith("/") ||
    URI_SCHEME.test(trimmed)
  ) {
    return null
  }
  const normalized: string[] = []
  for (const part of trimmed.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue
    let decoded: string
    try {
      decoded = decodeURIComponent(part)
    } catch {
      return null
    }
    if (decoded === "..") {
      if (normalized.length === 0) return null
      normalized.pop()
      continue
    }
    if (decoded === ".") continue
    if (decoded.includes("\0") || decoded.includes("\\")) return null
    normalized.push(encodeURIComponent(decoded))
  }
  return normalized.length > 0 ? normalized.join("/") : null
}

function truncateUtf8(value: string, maximum: number): string {
  let result = ""
  for (const character of value) {
    if (byteLength(result + character) > maximum) break
    result += character
  }
  return result
}

export function portableEidosFileAssetName(value: string): string {
  let name = value
    .normalize("NFC")
    .replace(PORTABLE_INVALID_NAME, "_")
    .trim()
    .replace(/[. ]+$/u, "")
  if (!name || name === "." || name === "..") name = "attachment"
  if (WINDOWS_RESERVED_NAME.test(name)) name = `_${name}`
  if (byteLength(name) <= 240) return name

  const extension = path.extname(name)
  const extensionBudget = Math.min(byteLength(extension), 32)
  const retainedExtension = truncateUtf8(extension, extensionBudget)
  const stem = name.slice(0, Math.max(0, name.length - extension.length))
  return `${truncateUtf8(stem, 240 - byteLength(retainedExtension))}${retainedExtension}`
}

function collisionKey(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US")
}

function uniqueAssetName(existingKeys: Set<string>, requested: string): string {
  const name = portableEidosFileAssetName(requested)
  if (!existingKeys.has(collisionKey(name))) {
    existingKeys.add(collisionKey(name))
    return name
  }
  const extension = path.extname(name)
  const stem = name.slice(0, Math.max(0, name.length - extension.length))
  for (let index = 2; index <= 10_000; index += 1) {
    const suffix = ` (${index})`
    const maximumStemBytes = 240 - byteLength(extension) - byteLength(suffix)
    const candidate = `${truncateUtf8(stem, maximumStemBytes)}${suffix}${extension}`
    if (!existingKeys.has(collisionKey(candidate))) {
      existingKeys.add(collisionKey(candidate))
      return candidate
    }
  }
  throw new Error("Could not allocate a unique attachment name")
}

export function detectRasterMediaType(bytes: Uint8Array): string | null {
  const ascii = (start: number, length: number) =>
    Buffer.from(bytes.subarray(start, start + length)).toString("ascii")
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg"
  }
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) {
    return "image/gif"
  }
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    return "image/webp"
  }
  if (bytes.length >= 2 && ascii(0, 2) === "BM") return "image/bmp"
  if (
    bytes.length >= 12 &&
    ascii(4, 4) === "ftyp" &&
    ["avif", "avis"].includes(ascii(8, 4))
  ) {
    return "image/avif"
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    (bytes[2] === 0x01 || bytes[2] === 0x02) &&
    bytes[3] === 0x00
  ) {
    return "image/x-icon"
  }
  return null
}

export function detectAssetMediaType(
  bytes: Uint8Array,
  filename: string
): string {
  const raster = detectRasterMediaType(bytes)
  if (raster) return raster
  const ascii = (length: number) =>
    Buffer.from(bytes.subarray(0, length)).toString("ascii")
  if (bytes.length >= 5 && ascii(5) === "%PDF-") return "application/pdf"
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return "application/zip"
  }
  return (
    {
      ".csv": "text/csv",
      ".json": "application/json",
      ".md": "text/markdown",
      ".mp3": "audio/mpeg",
      ".mp4": "video/mp4",
      ".ogg": "audio/ogg",
      ".txt": "text/plain",
      ".wav": "audio/wav",
      ".webm": "video/webm",
    }[path.extname(filename).toLowerCase()] ?? "application/octet-stream"
  )
}

function pastedAssetTimestamp(timestamp: number): string {
  const iso = new Date(timestamp).toISOString()
  return `${iso.slice(0, 10).replaceAll("-", "")}-${iso
    .slice(11, 19)
    .replaceAll(":", "")}-${iso.slice(20, 23)}`
}

function pastedAssetName(
  source: EidosFileAttachmentDataSource,
  timestamp: number,
  ordinal: number
): string | null {
  const portableName = portableEidosFileAssetName(source.name)
  const originalExtension = path.extname(portableName)
  const originalStem = portableName.slice(
    0,
    Math.max(0, portableName.length - originalExtension.length)
  )
  if (
    source.name.trim().length > 0 &&
    !GENERIC_PASTED_IMAGE_STEM.test(originalStem)
  ) {
    return null
  }

  const mediaType = detectAssetMediaType(source.data, portableName)
  const extension = PASTED_ASSET_EXTENSION[mediaType] ?? originalExtension
  const kind = mediaType.startsWith("image/")
    ? "pasted-image"
    : "pasted-attachment"
  const suffix = ordinal === 1 ? "" : `-${ordinal}`
  return `${kind}-${pastedAssetTimestamp(timestamp)}${suffix}${extension}`
}

async function requireOrdinarySource(sourcePath: string) {
  if (!path.isAbsolute(sourcePath)) {
    throw new Error("Attachment source path must be absolute")
  }
  const stats = await fs.lstat(sourcePath)
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error("Only ordinary files can be attached")
  }
  if (stats.size > EIDOS_LITE_ASSET_BYTES_MAX) {
    throw new Error("Attachments larger than 256 MiB are not supported")
  }
  return stats
}

async function copySourceToStage(
  sourcePath: string,
  stagePath: string
): Promise<{ size: number; header: Uint8Array }> {
  const sourceStats = await requireOrdinarySource(sourcePath)
  const source = await fs.open(sourcePath, "r")
  let destination: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    const openedStats = await source.stat()
    if (
      !openedStats.isFile() ||
      openedStats.dev !== sourceStats.dev ||
      openedStats.ino !== sourceStats.ino
    ) {
      throw new Error("Attachment source changed while it was opened")
    }
    destination = await fs.open(stagePath, "wx", 0o600)
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    const header = new Uint8Array(32)
    let headerLength = 0
    let offset = 0
    for (;;) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, offset)
      if (bytesRead === 0) break
      if (offset + bytesRead > EIDOS_LITE_ASSET_BYTES_MAX) {
        throw new Error("Attachments larger than 256 MiB are not supported")
      }
      if (headerLength < header.length) {
        const copied = Math.min(header.length - headerLength, bytesRead)
        header.set(buffer.subarray(0, copied), headerLength)
        headerLength += copied
      }
      let written = 0
      while (written < bytesRead) {
        const result = await destination.write(
          buffer,
          written,
          bytesRead - written,
          offset + written
        )
        written += result.bytesWritten
      }
      offset += bytesRead
    }
    await destination.sync()
    const completedStats = await source.stat()
    if (
      completedStats.size !== sourceStats.size ||
      completedStats.mtimeMs !== sourceStats.mtimeMs
    ) {
      throw new Error("Attachment source changed while it was being copied")
    }
    return { size: offset, header: header.subarray(0, headerLength) }
  } finally {
    await destination?.close().catch(() => undefined)
    await source.close().catch(() => undefined)
  }
}

async function inspectOrdinarySource(
  sourcePath: string
): Promise<{ size: number; header: Uint8Array }> {
  const sourceStats = await requireOrdinarySource(sourcePath)
  const source = await fs.open(sourcePath, "r")
  try {
    const openedStats = await source.stat()
    if (
      !openedStats.isFile() ||
      openedStats.dev !== sourceStats.dev ||
      openedStats.ino !== sourceStats.ino
    ) {
      throw new Error("Attachment source changed while it was opened")
    }
    const header = Buffer.alloc(32)
    const { bytesRead } = await source.read(header, 0, header.length, 0)
    const completedStats = await source.stat()
    if (
      completedStats.size !== sourceStats.size ||
      completedStats.mtimeMs !== sourceStats.mtimeMs
    ) {
      throw new Error("Attachment source changed while it was being inspected")
    }
    return {
      size: completedStats.size,
      header: new Uint8Array(header.subarray(0, bytesRead)),
    }
  } finally {
    await source.close()
  }
}

async function requireManagedAssetDirectory(
  spaceRoot: string,
  eidosRelativePath: string
): Promise<{ assetRoot: string; sourceRoot: string }> {
  const eidosPath = resolveSpacePath(spaceRoot, eidosRelativePath)
  if (path.extname(eidosPath).toLowerCase() !== ".eidos") {
    throw new Error("Attachment session must belong to an Eidos File")
  }
  const eidosStats = await fs.lstat(eidosPath)
  if (eidosStats.isSymbolicLink() || !eidosStats.isFile()) {
    throw new Error("The Eidos File attachment root cannot be a symlink")
  }
  const sourceRoot = path.dirname(eidosPath)
  if ((await fs.realpath(sourceRoot)) !== path.resolve(sourceRoot)) {
    throw new Error("The Eidos File attachment root cannot be a symlink")
  }
  const assetRoot = path.join(sourceRoot, "assets")
  await fs.mkdir(assetRoot, { recursive: true, mode: 0o700 })
  const assetStats = await fs.lstat(assetRoot)
  if (assetStats.isSymbolicLink() || !assetStats.isDirectory()) {
    throw new Error("The Eidos File assets path must be an ordinary folder")
  }
  if ((await fs.realpath(assetRoot)) !== path.resolve(assetRoot)) {
    throw new Error("The Eidos File assets folder cannot be a symlink")
  }
  return { assetRoot, sourceRoot }
}

export async function eidosFileAssetDirectory(
  spaceRoot: string,
  eidosRelativePath: string
): Promise<string> {
  return (await requireManagedAssetDirectory(spaceRoot, eidosRelativePath))
    .assetRoot
}

async function isManagedAssetSource(
  assetRoot: string,
  sourcePath: string
): Promise<boolean> {
  const absolutePath = path.resolve(sourcePath)
  const relative = path.relative(assetRoot, absolutePath)
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return false
  }
  await assertNoSymlinkPath(assetRoot, absolutePath)
  if ((await fs.realpath(absolutePath)) !== absolutePath) {
    throw new Error("Attachment paths cannot contain symlinks")
  }
  return true
}

function importedAssetRecord(
  spaceRoot: string,
  sourceRoot: string,
  targetPath: string,
  name: string,
  inspected: { size: number; header: Uint8Array }
): { relativePath: string; entry: FileEntry } {
  const relativePath = path
    .relative(spaceRoot, targetPath)
    .split(path.sep)
    .join("/")
  const relativeToEidos = path
    .relative(sourceRoot, targetPath)
    .split(path.sep)
    .join("/")
  const uri = normalizeRelativeAssetUri(relativeToEidos)
  if (!uri) throw new Error("The attachment path is not portable")
  return {
    relativePath,
    entry: {
      id: createAttachmentUuidV7(),
      uri,
      name,
      mediaType: detectAssetMediaType(inspected.header, name),
      size: String(inspected.size),
    },
  }
}

export interface EidosFileAttachmentDataSource {
  name: string
  data: Uint8Array
  source?: "drop" | "paste"
}

async function writeDataToStage(
  data: Uint8Array,
  stagePath: string
): Promise<{ size: number; header: Uint8Array }> {
  if (data.byteLength > EIDOS_LITE_ASSET_BYTES_MAX) {
    throw new Error("Attachments larger than 256 MiB are not supported")
  }
  const destination = await fs.open(stagePath, "wx", 0o600)
  try {
    await destination.writeFile(data)
    await destination.sync()
  } finally {
    await destination.close().catch(() => undefined)
  }
  return {
    size: data.byteLength,
    header: data.subarray(0, Math.min(32, data.byteLength)),
  }
}

export async function importEidosFileAttachmentData(
  spaceRoot: string,
  eidosRelativePath: string,
  sources: readonly EidosFileAttachmentDataSource[]
): Promise<ImportedEidosFileAssets> {
  if (
    sources.length < 1 ||
    sources.length > EIDOS_LITE_ASSET_IMPORT_COUNT_MAX
  ) {
    throw new Error(
      `Choose between 1 and ${EIDOS_LITE_ASSET_IMPORT_COUNT_MAX} attachments`
    )
  }
  const { assetRoot, sourceRoot } = await requireManagedAssetDirectory(
    spaceRoot,
    eidosRelativePath
  )
  const existingKeys = new Set((await fs.readdir(assetRoot)).map(collisionKey))
  const staged: Array<{
    stagePath: string
    targetPath: string
    relativePath: string
    entry: FileEntry
  }> = []
  const published: string[] = []
  const importedAt = Date.now()
  let pastedAssetOrdinal = 0
  try {
    for (const source of sources) {
      const generatedName =
        source.source === "paste"
          ? pastedAssetName(source, importedAt, pastedAssetOrdinal + 1)
          : null
      if (generatedName) pastedAssetOrdinal += 1
      const requestedName = generatedName ?? source.name
      const name = uniqueAssetName(existingKeys, requestedName)
      const stagePath = path.join(assetRoot, `.eidos-asset-${randomUUID()}.tmp`)
      const targetPath = path.join(assetRoot, name)
      let written: Awaited<ReturnType<typeof writeDataToStage>>
      try {
        written = await writeDataToStage(source.data, stagePath)
      } catch (error) {
        await fs.unlink(stagePath).catch(() => undefined)
        throw error
      }
      try {
        const record = importedAssetRecord(
          spaceRoot,
          sourceRoot,
          targetPath,
          name,
          written
        )
        staged.push({ stagePath, targetPath, ...record })
      } catch (error) {
        await fs.unlink(stagePath).catch(() => undefined)
        throw error
      }
    }
    for (const item of staged) {
      await fs.link(item.stagePath, item.targetPath)
      published.push(item.targetPath)
      await fs.unlink(item.stagePath)
    }
    return {
      entries: staged.map((item) => item.entry),
      relativePaths: staged.map((item) => item.relativePath),
    }
  } catch (error) {
    await Promise.allSettled([
      ...staged.map((item) => fs.unlink(item.stagePath)),
      ...published.map((targetPath) => fs.unlink(targetPath)),
    ])
    throw error
  }
}

export async function importEidosFileAttachments(
  spaceRoot: string,
  eidosRelativePath: string,
  sourcePaths: readonly string[]
): Promise<ImportedEidosFileAssets> {
  if (
    sourcePaths.length < 1 ||
    sourcePaths.length > EIDOS_LITE_ASSET_IMPORT_COUNT_MAX
  ) {
    throw new Error(
      `Choose between 1 and ${EIDOS_LITE_ASSET_IMPORT_COUNT_MAX} attachments`
    )
  }
  const { assetRoot, sourceRoot } = await requireManagedAssetDirectory(
    spaceRoot,
    eidosRelativePath
  )
  const existingKeys = new Set((await fs.readdir(assetRoot)).map(collisionKey))
  const staged: Array<{
    stagePath?: string
    targetPath: string
    relativePath: string
    entry: FileEntry
  }> = []
  const published: string[] = []
  try {
    for (const sourcePath of sourcePaths) {
      if (await isManagedAssetSource(assetRoot, sourcePath)) {
        const targetPath = path.resolve(sourcePath)
        const name = path.basename(targetPath)
        const record = importedAssetRecord(
          spaceRoot,
          sourceRoot,
          targetPath,
          name,
          await inspectOrdinarySource(targetPath)
        )
        staged.push({ targetPath, ...record })
        continue
      }
      const name = uniqueAssetName(existingKeys, path.basename(sourcePath))
      const stagePath = path.join(assetRoot, `.eidos-asset-${randomUUID()}.tmp`)
      const targetPath = path.join(assetRoot, name)
      let copied: Awaited<ReturnType<typeof copySourceToStage>>
      try {
        copied = await copySourceToStage(sourcePath, stagePath)
      } catch (error) {
        await fs.unlink(stagePath).catch(() => undefined)
        throw error
      }
      try {
        const record = importedAssetRecord(
          spaceRoot,
          sourceRoot,
          targetPath,
          name,
          copied
        )
        staged.push({ stagePath, targetPath, ...record })
      } catch (error) {
        await fs.unlink(stagePath).catch(() => undefined)
        throw error
      }
    }
    for (const item of staged) {
      if (!item.stagePath) continue
      await fs.link(item.stagePath, item.targetPath)
      published.push(item.targetPath)
      await fs.unlink(item.stagePath)
    }
    return {
      entries: staged.map((item) => item.entry),
      relativePaths: staged.map((item) => item.relativePath),
    }
  } catch (error) {
    await Promise.allSettled([
      ...staged.flatMap((item) =>
        item.stagePath ? [fs.unlink(item.stagePath)] : []
      ),
      ...published.map((targetPath) => fs.unlink(targetPath)),
    ])
    throw error
  }
}

function decodeRelativeAssetUri(uri: string): string {
  if (
    !URI_REFERENCE_ASCII.test(uri) ||
    uri.startsWith("/") ||
    URI_SCHEME.test(uri) ||
    uri.includes("?") ||
    uri.includes("#")
  ) {
    throw new Error("Attachment URI is not a safe relative path")
  }
  try {
    const segments = uri.split("/").map((segment) => {
      if (!segment) throw new Error("Attachment URI contains an empty segment")
      const decoded = decodeURIComponent(segment)
      if (
        decoded === "." ||
        decoded === ".." ||
        decoded.includes("/") ||
        decoded.includes("\\") ||
        decoded.includes("\0")
      ) {
        throw new Error("Attachment URI contains an unsafe path segment")
      }
      return decoded
    })
    return segments.join(path.sep)
  } catch {
    throw new Error("Attachment URI encoding is invalid")
  }
}

async function assertNoSymlinkPath(
  root: string,
  target: string
): Promise<void> {
  const relative = path.relative(root, target)
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Attachment path escapes the Eidos File directory")
  }
  let current = root
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component)
    const stats = await fs.lstat(current)
    if (stats.isSymbolicLink()) {
      throw new Error("Attachment paths cannot contain symlinks")
    }
  }
}

export async function resolveEidosFileAttachment(
  spaceRoot: string,
  eidosRelativePath: string,
  entry: FileEntry,
  purpose: "thumbnail" | "preview" | "download"
): Promise<ResolvedEidosFileAsset> {
  const eidosPath = resolveSpacePath(spaceRoot, eidosRelativePath)
  const eidosStats = await fs.lstat(eidosPath)
  if (eidosStats.isSymbolicLink() || !eidosStats.isFile()) {
    throw new Error("The Eidos File attachment root cannot be a symlink")
  }
  const sourceRoot = path.dirname(eidosPath)
  if ((await fs.realpath(sourceRoot)) !== path.resolve(sourceRoot)) {
    throw new Error("The Eidos File attachment root cannot be a symlink")
  }
  const absolutePath = path.resolve(
    sourceRoot,
    decodeRelativeAssetUri(entry.uri)
  )
  await assertNoSymlinkPath(sourceRoot, absolutePath)
  const stats = await fs.stat(absolutePath)
  if (!stats.isFile()) throw new Error("Attachment is not an ordinary file")
  const declaredSize = Number(entry.size)
  const maximum =
    purpose === "download"
      ? EIDOS_LITE_ASSET_BYTES_MAX
      : EIDOS_LITE_ASSET_PREVIEW_BYTES_MAX
  if (
    !Number.isSafeInteger(declaredSize) ||
    declaredSize < 0 ||
    declaredSize > maximum
  ) {
    throw new Error("Attachment exceeds the requested operation limit")
  }
  if (stats.size !== declaredSize) {
    throw new Error("Attachment size no longer matches its File metadata")
  }
  const identity: EidosFileAssetIdentity = {
    device: stats.dev,
    inode: stats.ino,
    size: stats.size,
    modifiedAtMs: stats.mtimeMs,
  }
  if (purpose !== "thumbnail") return { kind: "local", absolutePath, identity }
  if (!SAFE_RASTER_MEDIA_TYPES.has(entry.mediaType.toLowerCase())) {
    throw new Error("Only safe raster images can be used as thumbnails")
  }
  const handle = await fs.open(absolutePath, "r")
  let bytes: Uint8Array
  try {
    const openedStats = await handle.stat()
    if (
      openedStats.dev !== identity.device ||
      openedStats.ino !== identity.inode ||
      openedStats.size !== identity.size ||
      openedStats.mtimeMs !== identity.modifiedAtMs
    ) {
      throw new Error("Attachment changed while its preview was being opened")
    }
    bytes = new Uint8Array(await handle.readFile())
    const completedStats = await handle.stat()
    if (
      completedStats.size !== identity.size ||
      completedStats.mtimeMs !== identity.modifiedAtMs
    ) {
      throw new Error("Attachment changed while its preview was being read")
    }
  } finally {
    await handle.close()
  }
  if (detectRasterMediaType(bytes) !== entry.mediaType.toLowerCase()) {
    throw new Error("Attachment bytes do not match the declared image type")
  }
  return { kind: "local", absolutePath, identity, bytes }
}
