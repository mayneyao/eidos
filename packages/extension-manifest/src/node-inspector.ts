import { constants, type Dirent, type Stats } from "node:fs"
import { lstat, open, opendir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import {
  calculateExtensionContentDigest,
  calculateExtensionPermissionHash,
  canonicalExtensionPackagePath,
  EXTENSION_LOCK_FILENAME,
  extensionPackagePathCollisionKey,
  type ExtensionPackageContentRecord,
} from "./digest"
import { analyzeExtensionModuleImports } from "./imports"
import { parseExtensionLock } from "./lock"
import {
  analyzeExtensionManifest,
  DEFAULT_MAX_MANIFEST_BYTES,
  DEFAULT_MAX_MANIFEST_DEPTH,
} from "./manifest"
import type {
  DiscoverExtensionPackagesOptions,
  ExtensionDiagnostic,
  ExtensionPackageDiscovery,
  ExtensionPackageInspection,
  InspectExtensionPackageOptions,
} from "./types"

const DEFAULT_MAX_FILES = 2_048
const DEFAULT_MAX_ENTRIES = 4_096
const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 32 * 1024 * 1024
const DEFAULT_MAX_PATH_DEPTH = 32
const DEFAULT_STABLE_READ_ATTEMPTS = 3
const DEFAULT_MAX_PACKAGES = 256
const CODE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|mts|mjs)$/
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true })

interface ScannedPackageFile extends ExtensionPackageContentRecord {
  absolutePath: string
  size: number
}

interface ScanPackageTreeResult {
  root: string
  files: ScannedPackageFile[]
  diagnostics: ExtensionDiagnostic[]
}

class PackageFileChangedError extends Error {}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  )
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
}

function sameSnapshot(left: Stats, right: Stats): boolean {
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

async function readDirectoryEntries(
  directoryPath: string,
  limit: number
): Promise<{ entries: Dirent[]; exceeded: boolean }> {
  const directory = await opendir(directoryPath)
  const entries: Dirent[] = []
  try {
    for await (const entry of directory) {
      if (entries.length >= limit) {
        return { entries, exceeded: true }
      }
      entries.push(entry)
    }
    return { entries, exceeded: false }
  } finally {
    await directory.close().catch(() => undefined)
  }
}

function diagnostic(
  code: ExtensionDiagnostic["code"],
  message: string,
  filePath?: string
): ExtensionDiagnostic {
  return { code, severity: "error", message, path: filePath }
}

async function readStableRegularFile(
  filename: string,
  canonicalRoot: string,
  relativePath: string,
  maxFileBytes: number,
  attempts: number
): Promise<Uint8Array> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      const noFollow =
        typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
      handle = await open(filename, constants.O_RDONLY | noFollow)
      const before = await handle.stat()
      if (!before.isFile()) {
        throw new Error("Package entry is no longer a regular file")
      }
      if (before.nlink > 1) {
        throw new Error("Package file is hard-linked")
      }
      if (before.size > maxFileBytes) {
        throw new RangeError(
          `Package file ${relativePath} is ${before.size} bytes; the per-file limit is ${maxFileBytes}`
        )
      }

      const canonicalFile = await realpath(filename)
      if (!isWithinRoot(canonicalRoot, canonicalFile)) {
        throw new Error("Package file resolves outside its package root")
      }
      const pathStats = await stat(canonicalFile)
      if (!sameSnapshot(before, pathStats)) {
        throw new PackageFileChangedError(
          `Package file changed while opening: ${relativePath}`
        )
      }

      const content = await handle.readFile()
      const after = await handle.stat()
      if (!sameSnapshot(before, after) || content.byteLength !== after.size) {
        throw new PackageFileChangedError(
          `Package file changed while reading: ${relativePath}`
        )
      }
      return new Uint8Array(content)
    } catch (error) {
      lastError = error
      if (
        error instanceof RangeError ||
        (error instanceof Error &&
          (error.message.includes("hard-linked") ||
            error.message.includes("outside its package root") ||
            error.message.includes("regular file")))
      ) {
        throw error
      }
    } finally {
      await handle?.close().catch(() => undefined)
    }
  }
  throw new PackageFileChangedError(
    lastError instanceof Error
      ? lastError.message
      : `Package file did not remain stable: ${relativePath}`
  )
}

