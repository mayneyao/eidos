import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import type {
  EidosSyncPreflight,
  EidosSyncPreflightApproval,
  EidosSyncPreflightConcern,
  EidosSyncPreflightEntry,
  EidosSyncPreflightExclusion,
} from "../../shared/contracts"

export const LARGE_FILE_WARNING_BYTES = 100 * 1024 * 1024
export const MAX_SYNC_FILE_BYTES = 1024 * 1024 * 1024
const MAX_SYNC_ENTRIES = 100_000
const OS_NOISE_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"])
const SECRET_FILE_NAMES = new Set([
  ".dockercfg",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "id_dsa",
  "id_ed25519",
  "id_rsa",
  "secrets.json",
  "service-account.json",
])
const SECRET_FILE_EXTENSIONS = new Set([
  ".jks",
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
])

interface ManifestCandidate {
  relativePath: string
  kind: "eidos" | "file" | "symlink" | "unsupported"
  size: number
  sizeFingerprint: string
  modifiedFingerprint: string
}

function portablePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/")
}

function isHiddenPath(relativePath: string): boolean {
  return relativePath.split("/").some((component) => component.startsWith("."))
}

function isSuspectedSecret(relativePath: string): boolean {
  const components = relativePath
    .split("/")
    .map((component) => component.toLowerCase())
  const name = path.basename(relativePath).toLowerCase()
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    SECRET_FILE_NAMES.has(name) ||
    SECRET_FILE_EXTENSIONS.has(path.extname(name)) ||
    components.some((component) =>
      ["credential", "credentials", "secret", "secrets"].includes(component)
    ) ||
    /(^|[._-])(secret|secrets|credential|credentials)([._-]|$)/.test(name)
  )
}

function isTemporaryFile(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.endsWith(".eidos-wal") ||
    lower.endsWith(".eidos-shm") ||
    lower.endsWith(".eidos-journal") ||
    lower.startsWith("~$")
  )
}

function concernEntry(
  candidate: ManifestCandidate,
  concerns: EidosSyncPreflightConcern[]
): EidosSyncPreflightEntry {
  return {
    relativePath: candidate.relativePath,
    size: candidate.size,
    concerns,
  }
}

function classifyCandidate(candidate: ManifestCandidate): {
  warning?: EidosSyncPreflightEntry
  blocker?: EidosSyncPreflightEntry
} {
  const concerns: EidosSyncPreflightConcern[] = []
  if (isHiddenPath(candidate.relativePath)) concerns.push("hidden")
  if (isSuspectedSecret(candidate.relativePath)) {
    concerns.push("suspected-secret")
  }
  if (candidate.size >= LARGE_FILE_WARNING_BYTES) concerns.push("large-file")
  if (candidate.size > MAX_SYNC_FILE_BYTES) concerns.push("file-too-large")
  if (candidate.kind === "symlink") concerns.push("symlink")
  if (candidate.kind === "unsupported") concerns.push("unsupported-entry")

  if (
    concerns.includes("file-too-large") ||
    concerns.includes("symlink") ||
    concerns.includes("unsupported-entry")
  ) {
    return { blocker: concernEntry(candidate, concerns) }
  }
  return concerns.length > 0
    ? { warning: concernEntry(candidate, concerns) }
    : {}
}

export async function createSyncPreflight(
  root: string
): Promise<EidosSyncPreflight> {
  const candidates: ManifestCandidate[] = []
  const excluded: EidosSyncPreflightExclusion[] = []
  let seen = 0

  const visit = async (absoluteDirectory: string): Promise<void> => {
    const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      seen += 1
      if (seen > MAX_SYNC_ENTRIES) {
        throw new Error(
          `Space contains more than ${MAX_SYNC_ENTRIES} entries; reduce its scope before Eidos Sync`
        )
      }
      const absolutePath = path.join(absoluteDirectory, entry.name)
      const relativePath = portablePath(root, absolutePath)
      if (entry.name === ".graft") {
        excluded.push({ relativePath, reason: "graft-metadata" })
        continue
      }
      if (OS_NOISE_NAMES.has(entry.name)) {
        excluded.push({ relativePath, reason: "os-noise" })
        continue
      }
      if (isTemporaryFile(entry.name)) {
        excluded.push({ relativePath, reason: "temporary-file" })
        continue
      }

      const stats = await fs.lstat(absolutePath, { bigint: true })
      if (stats.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      const size =
        stats.size > BigInt(Number.MAX_SAFE_INTEGER)
          ? Number.MAX_SAFE_INTEGER
          : Number(stats.size)
      candidates.push({
        relativePath,
        kind: stats.isSymbolicLink()
          ? "symlink"
          : stats.isFile()
            ? path.extname(entry.name).toLowerCase() === ".eidos"
              ? "eidos"
              : "file"
            : "unsupported",
        size,
        sizeFingerprint: stats.size.toString(),
        modifiedFingerprint: stats.mtimeNs.toString(),
      })
    }
  }

  await visit(root)
  candidates.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  )
  excluded.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  )

  const warnings: EidosSyncPreflightEntry[] = []
  const blockers: EidosSyncPreflightEntry[] = []
  for (const candidate of candidates) {
    const classified = classifyCandidate(candidate)
    if (classified.warning) warnings.push(classified.warning)
    if (classified.blocker) blockers.push(classified.blocker)
  }
  const regularFiles = candidates.filter(
    (candidate) => candidate.kind === "file" || candidate.kind === "eidos"
  )
  const manifestId = createHash("sha256")
    .update(
      JSON.stringify({
        candidates: candidates.map((candidate) => ({
          path: candidate.relativePath,
          kind: candidate.kind,
          size: candidate.sizeFingerprint,
          modified: candidate.modifiedFingerprint,
        })),
        excluded,
      })
    )
    .digest("hex")

  return {
    manifestId,
    generatedAtMs: Date.now(),
    fileCount: regularFiles.length,
    eidosFileCount: regularFiles.filter(
      (candidate) => candidate.kind === "eidos"
    ).length,
    totalBytes: regularFiles.reduce(
      (total, candidate) => total + candidate.size,
      0
    ),
    excluded,
    warnings,
    blockers,
  }
}

export function assertSyncPreflightApproval(
  preflight: EidosSyncPreflight,
  approval: EidosSyncPreflightApproval
): void {
  if (approval.manifestId !== preflight.manifestId) {
    throw new Error(
      "The Space changed after Sync review. Review the updated upload scope before continuing."
    )
  }
  if (preflight.blockers.length > 0) {
    throw new Error(
      "The Space contains entries that Eidos Sync cannot upload safely. Resolve the blocked entries and review again."
    )
  }
  if (preflight.warnings.length > 0 && !approval.confirmWarnings) {
    throw new Error(
      "Confirm the hidden, secret-like, and large files before Eidos Sync."
    )
  }
}
