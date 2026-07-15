export interface ExtensionCommandContribution {
  id: string
  title: string
  category?: string
}

export interface ExtensionMenuContribution {
  command: string
  when?: string
  group?: string
}

export interface ExtensionFileEditorSelector {
  filenamePattern?: string
  mediaType?: string
}

export interface ExtensionFileEditorContribution {
  id: string
  displayName: string
  selector: ExtensionFileEditorSelector[]
  priority: "default" | "option"
}

export interface ExtensionManifestV1 {
  $schema?: string
  manifestVersion: 1
  publisher: string
  name: string
  displayName: string
  description?: string
  version: string
  engines: {
    eidos: string
  }
  entrypoints: {
    worker?: string
    ui?: string
  }
  contributes: {
    commands?: ExtensionCommandContribution[]
    menus?: Record<string, ExtensionMenuContribution[]>
    fileEditors?: ExtensionFileEditorContribution[]
  }
  permissions: ExtensionPermissions
}

export interface ExtensionPermissions {
  files: {
    read: string[]
    write: string[]
  }
  network: string[]
}

export interface NormalizedExtensionPermissions {
  files: {
    read: string[]
    write: string[]
  }
  network: string[]
}

export type ExtensionDiagnosticSeverity = "error" | "warning"

export type ExtensionDiagnosticCode =
  | "manifest-too-large"
  | "manifest-json-depth"
  | "manifest-json-syntax"
  | "manifest-duplicate-key"
  | "manifest-schema"
  | "manifest-semver"
  | "manifest-reserved-publisher"
  | "manifest-directory-mismatch"
  | "manifest-entrypoint-invalid"
  | "manifest-entrypoint-required"
  | "manifest-id-namespace"
  | "manifest-duplicate-contribution"
  | "manifest-command-missing"
  | "manifest-no-contributions"
  | "manifest-permission-invalid"
  | "manifest-incompatible"
  | "package-not-directory"
  | "package-symlink"
  | "package-hardlink"
  | "package-special-file"
  | "package-path-invalid"
  | "package-path-collision"
  | "package-limit"
  | "package-file-changed"
  | "package-io"
  | "package-manifest-missing"
  | "package-manifest-encoding"
  | "package-entrypoint-missing"
  | "package-import-syntax"
  | "package-import-unsupported"
  | "package-import-missing"
  | "package-lock-invalid"
  | "package-locally-modified"

export interface ExtensionDiagnostic {
  code: ExtensionDiagnosticCode
  severity: ExtensionDiagnosticSeverity
  message: string
  path?: string
  pointer?: string
  offset?: number
  length?: number
}

export interface AnalyzeExtensionManifestOptions {
  packageDirectoryName?: string
  hostVersion?: string
  maxBytes?: number
  maxDepth?: number
}

export interface ExtensionManifestAnalysis {
  valid: boolean
  compatible: boolean | null
  canonicalId?: string
  manifest?: ExtensionManifestV1
  normalizedPermissions?: NormalizedExtensionPermissions
  diagnostics: ExtensionDiagnostic[]
}

export interface ExtensionPackageFile {
  path: string
  size: number
}

export type ExtensionPackageInspectionStatus =
  | "invalid"
  | "incompatible"
  | "ready"

export interface ExtensionPackageInspection {
  packageRoot: string
  directoryName: string
  status: ExtensionPackageInspectionStatus
  canonicalId?: string
  manifest?: ExtensionManifestV1
  normalizedPermissions?: NormalizedExtensionPermissions
  contentDigest?: string
  permissionHash?: string
  lock?: ExtensionLockV1
  locallyModified?: boolean
  files: ExtensionPackageFile[]
  diagnostics: ExtensionDiagnostic[]
}

export interface InspectExtensionPackageOptions {
  hostVersion?: string
  maxManifestBytes?: number
  maxManifestDepth?: number
  maxEntries?: number
  maxFiles?: number
  maxFileBytes?: number
  maxTotalBytes?: number
  maxPathDepth?: number
  stableReadAttempts?: number
}

export interface DiscoverExtensionPackagesOptions extends InspectExtensionPackageOptions {
  maxPackages?: number
}

export interface ExtensionPackageDiscovery {
  extensionsRoot: string
  packages: ExtensionPackageInspection[]
  diagnostics: ExtensionDiagnostic[]
}

export interface ExtensionLockV1 {
  lockVersion: 1
  source: {
    kind: "github"
    repository: string
    requested: string
    commit: string
  }
  contentDigest: string
}
