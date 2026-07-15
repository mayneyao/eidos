import { createHash } from "node:crypto"

export interface LegacyExtensionArchiveDigestRecord {
  archivePath: string
  content: Uint8Array
}

const DIGEST_DOMAIN = "eidos-legacy-extension-archive-digest-v1\0"

function updateRecord(
  hash: ReturnType<typeof createHash>,
  value: Uint8Array
): void {
  const length = Buffer.allocUnsafe(8)
  length.writeBigUInt64BE(BigInt(value.byteLength))
  hash.update(length)
  hash.update(value)
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
}

/**
 * Produces the path-independent digest used to bind a reviewed legacy source
 * archive to its PORTING.json receipt. Paths are archive-relative and bytes
 * are hashed exactly; callers must not normalize source content first.
 */
export function calculateLegacyExtensionArchiveDigest(
  records: readonly LegacyExtensionArchiveDigestRecord[]
): string {
  const sorted = [...records].sort((left, right) =>
    compareUtf8(left.archivePath, right.archivePath)
  )
  const seen = new Set<string>()
  const hash = createHash("sha256")
  hash.update(DIGEST_DOMAIN, "utf8")
  for (const record of sorted) {
    if (
      !record.archivePath ||
      record.archivePath.includes("\0") ||
      record.archivePath.includes("\\") ||
      record.archivePath.startsWith("/") ||
      record.archivePath
        .split("/")
        .some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error(
        `Invalid legacy extension archive path: ${record.archivePath}`
      )
    }
    if (seen.has(record.archivePath)) {
      throw new Error(
        `Duplicate legacy extension archive path: ${record.archivePath}`
      )
    }
    seen.add(record.archivePath)
    updateRecord(hash, Buffer.from(record.archivePath, "utf8"))
    updateRecord(hash, record.content)
  }
  return `sha256:${hash.digest("hex")}`
}
