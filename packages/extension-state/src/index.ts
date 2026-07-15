const PACKAGE_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}\.[a-z][a-z0-9-]{1,62}$/
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/
const UTF8_ENCODER = new TextEncoder()

export const EXTENSION_STATE_FORMAT_VERSION = 1 as const

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

export function assertExtensionSnapshotIdentity(
  snapshot: unknown
): asserts snapshot is ExtensionSnapshotIdentity {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Extension snapshot identity is required")
  }
  const candidate = snapshot as Partial<ExtensionSnapshotIdentity>
  if (
    typeof candidate.packageId !== "string" ||
    !PACKAGE_ID_PATTERN.test(candidate.packageId)
  ) {
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
