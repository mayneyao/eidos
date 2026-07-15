const PACKAGE_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}\.[a-z][a-z0-9-]{1,62}$/
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/
const UTF8_ENCODER = new TextEncoder()

export const EXTENSION_STATE_FORMAT_VERSION = 2 as const

export type LegacyExtensionCandidateContribution = "command" | "file-editor"

export interface LegacyExtensionMappingInput {
  legacyExtensionId: string
  legacySlug?: string
  canonicalPackageId: string
  archiveDigest: string
  candidateContribution: LegacyExtensionCandidateContribution
}

export type LegacyExtensionMappingConflict =
  | "none"
  | "legacy-source"
  | "canonical-package"
  | "legacy-source-and-canonical-package"

export interface LegacyExtensionMapping extends LegacyExtensionMappingInput {
  active: boolean
  conflict: LegacyExtensionMappingConflict
  conflictingLegacyExtensionIds: string[]
  conflictingCanonicalPackageIds: string[]
  createdAt: number
  updatedAt: number
  retiredAt?: number
}

export type ExtensionPermissionGrantKind =
  | "files.read"
  | "files.write"
  | "network"

export interface ExtensionPermissionGrant {
  kind: ExtensionPermissionGrantKind
  value: string
}

export interface ExtensionSnapshotIdentity {
  packageId: string
  contentDigest: string
  permissionHash: string
}

export interface ExtensionLocalState {
  snapshot: ExtensionSnapshotIdentity
  trusted: boolean
  enabled: boolean
  requestedGrants: ExtensionPermissionGrant[]
  granted: ExtensionPermissionGrant[]
  trustedAt?: number
  enablementUpdatedAt?: number
}

export type ExtensionLifecycleStatus =
  | "invalid"
  | "incompatible"
  | "untrusted"
  | "disabled"
  | "enabled"

export interface ExtensionStateStore {
  get(snapshot: ExtensionSnapshotIdentity): ExtensionLocalState
  trust(
    snapshot: ExtensionSnapshotIdentity,
    requestedGrants: readonly ExtensionPermissionGrant[],
    now?: number
  ): ExtensionLocalState
  revokeTrust(snapshot: ExtensionSnapshotIdentity): ExtensionLocalState
  setEnabled(
    snapshot: ExtensionSnapshotIdentity,
    enabled: boolean,
    now?: number
  ): ExtensionLocalState
  setGrant(
    snapshot: ExtensionSnapshotIdentity,
    grant: ExtensionPermissionGrant,
    granted: boolean,
    now?: number
  ): ExtensionLocalState
  close(): void
}

export interface ExtensionMigrationStateStore {
  recordLegacyExtensionMapping(
    mapping: LegacyExtensionMappingInput,
    now?: number
  ): LegacyExtensionMapping
  listLegacyExtensionMappings(options?: {
    includeRetired?: boolean
  }): LegacyExtensionMapping[]
  setLegacyExtensionMappingActive(
    legacyExtensionId: string,
    canonicalPackageId: string,
    active: boolean,
    now?: number
  ): LegacyExtensionMapping
}

export function assertExtensionPackageId(
  packageId: unknown
): asserts packageId is string {
  if (typeof packageId !== "string" || !PACKAGE_ID_PATTERN.test(packageId)) {
    throw new Error("Extension has an invalid package ID")
  }
}

export function assertLegacyExtensionMappingInput(
  mapping: unknown
): asserts mapping is LegacyExtensionMappingInput {
  if (!mapping || typeof mapping !== "object") {
    throw new Error("Legacy extension mapping is required")
  }
  const candidate = mapping as Partial<LegacyExtensionMappingInput>
  if (
    typeof candidate.legacyExtensionId !== "string" ||
    !candidate.legacyExtensionId ||
    candidate.legacyExtensionId.length > 256 ||
    candidate.legacyExtensionId.includes("\0")
  ) {
    throw new Error("Legacy extension mapping has an invalid source ID")
  }
  if (
    candidate.legacySlug !== undefined &&
    (typeof candidate.legacySlug !== "string" ||
      candidate.legacySlug.length > 256 ||
      candidate.legacySlug.includes("\0"))
  ) {
    throw new Error("Legacy extension mapping has an invalid source slug")
  }
  assertExtensionPackageId(candidate.canonicalPackageId)
  if (
    typeof candidate.archiveDigest !== "string" ||
    !SHA256_PATTERN.test(candidate.archiveDigest)
  ) {
    throw new Error("Legacy extension mapping has an invalid archive digest")
  }
  if (
    candidate.candidateContribution !== "command" &&
    candidate.candidateContribution !== "file-editor"
  ) {
    throw new Error("Legacy extension mapping has an invalid v1 contribution")
  }
}

export function assertExtensionSnapshotIdentity(
  snapshot: unknown
): asserts snapshot is ExtensionSnapshotIdentity {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Extension snapshot identity is required")
  }
  const candidate = snapshot as Partial<ExtensionSnapshotIdentity>
  try {
    assertExtensionPackageId(candidate.packageId)
  } catch {
    throw new Error("Extension snapshot has an invalid package ID")
  }
  if (
    typeof candidate.contentDigest !== "string" ||
    !SHA256_PATTERN.test(candidate.contentDigest)
  ) {
    throw new Error("Extension snapshot has an invalid content digest")
  }
  if (
    typeof candidate.permissionHash !== "string" ||
    !SHA256_PATTERN.test(candidate.permissionHash)
  ) {
    throw new Error("Extension snapshot has an invalid permission hash")
  }
}

export function extensionPermissionGrantKey(
  grant: ExtensionPermissionGrant
): string {
  assertExtensionPermissionGrant(grant)
  return `${grant.kind}\0${grant.value}`
}

export function normalizeExtensionPermissionGrants(
  grants: readonly ExtensionPermissionGrant[]
): ExtensionPermissionGrant[] {
  const unique = new Map<string, ExtensionPermissionGrant>()
  for (const grant of grants) {
    assertExtensionPermissionGrant(grant)
    unique.set(extensionPermissionGrantKey(grant), {
      kind: grant.kind,
      value: grant.value,
    })
  }
  return [...unique.values()].sort((left, right) =>
    compareUnsignedUtf8(
      extensionPermissionGrantKey(left),
      extensionPermissionGrantKey(right)
    )
  )
}

function compareUnsignedUtf8(left: string, right: string): number {
  const leftBytes = UTF8_ENCODER.encode(left)
  const rightBytes = UTF8_ENCODER.encode(right)
  const length = Math.min(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) {
      return leftBytes[index]! - rightBytes[index]!
    }
  }
  return leftBytes.length - rightBytes.length
}

export function assertExtensionPermissionGrant(
  grant: unknown
): asserts grant is ExtensionPermissionGrant {
  if (!grant || typeof grant !== "object") {
    throw new Error("Extension permission grant is required")
  }
  const candidate = grant as Partial<ExtensionPermissionGrant>
  if (
    candidate.kind !== "files.read" &&
    candidate.kind !== "files.write" &&
    candidate.kind !== "network"
  ) {
    throw new Error("Extension permission grant has an invalid kind")
  }
  if (
    typeof candidate.value !== "string" ||
    !candidate.value ||
    candidate.value.length > 4096 ||
    candidate.value.includes("\0")
  ) {
    throw new Error("Extension permission grant has an invalid value")
  }
}
