import type {
  ExtensionLockV1,
  ExtensionPackageInspection,
  NormalizedExtensionPermissions,
} from "@eidos.space/extension-manifest"

export interface ExtensionInstallFile {
  path: string
  content: Uint8Array
}

export interface GitHubExtensionRequest {
  repository: string
  requested?: string
  subdirectory?: string
}

export interface NormalizedGitHubExtensionRequest {
  repository: string
  owner: string
  repo: string
  requested: string
  subdirectory?: string
}

export interface ResolvedGitHubExtensionSource {
  kind: "github"
  repository: string
  requested: string
  commit: string
  subdirectory?: string
}

export interface GitHubExtensionSnapshot {
  source: ResolvedGitHubExtensionSource
  files: ExtensionInstallFile[]
}

export type ExtensionInstallOperation = "install" | "update"

export type ExtensionFileChangeKind = "added" | "modified" | "removed"

export interface ExtensionFileChange {
  path: string
  kind: ExtensionFileChangeKind
  beforeSize?: number
  afterSize?: number
}

export interface ExtensionPermissionChange {
  kind: "files.read" | "files.write" | "network"
  value: string
  change: "added" | "removed"
}

export interface PreparedExtensionInstall {
  operation: ExtensionInstallOperation
  stagingRoot: string
  packageRoot: string
  canonicalId: string
  source: ResolvedGitHubExtensionSource
  lock: ExtensionLockV1
  inspection: ExtensionPackageInspection
  fileCount: number
  previousContentDigest?: string
  previousLock?: ExtensionLockV1
  fileChanges: ExtensionFileChange[]
  permissionChanges: ExtensionPermissionChange[]
}

export interface ExtensionInstallTargetSnapshot {
  inspection: ExtensionPackageInspection
  files: ExtensionInstallFile[]
  lock?: ExtensionLockV1
  locallyModified: boolean
}

export interface PrepareGitHubExtensionInstallOptions {
  request: GitHubExtensionRequest
  stagingParent: string
  extensionsRoot: string
  hostVersion: string
  fetch?: typeof globalThis.fetch
  maxArchiveBytes?: number
}

export interface CommitPreparedExtensionInstallOptions {
  prepared: PreparedExtensionInstall
  extensionsRoot: string
  hostVersion: string
}

export function extensionPermissionEntries(
  permissions: NormalizedExtensionPermissions | undefined
): Array<{
  kind: ExtensionPermissionChange["kind"]
  value: string
}> {
  if (!permissions) return []
  return [
    ...permissions.files.read.map((value) => ({
      kind: "files.read" as const,
      value,
    })),
    ...permissions.files.write.map((value) => ({
      kind: "files.write" as const,
      value,
    })),
    ...permissions.network.map((value) => ({
      kind: "network" as const,
      value,
    })),
  ]
}
