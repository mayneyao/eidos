import type {
  ExtensionDiagnostic,
  ExtensionManifestV1,
  ExtensionPackageFile,
  ExtensionPackageInspectionStatus,
} from "@eidos.space/extension-manifest"

export interface FileExtensionPackageSummary {
  directoryName: string
  status: ExtensionPackageInspectionStatus
  canonicalId?: string
  manifest?: ExtensionManifestV1
  contentDigest?: string
  permissionHash?: string
  files: ExtensionPackageFile[]
  diagnostics: ExtensionDiagnostic[]
}

export interface FileExtensionDiscoveryResult {
  root: ".eidos/extensions"
  phase: "inspection-only"
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

export interface FileExtensionChangedEvent {
  spaceId: string
  generation: number
}
