import {
  constants,
  realpathSync,
  statSync,
  watch as watchFileSystem,
  type FSWatcher,
  type Stats,
} from "node:fs"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

export { uniqueSpaceEntryName } from "./names"

export type SpaceFileEntryKind = "file" | "directory" | "symbolicLink"

export interface SpaceFileEntry {
  name: string
  path: string
  parentPath: string
  kind: SpaceFileEntryKind
  size: number
  mtimeMs: number
}

export interface SpaceTextFile {
  path: string
  content: string
  size: number
  mtimeMs: number
}

export interface SpaceBinaryFile {
  path: string
  content: Uint8Array
  size: number
  mtimeMs: number
}

export type SpaceTextPreviewEncoding = "utf-8" | "utf-16le" | "utf-16be"

export type SpaceFilePreview =
  | {
      kind: "text"
      path: string
      content: string
      encoding: SpaceTextPreviewEncoding
      previewBytes: number
      truncated: boolean
      size: number
      mtimeMs: number
    }
  | {
      kind: "binary"
      path: string
      size: number
      mtimeMs: number
    }

export interface SpaceFileChange {
  eventType: "rename" | "change" | "rescan"
  path: string
}

export interface WatchSpaceFilesOptions {
  debounceMs?: number
}

export interface SpaceFileWatcher {
  close(): void
}

export interface ListSpaceFilesOptions {
  includeHidden?: boolean
  includeObsidian?: boolean
}

export type SpaceFilesErrorCode =
  | "invalid-root"
  | "invalid-path"
  | "path-outside-space"
  | "not-found"
  | "not-a-file"
  | "not-a-directory"
  | "file-exists"
  | "file-changed"
  | "invalid-encoding"
  | "not-writable"
  | "write-failed"
  | "unsupported-file-metadata"

export class SpaceFilesError extends Error {
  constructor(
    readonly code: SpaceFilesErrorCode,
    message: string,
    readonly filePath?: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = "SpaceFilesError"
  }
}

const PRIVATE_ROOTS = new Set([".eidos", ".graft"])
const DEFAULT_WATCH_DEBOUNCE_MS = 60
const STABLE_READ_ATTEMPTS = 3
const STABLE_READ_RETRY_MS = 8
export const SPACE_FILE_PREVIEW_MAX_BYTES = 512 * 1024
const STRICT_UTF8_DECODER = new TextDecoder("utf-8", { fatal: true })
const execFileAsync = promisify(execFile)

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
}

function toPortablePath(value: string): string {
  return value.split(path.sep).join("/")
}

function parentPortablePath(relativePath: string): string {
  const parent = path.posix.dirname(relativePath)
  return parent === "." ? "" : parent
}

function nearestExistingDirectory(
  root: string,
  relativeDirectory: string
): string {
  let current = relativeDirectory
  while (current) {
    const candidate = path.resolve(root, ...current.split("/"))
    if (!isWithinRoot(root, candidate)) return ""
    try {
      if (statSync(candidate).isDirectory()) return current
    } catch {
      // A rename event can describe a directory that was deleted before the
      // watcher debounce settled. Walk upward until refresh has a valid root.
    }
    current = parentPortablePath(current)
  }
  return ""
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  )
}

function sameFileSnapshot(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  )
}

