import type {
  ExtensionLockV1,
  ExtensionCommandContribution,
  ExtensionDiagnostic,
  ExtensionManifestV1,
  ExtensionMenuContribution,
  NormalizedExtensionPermissions,
  ExtensionPackageFile,
  ExtensionPackageInspectionStatus,
} from "@eidos.space/extension-manifest"
import type {
  ExtensionFileChange,
  ExtensionInstallOperation,
  ExtensionPermissionChange,
  ResolvedGitHubExtensionSource,
} from "@eidos.space/extension-installer"
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
  lock?: ExtensionLockV1
  locallyModified?: boolean
  requestedGrants: ExtensionPermissionGrant[]
  localState?: ExtensionLocalState
  files: ExtensionPackageFile[]
  diagnostics: ExtensionDiagnostic[]
}

export interface FileExtensionDiscoveryResult {
  root: ".eidos/extensions"
  phase: "runtime-preview"
  executionAvailable: true
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

export interface FileExtensionGitHubInstallRequest {
  repository: string
  requested?: string
}

export interface FileExtensionInstallPreview {
  previewId: string
  expiresAt: number
  operation: ExtensionInstallOperation
  canonicalId: string
  displayName: string
  description?: string
  version: string
  source: ResolvedGitHubExtensionSource
  contentDigest: string
  permissionHash: string
  fileCount: number
  fileChanges: ExtensionFileChange[]
  permissionChanges: ExtensionPermissionChange[]
}

export interface FileExtensionApplyInstallRequest {
  previewId: string
  contentDigest: string
  permissionHash: string
}

export interface FileExtensionInstallResult {
  canonicalId: string
  operation: ExtensionInstallOperation
  root: `.eidos/extensions/${string}`
  contentDigest: string
  permissionHash: string
}

export interface FileExtensionUninstallRequest {
  directoryName: string
  canonicalId?: string
  contentDigest?: string
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

export interface FileExtensionCommandSummary
  extends ExtensionCommandContribution, ExtensionSnapshotIdentity {
  packageId: string
  extensionDisplayName: string
  menus: Record<string, ExtensionMenuContribution[]>
}

export interface FileExtensionCommandRequest extends ExtensionSnapshotIdentity {
  commandId: string
  resource: {
    path: string
  }
}

export interface FileExtensionSemanticNotice {
  kind: "notice"
  id: string
  spaceId: string
  packageId: string
  message: string
}

export interface FileExtensionSemanticConfirm {
  kind: "confirm"
  id: string
  spaceId: string
  packageId: string
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}

export interface FileExtensionSemanticSelect {
  kind: "select"
  id: string
  spaceId: string
  packageId: string
  title: string
  placeholder?: string
  items: Array<{
    value: string
    label: string
    description?: string
  }>
}

export type FileExtensionSemanticUiRequest =
  | FileExtensionSemanticNotice
  | FileExtensionSemanticConfirm
  | FileExtensionSemanticSelect

export interface FileExtensionSemanticUiResponse {
  requestId: string
  value?: boolean | string
  cancelled?: boolean
}