async function scanPackageTree(
  packageRoot: string,
  options: InspectExtensionPackageOptions
): Promise<ScanPackageTreeResult> {
  const resolvedRoot = path.resolve(packageRoot)
  const diagnostics: ExtensionDiagnostic[] = []
  let rootStats: Stats
  try {
    rootStats = await lstat(resolvedRoot)
  } catch (error) {
    return {
      root: resolvedRoot,
      files: [],
      diagnostics: [
        diagnostic(
          "package-io",
          `Cannot inspect extension package: ${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    }
  }
  if (rootStats.isSymbolicLink()) {
    return {
      root: resolvedRoot,
      files: [],
      diagnostics: [
        diagnostic(
          "package-symlink",
          "Extension package root cannot be a symbolic link"
        ),
      ],
    }
  }
  if (!rootStats.isDirectory()) {
    return {
      root: resolvedRoot,
      files: [],
      diagnostics: [
        diagnostic(
          "package-not-directory",
          "Extension package root must be a directory"
        ),
      ],
    }
  }

  const canonicalRoot = await realpath(resolvedRoot)
  const canonicalRootStats = await stat(canonicalRoot)
  if (!sameSnapshot(rootStats, canonicalRootStats)) {
    return {
      root: canonicalRoot,
      files: [],
      diagnostics: [
        diagnostic(
          "package-file-changed",
          "Extension package root changed while it was being opened"
        ),
      ],
    }
  }
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
  const maxPathDepth = options.maxPathDepth ?? DEFAULT_MAX_PATH_DEPTH
  const stableReadAttempts = Math.max(
    1,
    options.stableReadAttempts ?? DEFAULT_STABLE_READ_ATTEMPTS
  )
  const files: ScannedPackageFile[] = []
  const collisionPaths = new Map<string, string>()
  const directories: Array<{
    absolutePath: string
    relativePath: string
    depth: number
  }> = [{ absolutePath: canonicalRoot, relativePath: "", depth: 0 }]
  let totalBytes = 0
  let totalEntries = 0

  directoryLoop: while (directories.length > 0) {
    const directory = directories.pop()
    if (!directory) break
    let entries: Dirent[]
    try {
      const result = await readDirectoryEntries(
        directory.absolutePath,
        Math.max(0, maxEntries - totalEntries)
      )
      entries = result.entries
      totalEntries += entries.length
      if (result.exceeded) {
        diagnostics.push(
          diagnostic(
            "package-limit",
            `Package contains more than ${maxEntries} filesystem entries`,
            directory.relativePath
          )
        )
        break directoryLoop
      }
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "package-io",
          `Cannot read package directory: ${error instanceof Error ? error.message : String(error)}`,
          directory.relativePath
        )
      )
      continue
    }

    entries.sort((left, right) =>
      Buffer.compare(Buffer.from(left.name), Buffer.from(right.name))
    )
    for (const entry of entries) {
      const rawPath = directory.relativePath
        ? `${directory.relativePath}/${entry.name}`
        : entry.name
      let relativePath: string
      try {
        relativePath = canonicalExtensionPackagePath(rawPath)
      } catch (error) {
        diagnostics.push(
          diagnostic(
            "package-path-invalid",
            error instanceof Error ? error.message : String(error),
            rawPath
          )
        )
        continue
      }
      const collisionKey = extensionPackagePathCollisionKey(relativePath)
      const collidingPath = collisionPaths.get(collisionKey)
      if (collidingPath && collidingPath !== relativePath) {
        diagnostics.push(
          diagnostic(
            "package-path-collision",
            `Package paths collide after NFC/lowercase normalization: ${collidingPath} and ${relativePath}`,
            relativePath
          )
        )
        continue
      }
      collisionPaths.set(collisionKey, relativePath)

      const absolutePath = path.join(directory.absolutePath, entry.name)
      let entryStats: Stats
      try {
        entryStats = await lstat(absolutePath)
      } catch (error) {
        diagnostics.push(
          diagnostic(
            "package-file-changed",
            `Package entry changed during scan: ${error instanceof Error ? error.message : String(error)}`,
            relativePath
          )
        )
        continue
      }
      if (entryStats.isSymbolicLink()) {
        diagnostics.push(
          diagnostic(
            "package-symlink",
            "Symbolic links are not allowed in extension packages",
            relativePath
          )
        )
        continue
      }
      if (entryStats.isDirectory()) {
        const depth = directory.depth + 1
        if (depth > maxPathDepth) {
          diagnostics.push(
            diagnostic(
              "package-limit",
              `Package path depth exceeds ${maxPathDepth}`,
              relativePath
            )
          )
          continue
        }
        directories.push({ absolutePath, relativePath, depth })
        continue
      }
      if (!entryStats.isFile()) {
        diagnostics.push(
          diagnostic(
            "package-special-file",
            "Only regular files and directories are allowed in extension packages",
            relativePath
          )
        )
        continue
      }
      if (entryStats.nlink > 1) {
        diagnostics.push(
          diagnostic(
            "package-hardlink",
            "Hard-linked files are not allowed in extension packages",
            relativePath
          )
        )
        continue
      }
      if (files.length >= maxFiles) {
        diagnostics.push(
          diagnostic(
            "package-limit",
            `Package contains more than ${maxFiles} files`,
            relativePath
          )
        )
        continue
      }
      if (entryStats.size > maxFileBytes) {
        diagnostics.push(
          diagnostic(
            "package-limit",
            `Package file is ${entryStats.size} bytes; the per-file limit is ${maxFileBytes}`,
            relativePath
          )
        )
        continue
      }
      if (totalBytes + entryStats.size > maxTotalBytes) {
        diagnostics.push(
          diagnostic(
            "package-limit",
            `Package exceeds the total content limit of ${maxTotalBytes} bytes`,
            relativePath
          )
        )
        continue
      }

      try {
        const content = await readStableRegularFile(
          absolutePath,
          canonicalRoot,
          relativePath,
          maxFileBytes,
          stableReadAttempts
        )
        totalBytes += content.byteLength
        files.push({
          path: relativePath,
          absolutePath,
          size: content.byteLength,
          content,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        diagnostics.push(
          diagnostic(
            error instanceof PackageFileChangedError
              ? "package-file-changed"
              : message.includes("hard-linked")
                ? "package-hardlink"
                : message.includes("outside its package root")
                  ? "package-symlink"
                  : message.includes("limit")
                    ? "package-limit"
                    : "package-io",
            message,
            relativePath
          )
        )
      }
    }
  }

  return { root: canonicalRoot, files, diagnostics }
}

function decodeText(
  content: Uint8Array,
  filePath: string,
  code:
    | "package-manifest-encoding"
    | "package-import-syntax"
    | "package-lock-invalid"
): { text?: string; diagnostic?: ExtensionDiagnostic } {
  try {
    return { text: STRICT_UTF8.decode(content) }
  } catch {
    return {
      diagnostic: diagnostic(
        code,
        `${filePath} must be valid UTF-8 text`,
        filePath
      ),
    }
  }
}

export async function inspectExtensionPackage(
  packageRoot: string,
  options: InspectExtensionPackageOptions = {}
): Promise<ExtensionPackageInspection> {
  const tree = await scanPackageTree(packageRoot, options)
  const directoryName = path.basename(path.resolve(packageRoot))
  const diagnostics = [...tree.diagnostics]
  const filesByPath = new Map(tree.files.map((file) => [file.path, file]))
  const publicFiles = tree.files.map((file) => ({
    path: file.path,
    size: file.size,
  }))

  let contentDigest: string | undefined
  if (!diagnostics.some((item) => item.severity === "error")) {
    try {
      contentDigest = calculateExtensionContentDigest(tree.files)
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "package-path-collision",
          error instanceof Error ? error.message : String(error)
        )
      )
    }
  }

  const manifestFile = filesByPath.get("extension.json")
  if (!manifestFile) {
    diagnostics.push(
      diagnostic(
        "package-manifest-missing",
        "Extension package must contain extension.json at its root",
        "extension.json"
      )
    )
    return {
      packageRoot: tree.root,
      directoryName,
      status: "invalid",
      contentDigest,
      files: publicFiles,
      diagnostics,
    }
  }

  const manifestText = decodeText(
    manifestFile.content,
    "extension.json",
    "package-manifest-encoding"
  )
  if (!manifestText.text) {
    if (manifestText.diagnostic) diagnostics.push(manifestText.diagnostic)
    return {
      packageRoot: tree.root,
      directoryName,
      status: "invalid",
      contentDigest,
      files: publicFiles,
      diagnostics,
    }
  }

  const analysis = analyzeExtensionManifest(manifestText.text, {
    packageDirectoryName: directoryName,
    hostVersion: options.hostVersion,
    maxBytes: options.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES,
    maxDepth: options.maxManifestDepth ?? DEFAULT_MAX_MANIFEST_DEPTH,
  })
  diagnostics.push(...analysis.diagnostics)

  if (analysis.manifest) {
    for (const [kind, entrypoint] of Object.entries(
      analysis.manifest.entrypoints
    )) {
      if (entrypoint && !filesByPath.has(entrypoint)) {
        diagnostics.push({
          code: "package-entrypoint-missing",
          severity: "error",
          message: `${kind} entrypoint does not exist: ${entrypoint}`,
          path: entrypoint,
          pointer: `/entrypoints/${kind}`,
        })
      }
    }
  }

  const availablePaths = new Set(filesByPath.keys())
  for (const file of tree.files) {
    if (!CODE_FILE_PATTERN.test(file.path)) continue
    const decoded = decodeText(file.content, file.path, "package-import-syntax")
    if (!decoded.text) {
      if (decoded.diagnostic) diagnostics.push(decoded.diagnostic)
      continue
    }
    diagnostics.push(
      ...analyzeExtensionModuleImports(file.path, decoded.text, availablePaths)
    )
  }

  const lockFile = filesByPath.get(EXTENSION_LOCK_FILENAME)
  if (lockFile) {
    const decoded = decodeText(
      lockFile.content,
      EXTENSION_LOCK_FILENAME,
      "package-lock-invalid"
    )
    if (decoded.text) {
      const lock = parseExtensionLock(decoded.text)
      diagnostics.push(...lock.diagnostics)
      if (
        lock.lock &&
        contentDigest &&
        lock.lock.contentDigest !== contentDigest
      ) {
        diagnostics.push({
          code: "package-locally-modified",
          severity: "warning",
          message:
            "Package content differs from the GitHub snapshot recorded in extension.lock.json",
          path: EXTENSION_LOCK_FILENAME,
        })
      }
    } else if (decoded.diagnostic) {
      diagnostics.push({ ...decoded.diagnostic, severity: "warning" })
    }
  }

  const hasErrors = diagnostics.some((item) => item.severity === "error")
  const status = hasErrors
    ? "invalid"
    : analysis.compatible === false
      ? "incompatible"
      : "ready"
  return {
    packageRoot: tree.root,
    directoryName,
    status,
    canonicalId: analysis.canonicalId,
    manifest: analysis.manifest,
    contentDigest,
    permissionHash:
      analysis.valid && analysis.normalizedPermissions
        ? calculateExtensionPermissionHash(analysis.normalizedPermissions)
        : undefined,
    files: publicFiles,
    diagnostics,
  }
}

function invalidCandidate(
  packageRoot: string,
  directoryName: string,
  code: ExtensionDiagnostic["code"],
  message: string
): ExtensionPackageInspection {
  return {
    packageRoot,
    directoryName,
    status: "invalid",
    files: [],
    diagnostics: [diagnostic(code, message, directoryName)],
  }
}

export async function discoverExtensionPackages(
  extensionsRoot: string,
  options: DiscoverExtensionPackagesOptions = {}
): Promise<ExtensionPackageDiscovery> {
  const resolvedRoot = path.resolve(extensionsRoot)
  let rootStats: Stats
  try {
    rootStats = await lstat(resolvedRoot)
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return { extensionsRoot: resolvedRoot, packages: [], diagnostics: [] }
    }
    return {
      extensionsRoot: resolvedRoot,
      packages: [],
      diagnostics: [
        diagnostic(
          "package-io",
          `Cannot read extensions root: ${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    }
  }
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    return {
      extensionsRoot: resolvedRoot,
      packages: [],
      diagnostics: [
        diagnostic(
          rootStats.isSymbolicLink()
            ? "package-symlink"
            : "package-not-directory",
          "Extensions root must be a real directory"
        ),
      ],
    }
  }

  const maxPackages = options.maxPackages ?? DEFAULT_MAX_PACKAGES
  let entries: Dirent[]
  try {
    const result = await readDirectoryEntries(resolvedRoot, maxPackages)
    if (result.exceeded) {
      return {
        extensionsRoot: resolvedRoot,
        packages: [],
        diagnostics: [
          diagnostic(
            "package-limit",
            `Extensions root contains more than ${maxPackages} entries`
          ),
        ],
      }
    }
    entries = result.entries
  } catch (error) {
    return {
      extensionsRoot: resolvedRoot,
      packages: [],
      diagnostics: [
        diagnostic(
          "package-io",
          `Cannot read extensions root: ${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    }
  }
  entries.sort((left, right) =>
    Buffer.compare(Buffer.from(left.name), Buffer.from(right.name))
  )
  const packages: ExtensionPackageInspection[] = []
  const diagnostics: ExtensionDiagnostic[] = []

  for (const entry of entries) {
    const packageRoot = path.join(resolvedRoot, entry.name)
    if (entry.isSymbolicLink()) {
      packages.push(
        invalidCandidate(
          packageRoot,
          entry.name,
          "package-symlink",
          "Extension package root cannot be a symbolic link"
        )
      )
    } else if (!entry.isDirectory()) {
      packages.push(
        invalidCandidate(
          packageRoot,
          entry.name,
          "package-not-directory",
          "Entries under the extensions root must be package directories"
        )
      )
    } else {
      packages.push(await inspectExtensionPackage(packageRoot, options))
    }
  }

  return { extensionsRoot: resolvedRoot, packages, diagnostics }
}