async function syncDirectoryBestEffort(directory: string): Promise<void> {
  if (process.platform === "win32") return
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(directory, constants.O_RDONLY)
    await handle.sync()
  } catch {
    // Some filesystems do not support directory fsync. The replacement file
    // itself has already been flushed before rename.
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

async function copyFileWithMetadata(
  source: string,
  destination: string,
  relativePath: string
): Promise<void> {
  try {
    if (process.platform === "darwin") {
      await execFileAsync("/bin/cp", ["-p", "--", source, destination])
      return
    }
    if (process.platform === "linux") {
      await execFileAsync("cp", [
        "--preserve=all",
        "--reflink=auto",
        "--",
        source,
        destination,
      ])
      return
    }
    await copyFile(source, destination, constants.COPYFILE_EXCL)
  } catch (error) {
    throw new SpaceFilesError(
      "write-failed",
      "Eidos could not preserve file metadata while saving: " + relativePath,
      relativePath,
      error
    )
  }
}

async function replaceTextFileAtomically(
  filename: string,
  content: string,
  original: Stats,
  relativePath: string
): Promise<void> {
  const directory = path.dirname(filename)
  const temporaryPath = path.join(
    directory,
    "." +
      path.basename(filename) +
      ".eidos-" +
      process.pid +
      "-" +
      randomUUID() +
      ".tmp"
  )
  let handle: Awaited<ReturnType<typeof open>> | undefined

  try {
    if (process.platform !== "win32" && (original.mode & 0o222) === 0) {
      throw new SpaceFilesError(
        "not-writable",
        "Space file is read-only: " + relativePath,
        relativePath
      )
    }
    if (original.nlink > 1) {
      throw new SpaceFilesError(
        "unsupported-file-metadata",
        "Eidos cannot safely replace a hard-linked Space file: " + relativePath,
        relativePath
      )
    }

    await copyFileWithMetadata(filename, temporaryPath, relativePath)
    handle = await open(temporaryPath, "r+")
    await handle.writeFile(content, "utf8")
    await handle.truncate(Buffer.byteLength(content, "utf8"))
    await handle.sync()
    await handle.close()
    handle = undefined

    const beforeReplace = await stat(filename)
    if (!sameFileSnapshot(original, beforeReplace)) {
      throw new SpaceFilesError(
        "file-changed",
        "Space file changed outside Eidos: " + relativePath,
        relativePath
      )
    }

    await rename(temporaryPath, filename)
    await syncDirectoryBestEffort(directory)
  } finally {
    await handle?.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function decodeUtf8(content: Buffer, relativePath: string): string {
  try {
    return STRICT_UTF8_DECODER.decode(content)
  } catch (error) {
    throw new SpaceFilesError(
      "invalid-encoding",
      "Eidos can only edit UTF-8 text files: " + relativePath,
      relativePath,
      error
    )
  }
}

function containsBinaryControlCharacters(content: string): boolean {
  let suspiciousCharacters = 0
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index)
    if (code === 0) return true
    if (
      (code < 32 &&
        code !== 9 &&
        code !== 10 &&
        code !== 12 &&
        code !== 13 &&
        code !== 27) ||
      code === 127
    ) {
      suspiciousCharacters += 1
    }
  }
  return (
    suspiciousCharacters > 0 &&
    (content.length < 32 ||
      suspiciousCharacters >= 8 ||
      suspiciousCharacters / content.length > 0.01)
  )
}

function decodeTextPreview(
  content: Buffer,
  truncated: boolean
): { content: string; encoding: SpaceTextPreviewEncoding } | null {
  let encoding: SpaceTextPreviewEncoding = "utf-8"
  if (content[0] === 0xff && content[1] === 0xfe) {
    encoding = "utf-16le"
  } else if (content[0] === 0xfe && content[1] === 0xff) {
    encoding = "utf-16be"
  }

  try {
    const decoded = new TextDecoder(encoding, { fatal: true }).decode(content, {
      // A bounded prefix can end halfway through a multi-byte character. Keep
      // that incomplete tail buffered instead of misclassifying the file.
      stream: truncated,
    })
    if (containsBinaryControlCharacters(decoded)) return null
    return { content: decoded, encoding }
  } catch {
    return null
  }
}

export class SpaceFiles {
  readonly root: string

  constructor(spaceRoot: string) {
    if (!spaceRoot || typeof spaceRoot !== "string") {
      throw new SpaceFilesError(
        "invalid-root",
        "A non-empty Space root is required"
      )
    }
    try {
      this.root = realpathSync.native(path.resolve(spaceRoot))
      if (!statSync(this.root).isDirectory()) {
        throw new Error("Space root is not a directory")
      }
    } catch (error) {
      throw new SpaceFilesError(
        "invalid-root",
        `Invalid Space root: ${spaceRoot}`,
        undefined,
        error
      )
    }
  }

  async list(
    relativeDirectory = "",
    options: ListSpaceFilesOptions = {}
  ): Promise<SpaceFileEntry[]> {
    const directory = await this.resolveExisting(relativeDirectory, true)
    const directoryStats = await stat(directory)
    if (!directoryStats.isDirectory()) {
      throw new SpaceFilesError(
        "not-a-directory",
        `Space path is not a directory: ${relativeDirectory}`,
        relativeDirectory
      )
    }

    const entries = await readdir(directory, { withFileTypes: true })
    const parentPath = this.toRelative(directory)
    const result: SpaceFileEntry[] = []
    for (const entry of entries) {
      const relativePath = parentPath
        ? `${parentPath}/${entry.name}`
        : entry.name
      if (this.shouldHide(relativePath, options)) {
        continue
      }

      const entryPath = path.join(directory, entry.name)
      const entryStats = await lstat(entryPath)
      const kind: SpaceFileEntryKind = entry.isDirectory()
        ? "directory"
        : entry.isSymbolicLink()
          ? "symbolicLink"
          : "file"
      result.push({
        name: entry.name,
        path: relativePath,
        parentPath,
        kind,
        size: entryStats.size,
        mtimeMs: entryStats.mtimeMs,
      })
    }

    return result.sort((left, right) => {
      if (left.kind === "directory" && right.kind !== "directory") return -1
      if (left.kind !== "directory" && right.kind === "directory") return 1
      return left.name.localeCompare(right.name)
    })
  }

  async readText(relativePath: string): Promise<SpaceTextFile> {
    const {
      filename,
      content,
      stats: fileStats,
    } = await this.readStableFile(relativePath)
    return {
      path: this.toRelative(filename),
      content: decodeUtf8(content, relativePath),
      size: fileStats.size,
      mtimeMs: fileStats.mtimeMs,
    }
  }

  async readBinary(relativePath: string): Promise<SpaceBinaryFile> {
    const {
      filename,
      content,
      stats: fileStats,
    } = await this.readStableFile(relativePath)
    return {
      path: this.toRelative(filename),
      content: new Uint8Array(content),
      size: fileStats.size,
      mtimeMs: fileStats.mtimeMs,
    }
  }

  async readPreview(relativePath: string): Promise<SpaceFilePreview> {
    const {
      filename,
      content,
      stats: fileStats,
    } = await this.readStableFile(relativePath, SPACE_FILE_PREVIEW_MAX_BYTES)
    const truncated = fileStats.size > content.byteLength
    const text = decodeTextPreview(content, truncated)
    const file = {
      path: this.toRelative(filename),
      size: fileStats.size,
      mtimeMs: fileStats.mtimeMs,
    }
    if (!text) return { kind: "binary", ...file }
    return {
      kind: "text",
      ...file,
      ...text,
      previewBytes: content.byteLength,
      truncated,
    }
  }

  async writeText(
    relativePath: string,
    content: string,
    expectedMtimeMs?: number
  ): Promise<SpaceTextFile> {
    const {
      filename,
      content: currentContent,
      stats: currentStats,
    } = await this.readStableFile(relativePath)
    decodeUtf8(currentContent, relativePath)
    if (
      expectedMtimeMs !== undefined &&
      currentStats.mtimeMs !== expectedMtimeMs
    ) {
      throw new SpaceFilesError(
        "file-changed",
        `Space file changed outside Eidos: ${relativePath}`,
        relativePath
      )
    }
    await replaceTextFileAtomically(
      filename,
      content,
      currentStats,
      relativePath
    )
    return this.readText(relativePath)
  }

  async createText(relativePath: string, content = ""): Promise<SpaceTextFile> {
    const filename = await this.resolveNew(relativePath)
    try {
      await writeFile(filename, content, { encoding: "utf8", flag: "wx" })
    } catch (error) {
      if (isNodeError(error, "EEXIST")) {
        throw new SpaceFilesError(
          "file-exists",
          `Space file already exists: ${relativePath}`,
          relativePath,
          error
        )
      }
      throw error
    }
    return this.readText(relativePath)
  }

  async createBinary(
    relativePath: string,
    content: Uint8Array
  ): Promise<SpaceBinaryFile> {
    const filename = await this.resolveNew(relativePath)
    try {
      await writeFile(filename, content, { flag: "wx" })
    } catch (error) {
      if (isNodeError(error, "EEXIST")) {
        throw new SpaceFilesError(
          "file-exists",
          `Space file already exists: ${relativePath}`,
          relativePath,
          error
        )
      }
      throw error
    }
    return this.readBinary(relativePath)
  }

  async createDirectory(relativePath: string): Promise<SpaceFileEntry> {
    const directory = await this.resolveNew(relativePath)
    try {
      await mkdir(directory)
    } catch (error) {
      if (isNodeError(error, "EEXIST")) {
        throw new SpaceFilesError(
          "file-exists",
          `Space path already exists: ${relativePath}`,
          relativePath,
          error
        )
      }
      throw error
    }
    const directoryStats = await stat(directory)
    const portablePath = this.toRelative(directory)
    return {
      name: path.basename(directory),
      path: portablePath,
      parentPath: toPortablePath(path.posix.dirname(portablePath)).replace(
        /^\.$/,
        ""
      ),
      kind: "directory",
      size: directoryStats.size,
      mtimeMs: directoryStats.mtimeMs,
    }
  }

  async importFile(
    sourcePath: string,
    destinationPath: string
  ): Promise<SpaceFileEntry> {
    if (!path.isAbsolute(sourcePath) && !path.win32.isAbsolute(sourcePath)) {
      throw new SpaceFilesError(
        "invalid-path",
        `Imported file paths must be absolute: ${sourcePath}`,
        sourcePath
      )
    }
    let sourceStats: Stats
    try {
      sourceStats = await stat(sourcePath)
    } catch (error) {
      if (isNodeError(error, "ENOENT")) {
        throw new SpaceFilesError(
          "not-found",
          `Imported file does not exist: ${sourcePath}`,
          sourcePath,
          error
        )
      }
      throw error
    }
    if (!sourceStats.isFile()) {
      throw new SpaceFilesError(
        "not-a-file",
        `Imported path is not a file: ${sourcePath}`,
        sourcePath
      )
    }

    const destination = await this.resolveNew(destinationPath)
    try {
      await copyFile(sourcePath, destination, constants.COPYFILE_EXCL)
    } catch (error) {
      if (isNodeError(error, "EEXIST")) {
        throw new SpaceFilesError(
          "file-exists",
          `Space file already exists: ${destinationPath}`,
          destinationPath,
          error
        )
      }
      throw error
    }
    const destinationStats = await stat(destination)
    const portablePath = this.toRelative(destination)
    return {
      name: path.basename(destination),
      path: portablePath,
      parentPath: toPortablePath(path.posix.dirname(portablePath)).replace(
        /^\.$/,
        ""
      ),
      kind: "file",
      size: destinationStats.size,
      mtimeMs: destinationStats.mtimeMs,
    }
  }

  async move(sourcePath: string, destinationPath: string): Promise<void> {
    const normalizedSource = this.normalize(sourcePath)
    const normalizedDestination = this.normalize(destinationPath)
    const source = await this.resolveExistingEntry(sourcePath)
    if (normalizedSource === normalizedDestination) return
    const sourceStats = await lstat(source)
    if (
      sourceStats.isDirectory() &&
      normalizedDestination.startsWith(`${normalizedSource}/`)
    ) {
      throw new SpaceFilesError(
        "invalid-path",
        `A Space folder cannot be moved inside itself: ${destinationPath}`,
        destinationPath
      )
    }
    const destination = await this.resolveNew(destinationPath)
    try {
      const destinationStats = await lstat(destination)
      const [canonicalSource, canonicalDestination] = await Promise.all([
        realpath(source),
        realpath(destination),
      ])
      const isSameDirectoryEntry =
        sourceStats.dev === destinationStats.dev &&
        sourceStats.ino === destinationStats.ino &&
        canonicalSource === canonicalDestination
      if (!isSameDirectoryEntry) {
        throw new SpaceFilesError(
          "file-exists",
          `Space path already exists: ${destinationPath}`,
          destinationPath
        )
      }
    } catch (error) {
      if (error instanceof SpaceFilesError) throw error
      if (!isNodeError(error, "ENOENT")) throw error
    }
    await rename(source, destination)
  }

  async getSystemPath(relativePath = ""): Promise<string> {
    if (!relativePath) return this.root
    return this.resolveExisting(relativePath)
  }

  async getRelativeFilePath(systemPath: string): Promise<string | null> {
    if (!path.isAbsolute(systemPath) && !path.win32.isAbsolute(systemPath)) {
      throw new SpaceFilesError(
        "invalid-path",
        `System file paths must be absolute: ${systemPath}`,
        systemPath
      )
    }
    let canonicalFile: string
    try {
      canonicalFile = await realpath(systemPath)
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return null
      throw error
    }
    const canonicalRoot = await realpath(this.root)
    if (!isWithinRoot(canonicalRoot, canonicalFile)) return null
    this.assertCanonicalPathIsPublic(canonicalRoot, canonicalFile)
    const fileStats = await stat(canonicalFile)
    if (!fileStats.isFile()) return null
    return this.toRelative(canonicalFile)
  }

  async remove(relativePath: string): Promise<void> {
    const target = await this.resolveExistingEntry(relativePath)
    const targetStats = await lstat(target)
    if (targetStats.isDirectory()) {
      await rm(target, { recursive: true })
    } else {
      await unlink(target)
    }
  }

  watch(
    onChange: (change: SpaceFileChange) => void,
    options: WatchSpaceFilesOptions = {}
  ): SpaceFileWatcher {
    const debounceMs = Math.max(
      0,
      Math.min(2_000, options.debounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS)
    )
    const pending = new Map<string, NodeJS.Timeout>()
    const queueChange = (change: SpaceFileChange) => {
      if (debounceMs === 0) {
        onChange(change)
        return
      }
      const key = `${change.eventType}:${change.path}`
      const existing = pending.get(key)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        pending.delete(key)
        onChange(
          change.eventType === "rescan"
            ? {
                ...change,
                path: nearestExistingDirectory(this.root, change.path),
              }
            : change
        )
      }, debounceMs)
      pending.set(key, timer)
    }
    const watcher: FSWatcher = watchFileSystem(
      this.root,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return
        const relativePath = toPortablePath(String(filename))
        if (
          this.shouldHide(relativePath, {
            includeHidden: true,
            includeObsidian: true,
          })
        )
          return
        queueChange(
          eventType === "rename"
            ? {
                eventType: "rescan",
                path: parentPortablePath(relativePath),
              }
            : { eventType: "change", path: relativePath }
        )
      }
    )
    watcher.on("error", () => {
      queueChange({ eventType: "rescan", path: "" })
    })
    return {
      close: () => {
        for (const timer of pending.values()) clearTimeout(timer)
        pending.clear()
        watcher.close()
      },
    }
  }

  private async readStableFile(
    relativePath: string,
    maxBytes?: number
  ): Promise<{
    filename: string
    content: Buffer
    stats: Stats
  }> {
    let lastError: unknown
    let observedChange = false
    for (let attempt = 0; attempt < STABLE_READ_ATTEMPTS; attempt += 1) {
      try {
        const filename = await this.resolveExisting(relativePath)
        const before = await stat(filename)
        if (!before.isFile()) {
          throw new SpaceFilesError(
            "not-a-file",
            `Space path is not a file: ${relativePath}`,
            relativePath
          )
        }
        let content: Buffer
        if (maxBytes === undefined || before.size <= maxBytes) {
          content = await readFile(filename)
        } else {
          const handle = await open(filename, "r")
          try {
            const prefix = Buffer.allocUnsafe(maxBytes)
            const { bytesRead } = await handle.read(prefix, 0, maxBytes, 0)
            content = prefix.subarray(0, bytesRead)
          } finally {
            await handle.close()
          }
        }
        const after = await stat(filename)
        if (sameFileSnapshot(before, after)) {
          return { filename, content, stats: after }
        }
        observedChange = true
      } catch (error) {
        lastError = error
        if (
          !(
            isNodeError(error, "ENOENT") ||
            (error instanceof SpaceFilesError && error.code === "not-found")
          )
        ) {
          throw error
        }
      }
      if (attempt + 1 < STABLE_READ_ATTEMPTS) {
        await wait(STABLE_READ_RETRY_MS)
      }
    }
    if (!observedChange && lastError) throw lastError
    throw new SpaceFilesError(
      "file-changed",
      `Space file kept changing while Eidos was reading it: ${relativePath}`,
      relativePath,
      lastError
    )
  }

  private normalize(relativePath: string, allowRoot = false): string {
    if (
      typeof relativePath !== "string" ||
      relativePath.includes("\0") ||
      path.isAbsolute(relativePath) ||
      (process.platform === "win32" && path.win32.isAbsolute(relativePath))
    ) {
      throw new SpaceFilesError(
        "invalid-path",
        `Space paths must be relative: ${relativePath}`,
        relativePath
      )
    }
    const portablePath =
      process.platform === "win32"
        ? relativePath.replace(/\\/g, "/")
        : relativePath
    const parts = portablePath.split(/\/+/).filter(Boolean)
    if (parts.some((part) => part === "..")) {
      throw new SpaceFilesError(
        "path-outside-space",
        `Space path escapes its root: ${relativePath}`,
        relativePath
      )
    }
    const normalized = parts.filter((part) => part !== ".").join("/")
    if (!allowRoot && normalized.length === 0) {
      throw new SpaceFilesError(
        "invalid-path",
        "A Space file path is required",
        relativePath
      )
    }
    if (PRIVATE_ROOTS.has(parts[0]?.toLowerCase())) {
      throw new SpaceFilesError(
        "invalid-path",
        `Private Space state is not available through the file API: ${relativePath}`,
        relativePath
      )
    }
    return normalized
  }

  private async resolveExisting(
    relativePath: string,
    allowRoot = false
  ): Promise<string> {
    const normalized = this.normalize(relativePath, allowRoot)
    const candidate = path.resolve(this.root, ...normalized.split("/"))
    try {
      const canonicalRoot = await realpath(this.root)
      const canonicalCandidate = await realpath(candidate)
      if (!isWithinRoot(canonicalRoot, canonicalCandidate)) {
        throw new SpaceFilesError(
          "path-outside-space",
          `Space path resolves outside its root: ${relativePath}`,
          relativePath
        )
      }
      this.assertCanonicalPathIsPublic(canonicalRoot, canonicalCandidate)
      return canonicalCandidate
    } catch (error) {
      if (error instanceof SpaceFilesError) throw error
      if (isNodeError(error, "ENOENT")) {
        throw new SpaceFilesError(
          "not-found",
          `Space path does not exist: ${relativePath}`,
          relativePath,
          error
        )
      }
      throw error
    }
  }

  private async resolveNew(relativePath: string): Promise<string> {
    const normalized = this.normalize(relativePath)
    const candidate = path.resolve(this.root, ...normalized.split("/"))
    const canonicalRoot = await realpath(this.root)
    const canonicalParent = await realpath(path.dirname(candidate))
    if (!isWithinRoot(canonicalRoot, canonicalParent)) {
      throw new SpaceFilesError(
        "path-outside-space",
        `Space path resolves outside its root: ${relativePath}`,
        relativePath
      )
    }
    this.assertCanonicalPathIsPublic(canonicalRoot, canonicalParent)
    return path.join(canonicalParent, path.basename(candidate))
  }

  private async resolveExistingEntry(relativePath: string): Promise<string> {
    const normalized = this.normalize(relativePath)
    const candidate = path.resolve(this.root, ...normalized.split("/"))
    const canonicalRoot = await realpath(this.root)
    try {
      const canonicalParent = await realpath(path.dirname(candidate))
      if (!isWithinRoot(canonicalRoot, canonicalParent)) {
        throw new SpaceFilesError(
          "path-outside-space",
          `Space path resolves outside its root: ${relativePath}`,
          relativePath
        )
      }
      this.assertCanonicalPathIsPublic(canonicalRoot, canonicalParent)
      const entryPath = path.join(canonicalParent, path.basename(candidate))
      await lstat(entryPath)
      return entryPath
    } catch (error) {
      if (error instanceof SpaceFilesError) throw error
      if (isNodeError(error, "ENOENT")) {
        throw new SpaceFilesError(
          "not-found",
          `Space path does not exist: ${relativePath}`,
          relativePath,
          error
        )
      }
      throw error
    }
  }

  private assertCanonicalPathIsPublic(
    canonicalRoot: string,
    canonicalPath: string
  ): void {
    const [rootName] = toPortablePath(
      path.relative(canonicalRoot, canonicalPath)
    ).split("/")
    if (PRIVATE_ROOTS.has(rootName.toLowerCase())) {
      throw new SpaceFilesError(
        "invalid-path",
        "Private Space state is not available through the file API"
      )
    }
  }

  private toRelative(absolutePath: string): string {
    return toPortablePath(path.relative(this.root, absolutePath))
  }

  private shouldHide(
    relativePath: string,
    options: ListSpaceFilesOptions
  ): boolean {
    const pathParts = relativePath.split("/")
    const [rootName] = pathParts
    const normalizedRootName = rootName.toLowerCase()
    if (PRIVATE_ROOTS.has(normalizedRootName)) return true
    if (normalizedRootName === ".obsidian") {
      return !options.includeObsidian
    }
    if (
      !options.includeHidden &&
      pathParts.some((part) => part.startsWith("."))
    ) {
      return true
    }
    return path.basename(relativePath) === ".DS_Store"
  }
}
