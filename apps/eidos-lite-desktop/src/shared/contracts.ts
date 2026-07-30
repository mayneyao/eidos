import type {
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileDataSource,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"

import type { EidosLiteServiceEnvironment } from "./service-environment"

export const EIDOS_LITE_CSV_IMPORT_BYTES_MAX = 16 * 1024 * 1024
export const EIDOS_LITE_CSV_EXPORT_BYTES_MAX = 256 * 1024 * 1024
export const EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX = 2 * 1024 * 1024
export const EIDOS_LITE_VERSION_TEXT_DIFF_BYTES_MAX = 1024 * 1024

export const IPC_CHANNELS = {
  appInfo: "eidos-lite:app-info",
  diagnostics: "eidos-lite:diagnostics-get",
  copyDiagnostics: "eidos-lite:diagnostics-copy",
  openSpace: "eidos-lite:space-open",
  newSpace: "eidos-lite:space-new",
  recentSpaces: "eidos-lite:space-recents",
  openRecentSpace: "eidos-lite:space-recent-open",
  removeRecentSpace: "eidos-lite:space-recent-remove",
  getSpace: "eidos-lite:space-get",
  refreshSpace: "eidos-lite:space-refresh",
  loadSpaceDirectory: "eidos-lite:space-directory-load",
  spaceChanged: "eidos-lite:space-changed",
  launchFileAvailable: "eidos-lite:launch-file-available",
  takeLaunchFile: "eidos-lite:launch-file-take",
  openFile: "eidos-lite:file-open",
  previewTextFile: "eidos-lite:text-file-preview",
  inspectFileIssue: "eidos-lite:file-issue-inspect",
  closeFile: "eidos-lite:file-close",
  createEidosFile: "eidos-lite:path-create-eidos",
  createFolder: "eidos-lite:path-create-folder",
  renamePath: "eidos-lite:path-rename",
  movePath: "eidos-lite:path-move",
  copyPath: "eidos-lite:path-copy",
  deletePath: "eidos-lite:path-delete",
  importFiles: "eidos-lite:path-import",
  saveCsv: "eidos-lite:csv-save",
  runtimeCall: "eidos-lite:runtime-call",
  enableVersioning: "eidos-lite:versioning-enable",
  createCheckpoint: "eidos-lite:checkpoint-create",
  versionChanges: "eidos-lite:version-changes",
  versionHistory: "eidos-lite:version-history",
  versionDiff: "eidos-lite:version-diff",
  versionPathDiff: "eidos-lite:version-path-diff",
  versionCancel: "eidos-lite:version-cancel",
  trackedIgnoredPaths: "eidos-lite:tracked-ignored-paths",
  untrackIgnoredPaths: "eidos-lite:untrack-ignored-paths",
  versionTextDiff: "eidos-lite:version-text-diff",
  restoreCheckpoint: "eidos-lite:checkpoint-restore",
  syncStatus: "eidos-lite:sync-status",
  syncSignIn: "eidos-lite:sync-sign-in",
  syncSignOut: "eidos-lite:sync-sign-out",
  syncPreflight: "eidos-lite:sync-preflight",
  syncEnable: "eidos-lite:sync-enable",
  syncRepositories: "eidos-lite:sync-repositories",
  syncClone: "eidos-lite:sync-clone",
  syncRun: "eidos-lite:sync-run",
  syncProgress: "eidos-lite:sync-progress",
  syncQueueStatus: "eidos-lite:sync-queue-status",
  syncQueueChanged: "eidos-lite:sync-queue-changed",
  syncRecoverLocal: "eidos-lite:sync-recover-local",
  syncRecoverHosted: "eidos-lite:sync-recover-hosted",
  syncOpenHelp: "eidos-lite:sync-open-help",
  revealPath: "eidos-lite:path-reveal",
  openPath: "eidos-lite:path-open",
} as const

export type SpaceEntryKind = "directory" | "eidos" | "file" | "symlink"

export interface SpaceTreeEntry {
  name: string
  relativePath: string
  kind: SpaceEntryKind
  size: number
  modifiedAtMs: number
  children?: SpaceTreeEntry[]
  childrenLoaded?: boolean
}

export type TextFileEncoding = "utf-8" | "utf-16le" | "utf-16be"

export type TextFilePreviewResult =
  | {
      type: "text"
      relativePath: string
      content: string
      encoding: TextFileEncoding
      size: number
      modifiedAtMs: number
      truncated: boolean
    }
  | {
      type: "unavailable"
      relativePath: string
      reason: "binary" | "symlink" | "not-file"
      size: number
      modifiedAtMs: number
    }

export type SpaceOperationPhase =
  | "ready"
  | "syncing"
  | "quiescing"
  | "materializing"
  | "validating"
  | "reopening"
  | "failed"
  | "closed"

export interface SpaceOperationState {
  phase: SpaceOperationPhase
  detail?: string
  recoverable: boolean
}

export interface GraftSpaceStatus {
  available: boolean
  backend: "sdk"
  version?: string
  expectedVersion: string
  initialized: boolean
  clean?: boolean
  changedPaths?: number
  currentHead?: string
  generation?: number
  changeToken?: string
  statusCacheHit?: boolean
  checking?: boolean
  error?: string
}

export interface SpaceVersionPathChange {
  path: string
  change: string
  kind?: string
  storage?: string
}

export interface SpaceVersionRowChange {
  op: string
  key: Record<string, unknown>
  values?: unknown[]
  oldValues?: unknown[]
}

export interface SpaceVersionTableDiff {
  name: string
  columns: string[]
  primaryKeyColumns: string[]
  changes: SpaceVersionRowChange[]
}

export interface SpaceVersionFileDiff extends SpaceVersionPathChange {
  rowDiffAvailable: boolean
  logicalStatus?: string
  limitations: string[]
  tables: SpaceVersionTableDiff[]
}

export interface SpaceVersionDiff {
  currentHead: string | null
  currentBranch: string | null
  from: string | null
  to: string | null
  paths: SpaceVersionPathChange[]
  files: SpaceVersionFileDiff[]
  totalPaths?: number
  hasMore?: boolean
  nextCursor?: string | null
}

export interface SpaceVersionTableSummary {
  name: string
  inserts: number
  deletes: number
  updates: number
}

export interface SpaceVersionCommit {
  id: string
  parent: string | null
  message: string
  timestampMs: number
  files: number
  fileCountKnown?: boolean
  changes: SpaceVersionPathChange[]
  tables: SpaceVersionTableSummary[]
  changedTables: number
}

export interface SpaceVersionHistory {
  currentHead: string | null
  currentBranch: string | null
  commits: SpaceVersionCommit[]
  hasMore: boolean
  nextCursor?: string | null
}

export interface GraftTrackedIgnoredPaths {
  paths: string[]
  total: number
  hasMore: boolean
  nextCursor: string | null
}

export type SpaceVersionTextContentState =
  | { state: "absent" }
  | {
      state: "utf8"
      content: string
      size: number
      contentHash?: string
    }
  | {
      state: "too_large" | "missing_payload" | "invalid_utf8"
      size: number
      contentHash?: string
    }

export interface SpaceVersionTextContentDiff {
  path: string
  before: SpaceVersionTextContentState
  after: SpaceVersionTextContentState
}

export interface SpaceVersionTextContentRequest {
  commitId: string
  parentId: string | null
  path: string
  maxBytes: number
}

export interface SpaceSnapshot {
  id: string
  name: string
  displayPath: string
  entries: SpaceTreeEntry[]
  eidosFileCount: number
  operation: SpaceOperationState
  graft: GraftSpaceStatus
  invalidatedSessionIds: string[]
  fileIssues?: EidosFileIssue[]
}

export type EidosFileIssueReason =
  | "missing"
  | "replaced"
  | "unsafe-link"
  | "unsupported"
  | "unreadable"
  | "locked"
  | "corrupt"
  | "open-failed"

export interface EidosFileIssue {
  relativePath: string
  sessionId?: string
  reason: EidosFileIssueReason
  title: string
  message: string
  retryable: boolean
  canReveal: boolean
  canReviewHistory: boolean
  localSafe: true
}

export interface OpenEidosFileResult {
  sessionId: string
  relativePath: string
  snapshot: EidosFileSnapshot
  readOnly: false
}

export interface SpacePathMutationResult {
  snapshot: SpaceSnapshot
  relativePath?: string
  invalidatedSessionIds: string[]
}

export interface EidosLiteAppInfo {
  name: string
  version: string
  platform: string
  services: EidosLiteServiceEnvironment
}

export interface EidosLiteDiagnostics {
  schemaVersion: 1
  generatedAt: string
  app: {
    name: string
    version: string
    packaged: boolean
    platform: string
    arch: string
    electronVersion: string
  }
  environment: "staging" | "production"
  space:
    | { open: false }
    | {
        open: true
        eidosFileCount: number
        operation: Pick<SpaceOperationState, "phase" | "recoverable">
        graft: Pick<
          GraftSpaceStatus,
          | "available"
          | "backend"
          | "version"
          | "expectedVersion"
          | "initialized"
          | "clean"
        >
        runtime: { residentCount: number; trackedCount: number }
      }
  privacy: { excludes: string[] }
}

export interface RecentSpaceEntry {
  id: string
  name: string
  path: string
  lastOpenedAt: string
  available: boolean
}

export interface SyncAccountUser {
  id: string
  email?: string
  name?: string
}

export interface SyncAccountStatus {
  state: "signed-out" | "signed-in"
  user?: SyncAccountUser
}

export interface EidosSyncStatus {
  environment: "staging" | "production"
  account: SyncAccountStatus
  device: {
    state: "not-registered" | "active"
  }
  entitlement: {
    state: "not-checked" | "none" | "read-only" | "read-write" | "blocked"
    detail: string
    quotaBytes?: number
  }
  remote: {
    state: "not-connected" | "connected"
    url?: string
  }
  canEnable: boolean
  canClone: boolean
  blocker: {
    code:
      | "authentication-required"
      | "subscription-required"
      | "read-only"
      | "access-blocked"
    message: string
  } | null
}

export type EidosSyncPreflightConcern =
  | "hidden"
  | "suspected-secret"
  | "large-file"
  | "file-too-large"
  | "symlink"
  | "unsupported-entry"

export interface EidosSyncPreflightEntry {
  relativePath: string
  size: number
  concerns: EidosSyncPreflightConcern[]
}

export interface EidosSyncPreflightExclusion {
  relativePath: string
  reason: "graft-metadata" | "graft-ignore" | "os-noise" | "temporary-file"
}

export interface EidosSyncPreflight {
  manifestId: string
  generatedAtMs: number
  fileCount: number
  eidosFileCount: number
  totalBytes: number
  excludedCount: number
  warningCount: number
  blockerCount: number
  excluded: EidosSyncPreflightExclusion[]
  warnings: EidosSyncPreflightEntry[]
  blockers: EidosSyncPreflightEntry[]
}

export interface EidosSyncPreflightApproval {
  manifestId: string
  confirmWarnings: boolean
}

export interface EidosSyncRepository {
  name: string
  createdAtMs: number
  remoteUrl: string
}

export interface EidosSyncRepositoryList {
  namespace: string
  repositories: EidosSyncRepository[]
}

export type EidosSyncPhase =
  | "authorization"
  | "fetch"
  | "analyze"
  | "drain"
  | "pull"
  | "validate"
  | "reopen"
  | "push"

export interface EidosSyncProgress {
  runId: string
  state: "active" | "completed" | "failed"
  phase: EidosSyncPhase
  detail: string
  startedAtMs: number
  phaseStartedAtMs: number
  elapsedMs: number
}

export interface EidosSyncPhaseTiming {
  phase: EidosSyncPhase
  detail: string
  durationMs: number
}

export interface EidosSyncTelemetry {
  startedAtMs: number
  completedAtMs: number
  durationMs: number
  phases: EidosSyncPhaseTiming[]
}

export interface EidosSyncOutcome {
  state: "synced" | "conflict" | "read-only"
  message: string
  pulled: boolean
  pushed: boolean
  ahead: number
  behind: number
  snapshot: SpaceSnapshot
}

export interface EidosSyncRunResult extends EidosSyncOutcome {
  runId: string
  telemetry: EidosSyncTelemetry
}

export type EidosSyncFailureCode =
  | "offline"
  | "authentication-required"
  | "device-revoked"
  | "entitlement-inactive"
  | "quota-exceeded"
  | "protocol-version-mismatch"
  | "remote-not-found"
  | "remote-conflict"
  | "remote-persistence-failed"
  | "rate-limited"
  | "repository-invalid"
  | "sync-process-crashed"
  | "service-unavailable"
  | "local-changes"
  | "unknown"

export type EidosSyncFailureState =
  | "offline"
  | "paused-sign-in"
  | "paused-subscription"
  | "paused-storage-full"
  | "needs-attention"
  | "service-unavailable"

export type EidosSyncFailureAction =
  | "retry-now"
  | "sign-in"
  | "manage-account"
  | "update"
  | "clone-hosted"
  | "review-local"
  | "work-locally"

export interface EidosSyncFailure {
  code: EidosSyncFailureCode
  state: EidosSyncFailureState
  title: string
  message: string
  action: EidosSyncFailureAction
  actionLabel: string
  retryable: boolean
  localSafe: true
  retryAfterMs?: number
  status?: number
}

export type EidosSyncRunResponse =
  | {
      ok: true
      result: EidosSyncRunResult
    }
  | {
      ok: false
      runId: string
      failure: EidosSyncFailure
      telemetry: EidosSyncTelemetry
    }

export type EidosSyncQueueState =
  | "idle"
  | "pending"
  | "running"
  | "retry-wait"
  | "paused"

export type EidosSyncQueueTrigger =
  | "local-checkpoint"
  | "manual"
  | "crash-recovery"

export interface EidosSyncQueueStatus {
  spaceId: string
  state: EidosSyncQueueState
  trigger: EidosSyncQueueTrigger | null
  attempt: number
  maxAttempts: number
  queuedAtMs?: number
  nextAttemptAtMs?: number
  lastFailure?: EidosSyncFailure
}

export interface EidosSyncRecoveryResult {
  kind: "local-copy" | "hosted-clone"
  name: string
  displayPath: string
  connected: boolean
}

export type EidosSyncHelpDestination = "account" | "download"

interface RuntimeCustomCalls {
  previewCsv: {
    args: [
      fileName: string,
      bytes: ArrayBuffer,
      options?: EidosFileCsvImportOptions,
    ]
    result: EidosFileCsvImportPlan
  }
  importCsv: {
    args: [
      fileName: string,
      bytes: ArrayBuffer,
      options?: EidosFileCsvImportOptions,
    ]
    result: {
      snapshot: EidosFileSnapshot
      result: EidosFileCsvImportResult
    }
  }
}

export const RUNTIME_READ_METHODS = [
  "getSnapshot",
  "getPage",
  "getRow",
  "getGroupCounts",
  "calculateColumnStats",
  "previewFormula",
  "previewCsv",
] as const satisfies readonly (
  | keyof EidosFileDataSource
  | keyof RuntimeCustomCalls
)[]

export const RUNTIME_MUTATION_METHODS = [
  "insertRow",
  "updateRow",
  "deleteRowRanges",
  "deleteRows",
  "updateField",
  "addField",
  "deleteField",
  "createTable",
  "updateTable",
  "deleteTable",
  "createView",
  "duplicateView",
  "deleteView",
  "reorderViews",
  "updateView",
  "importCsv",
] as const satisfies readonly (
  | keyof EidosFileDataSource
  | keyof RuntimeCustomCalls
)[]

export const RUNTIME_METHODS = [
  ...RUNTIME_READ_METHODS,
  ...RUNTIME_MUTATION_METHODS,
] as const

export type RuntimeReadMethod = (typeof RUNTIME_READ_METHODS)[number]
export type RuntimeMutationMethod = (typeof RUNTIME_MUTATION_METHODS)[number]
export type RuntimeMethod = (typeof RUNTIME_METHODS)[number]

type RuntimeCall<M extends RuntimeMethod> = M extends keyof RuntimeCustomCalls
  ? RuntimeCustomCalls[M]
  : M extends keyof EidosFileDataSource
    ? NonNullable<EidosFileDataSource[M]> extends (
        ...args: infer Args
      ) => Promise<infer Result>
      ? { args: Args; result: Result }
      : never
    : never

export type RuntimeCalls = {
  [M in RuntimeMethod]: RuntimeCall<M>
}

export type RuntimeWorkerRequest =
  | {
      type: "create"
      requestId: number
      filePath: string
      title: string
    }
  | {
      type: "open"
      requestId: number
      filePath: string
    }
  | {
      type: "call"
      requestId: number
      method: RuntimeMethod
      args: unknown[]
    }
  | {
      type: "close"
      requestId: number
    }

export type RuntimeWorkerResponse =
  | {
      requestId: number
      ok: true
      result: unknown
    }
  | {
      requestId: number
      ok: false
      error: {
        name: string
        message: string
        code?: string
        stack?: string
      }
    }

export interface EidosLiteApi {
  getAppInfo(): Promise<EidosLiteAppInfo>
  getDiagnostics(): Promise<EidosLiteDiagnostics>
  copyDiagnostics(): Promise<EidosLiteDiagnostics>
  openSpace(): Promise<SpaceSnapshot | null>
  newSpace(): Promise<SpaceSnapshot | null>
  listRecentSpaces(): Promise<RecentSpaceEntry[]>
  openRecentSpace(id: string): Promise<SpaceSnapshot | null>
  removeRecentSpace(id: string): Promise<RecentSpaceEntry[]>
  getSpace(): Promise<SpaceSnapshot | null>
  refreshSpace(): Promise<SpaceSnapshot | null>
  loadSpaceDirectory(relativePath: string): Promise<SpaceSnapshot>
  onSpaceChanged(listener: (snapshot: SpaceSnapshot) => void): () => void
  takeLaunchEidosFile(): Promise<string | null>
  onLaunchEidosFileAvailable(listener: () => void): () => void
  openEidosFile(relativePath: string): Promise<OpenEidosFileResult>
  previewTextFile(relativePath: string): Promise<TextFilePreviewResult>
  inspectEidosFileIssue(relativePath: string): Promise<EidosFileIssue | null>
  closeEidosFile(sessionId: string): Promise<void>
  createEidosFile(
    parentRelativePath: string | null,
    name: string
  ): Promise<SpacePathMutationResult>
  createFolder(
    parentRelativePath: string | null,
    name: string
  ): Promise<SpacePathMutationResult>
  renamePath(
    relativePath: string,
    name: string
  ): Promise<SpacePathMutationResult>
  movePath(
    relativePath: string,
    targetDirectory: string | null
  ): Promise<SpacePathMutationResult>
  copyPath(
    relativePath: string,
    targetDirectory: string | null
  ): Promise<SpacePathMutationResult>
  deletePath(relativePath: string): Promise<SpacePathMutationResult>
  importFiles(
    targetDirectory: string | null
  ): Promise<SpacePathMutationResult | null>
  saveCsvFile(suggestedName: string, bytes: Uint8Array): Promise<boolean>
  callRuntime<M extends RuntimeMethod>(
    sessionId: string,
    method: M,
    args: RuntimeCalls[M]["args"]
  ): Promise<RuntimeCalls[M]["result"]>
  enableVersioning(): Promise<SpaceSnapshot>
  createCheckpoint(message?: string): Promise<SpaceSnapshot>
  getVersionChanges(limit?: number, after?: string): Promise<SpaceVersionDiff>
  getVersionHistory(
    limit?: number,
    after?: string
  ): Promise<SpaceVersionHistory>
  getVersionDiff(
    commitId: string,
    parentId?: string | null,
    limit?: number,
    after?: string
  ): Promise<SpaceVersionDiff>
  getVersionPathDiff(
    relativePath: string,
    commitId?: string | null,
    parentId?: string | null
  ): Promise<SpaceVersionDiff>
  cancelVersionReads(): Promise<void>
  getTrackedIgnoredPaths(
    limit?: number,
    after?: string
  ): Promise<GraftTrackedIgnoredPaths>
  untrackIgnoredPaths(expectedHead: string): Promise<SpaceSnapshot>
  getVersionTextDiff(
    commitId: string,
    parentId: string | null,
    path: string
  ): Promise<SpaceVersionTextContentDiff>
  restoreCheckpoint(
    commitId: string,
    expectedHead: string
  ): Promise<SpaceSnapshot>
  getSyncStatus(): Promise<EidosSyncStatus>
  beginSyncSignIn(): Promise<EidosSyncStatus>
  signOutSync(): Promise<EidosSyncStatus>
  getSyncPreflight(): Promise<EidosSyncPreflight>
  enableSync(approval: EidosSyncPreflightApproval): Promise<EidosSyncStatus>
  listSyncRepositories(): Promise<EidosSyncRepositoryList>
  cloneSyncRepository(remoteUrl: string): Promise<SpaceSnapshot | null>
  runSync(): Promise<EidosSyncRunResponse>
  onSyncProgress(listener: (progress: EidosSyncProgress) => void): () => void
  getSyncQueueStatus(): Promise<EidosSyncQueueStatus | null>
  onSyncQueueChanged(
    listener: (status: EidosSyncQueueStatus) => void
  ): () => void
  copyLocalRecoverySpace(): Promise<EidosSyncRecoveryResult | null>
  cloneHostedRecoverySpace(): Promise<EidosSyncRecoveryResult | null>
  openSyncHelp(destination: EidosSyncHelpDestination): Promise<void>
  revealPath(relativePath: string): Promise<void>
  openPath(relativePath: string): Promise<void>
}
