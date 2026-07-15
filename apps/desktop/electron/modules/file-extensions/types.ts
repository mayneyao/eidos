import type {
  ExtensionDiagnostic,
  ExtensionManifestV1,
  NormalizedExtensionPermissions,
  ExtensionPackageFile,
  ExtensionPackageInspectionStatus,
} from "@eidos.space/extension-manifest"
import type {
  ExtensionLifecycleStatus,
  ExtensionLocalState,
  ExtensionPermissionGrant,
  ExtensionSnapshotIdentity,
} from "@eidos.space/extension-state"

export interface FileExtensionPackageSummary {
  directoryName: string
  status: ExtensionPackageInspectionStatus
  lifecycleStatus: ExtensionLifecycleStatus
  canonicalId?: string
  manifest?: ExtensionManifestV1
  normalizedPermissions?: NormalizedExtensionPermissions
  contentDigest?: string
  permissionHash?: string
  requestedGrants: ExtensionPermissionGrant[]
  localState?: ExtensionLocalState
  files: ExtensionPackageFile[]
  diagnostics: ExtensionDiagnostic[]
}

export interface FileExtensionDiscoveryResult {
  root: ".eidos/extensions"
  phase: "local-state"
  executionAvailable: false
  hostVersion: string
  packages: FileExtensionPackageSummary[]
  diagnostics: ExtensionDiagnostic[]
}

export interface FileExtensionWatchResult {
  watching: boolean
  generation: number
  reason?: "missing-root" | "invalid-root" | "watch-error"
}

export interface FileExtensionTemplateResult {
  canonicalId: string
  root: `.eidos/extensions/${string}`
  files: string[]
}

export type FileExtensionSnapshotRequest = ExtensionSnapshotIdentity

export interface FileExtensionGrantRequest extends ExtensionSnapshotIdentity {
  grant: ExtensionPermissionGrant
  granted: boolean
}

export interface FileExtensionChangedEvent {
  spaceId: string
  generation: number
}
