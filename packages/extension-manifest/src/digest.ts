import { createHash } from "node:crypto"
import type { NormalizedExtensionPermissions } from "./types"

export const EXTENSION_LOCK_FILENAME = "extension.lock.json"
export const EXTENSION_IGNORED_ROOT_PATHS = [
  ".git",
  "coverage",
  "dist",
  "node_modules",
] as const
export const EXTENSION_IGNORED_METADATA_FILENAMES = [
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
] as const

const IGNORED_ROOT_PATHS = new Set<string>(EXTENSION_IGNORED_ROOT_PATHS)
const IGNORED_METADATA_FILENAMES = new Set(
  EXTENSION_IGNORED_METADATA_FILENAMES.map((filename) => filename.toLowerCase())
)

export interface ExtensionPackageContentRecord {
  path: string
  content: Uint8Array
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
}

export function canonicalExtensionPackagePath(value: string): string {
  if (
    !value ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value)
  ) {
    throw new Error(`Invalid extension package path: ${value}`)
  }
  const segments = value.split("/")
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === ".."
    )
  ) {
    throw new Error(`Invalid extension package path: ${value}`)
  }
  return segments.map((segment) => segment.normalize("NFC")).join("/")
}

/**
 * Returns whether a canonical package-relative path belongs to a root-level
 * local development artifact or well-known operating-system metadata. These
 * paths are neither installed nor part of the trusted package digest. Source
 * metadata such as package.json, tsconfig.json, and package-manager lock files
 * remains part of the package.
 */
export function isIgnoredExtensionPackagePath(value: string): boolean {
  const canonical = canonicalExtensionPackagePath(value)
  const segments = canonical.split("/")
  const root = segments[0]
  return (
    (root !== undefined && IGNORED_ROOT_PATHS.has(root)) ||
    segments.some((segment) =>
      IGNORED_METADATA_FILENAMES.has(segment.toLowerCase())
    )
  )
}

export function extensionPackagePathCollisionKey(value: string): string {
  return canonicalExtensionPackagePath(value).toLowerCase()
}

function updateLength(
  hash: ReturnType<typeof createHash>,
  length: number
): void {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new Error(`Invalid content length: ${length}`)
  }
  const encoded = Buffer.allocUnsafe(8)
  encoded.writeBigUInt64BE(BigInt(length))
  hash.update(encoded)
}

export function calculateExtensionContentDigest(
  records: readonly ExtensionPackageContentRecord[]
): string {
  const canonical = records
    .map((record) => ({
      path: canonicalExtensionPackagePath(record.path),
      content: record.content,
    }))
    .filter(
      (record) =>
        record.path !== EXTENSION_LOCK_FILENAME &&
        !isIgnoredExtensionPackagePath(record.path)
    )
    .sort((left, right) => compareUtf8(left.path, right.path))

  const collisionKeys = new Set<string>()
  for (const record of canonical) {
    const collisionKey = extensionPackagePathCollisionKey(record.path)
    if (collisionKeys.has(collisionKey)) {
      throw new Error(`Extension package path collision: ${record.path}`)
    }
    collisionKeys.add(collisionKey)
  }

  const hash = createHash("sha256")
  for (const record of canonical) {
    const pathBytes = Buffer.from(record.path, "utf8")
    if (pathBytes.byteLength > 0xffffffff) {
      throw new Error(`Extension package path is too long: ${record.path}`)
    }
    const pathLength = Buffer.allocUnsafe(4)
    pathLength.writeUInt32BE(pathBytes.byteLength)
    hash.update(pathLength)
    hash.update(pathBytes)
    updateLength(hash, record.content.byteLength)
    hash.update(record.content)
  }
  return `sha256:${hash.digest("hex")}`
}

export function canonicalExtensionPermissionsJson(
  permissions: NormalizedExtensionPermissions
): string {
  return JSON.stringify({
    files: {
      read: permissions.files.read,
      write: permissions.files.write,
    },
    network: permissions.network,
  })
}

export function calculateExtensionPermissionHash(
  permissions: NormalizedExtensionPermissions
): string {
  const hash = createHash("sha256")
  hash.update(canonicalExtensionPermissionsJson(permissions), "utf8")
  return `sha256:${hash.digest("hex")}`
}
