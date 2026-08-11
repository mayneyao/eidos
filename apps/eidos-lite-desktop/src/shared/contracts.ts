import type {
  AssetLease,
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileDataSource,
  EidosFileSnapshot,
  FileEntry,
  UrlImageLease,
} from "@eidos.space/eidos-file"

import type { EidosLiteServiceEnvironment } from "./service-environment"
import type { EidosLiteKeyboardShortcuts } from "./keyboard-shortcuts"

export interface EidosLiteAssetDataSource {
  name: string
  data: Uint8Array
}

export const EIDOS_LITE_CSV_IMPORT_BYTES_MAX = 16 * 1024 * 1024
export const EIDOS_LITE_CSV_FILE_BYTES_MAX = 1024 * 1024 * 1024
export const EIDOS_LITE_CSV_EXPORT_BYTES_MAX = 256 * 1024 * 1024
export const EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX = 2 * 1024 * 1024
export const EIDOS_LITE_VERSION_TEXT_DIFF_BYTES_MAX = 1024 * 1024

export const IPC_CHANNELS = {
  appInfo: "eidos-lite:app-info",
  preferencesGet: "eidos-lite:preferences-get",
  preferencesUpdate: "eidos-lite:preferences-update",
  preferencesChanged: "eidos-lite:preferences-changed",
  preferencesChooseSpaceLocation:
    "eidos-lite:preferences-choose-space-location",
  updateStatus: "eidos-lite:update-status",
  updateChanged: "eidos-lite:update-changed",
  updateCheck: "eidos-lite:update-check",
  updateDownload: "eidos-lite:update-download",
  updateInstall: "eidos-lite:update-install",
  settingsOpen: "eidos-lite:settings-open",
  settingsOpenDestination: "eidos-lite:settings-open-destination",
  diagnostics: "eidos-lite:diagnostics-get",
  copyDiagnostics: "eidos-lite:diagnostics-copy",
  clipboardReadText: "eidos-lite:clipboard-read-text",
  openExternalUrl: "eidos-lite:url-open-external",
  openSpace: "eidos-lite:space-open",
  newSpace: "eidos-lite:space-new",
  recentSpaces: "eidos-lite:space-recents",
  openRecentSpace: "eidos-lite:space-recent-open",
  removeRecentSpace: "eidos-lite:space-recent-remove",
  getSpace: "eidos-lite:space-get",
  refreshSpace: "eidos-lite:space-refresh",
  refreshExplorer: "eidos-lite:space-explorer-refresh",
  loadSpaceDirectory: "eidos-lite:space-directory-load",
  searchPaths: "eidos-lite:space-paths-search",
  spaceChanged: "eidos-lite:space-changed",
  navigationCommand: "eidos-lite:navigation-command",
  launchFileAvailable: "eidos-lite:launch-file-available",
  takeLaunchFile: "eidos-lite:launch-file-take",
  openFile: "eidos-lite:file-open",
  previewTextFile: "eidos-lite:text-file-preview",
  saveTextFile: "eidos-lite:text-file-save",
  inspectFileIssue: "eidos-lite:file-issue-inspect",
  closeFile: "eidos-lite:file-close",
  createEidosFile: "eidos-lite:path-create-eidos",
  createTextFile: "eidos-lite:path-create-text",
  createFolder: "eidos-lite:path-create-folder",
  renamePath: "eidos-lite:path-rename",
  movePath: "eidos-lite:path-move",
  copyPath: "eidos-lite:path-copy",
  deletePath: "eidos-lite:path-delete",
  importFiles: "eidos-lite:path-import",
  selectEidosFileAssets: "eidos-lite:eidos-file-assets-select",
  importEidosFileAssets: "eidos-lite:eidos-file-assets-import",
  importEidosFileAssetData: "eidos-lite:eidos-file-assets-import-data",
  acquireRemoteEidosFileAsset: "eidos-lite:eidos-file-remote-asset-acquire",
  resolveEidosFileAsset: "eidos-lite:eidos-file-asset-resolve",
  resolveEidosFileUrlImage: "eidos-lite:eidos-file-url-image-resolve",
  releaseEidosFileAsset: "eidos-lite:eidos-file-asset-release",
  activateEidosFileAsset: "eidos-lite:eidos-file-asset-activate",
  selectCsv: "eidos-lite:csv-select",
  releaseCsv: "eidos-lite:csv-release",
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
  versionWorkingTextDiff: "eidos-lite:version-working-text-diff",
  discardWorkingChanges: "eidos-lite:working-changes-discard",
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
  copyPathText: "eidos-lite:path-copy-text",
} as const

export type SpaceEntryKind = "directory" | "eidos" | "file" | "symlink"
export type EidosLiteNavigationDirection = "back" | "forward"
export type EidosLitePathClipboardMode = "absolute" | "relative"

export interface SpacePathSearchHit {
  relativePath: string
  name: string
  kind: Exclude<SpaceEntryKind, "directory">
  score: number
}

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

export type MediaFileKind = "image" | "video" | "audio"

export const EIDOS_SPACE_MEDIA_SCHEME = "eidos-space-media"

export type TextFilePreviewResult =
  | {
      type: "text"
      relativePath: string
      content: string
      encoding: TextFileEncoding
      bom: boolean
      revision: string
      size: number
      modifiedAtMs: number
      truncated: boolean
    }
  | {
      type: "media"
      relativePath: string
      mediaKind: MediaFileKind
      mimeType: string
      previewUrl: string
      size: number
      modifiedAtMs: number
    }
  | {
      type: "unavailable"
      relativePath: string
      reason: "binary" | "symlink" | "not-file"
      size: number
      modifiedAtMs: number
    }

export interface TextFileSaveRequest {
  relativePath: string
  content: string
  expectedRevision: string
}

export type TextFileSaveResult =
  | {
      status: "saved"
      file: Extract<TextFilePreviewResult, { type: "text" }>
    }
  | {
      status: "conflict"
      current: TextFilePreviewResult
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

export type SpaceSyncHistoryState =
  | "up_to_date"
  | "ahead"
  | "behind"
  | "diverged"
  | "unknown"

export interface SpaceSyncHistoryStatus {
  state: SpaceSyncHistoryState
  localHead?: string
  remoteHead?: string
  commonAncestor?: string
  ahead: number
  behind: number
  checkedAtMs?: number
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
  sync?: SpaceSyncHistoryStatus
  checking?: boolean
  error?: string
}

export interface SpaceVersionPathChange {
  path: string
  previousPath?: string
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

export interface SpaceVersionTableSummary {
  name: string
  inserts: number
  deletes: number
  updates: number
}

export type SpaceVersionColumnChangeKind = "added" | "deleted" | "renamed"

export interface SpaceVersionColumnChange {
  kind: SpaceVersionColumnChangeKind
  before?: string
  after?: string
}

export interface SpaceVersionTableDiff {
  name: string
  columns: string[]
  columnChanges?: Array<SpaceVersionColumnChange | null>
  primaryKeyColumns: string[]
  changes: SpaceVersionRowChange[]
  summary?: SpaceVersionTableSummary
  rowChangesLoaded?: boolean
  hasMore?: boolean
  nextCursor?: string | null
}

export interface SpaceVersionFileDiff extends SpaceVersionPathChange {
  rowDiffAvailable: boolean
  logicalStatus?: string
  limitations: string[]
  tables: SpaceVersionTableDiff[]
  detailsLoaded?: boolean
}

export interface SpaceVersionDiff {
  currentHead: string | null
  currentBranch: string | null
  changeToken?: string
  from: string | null
  to: string | null
  paths: SpaceVersionPathChange[]
  files: SpaceVersionFileDiff[]
  totalPaths?: number
  hasMore?: boolean
  nextCursor?: string | null
}

export interface SpaceWorkingChangeTarget {
  kind: "file" | "folder"
  path: string
}

export interface SpaceWorkingChangesDiscardRequest {
  target: SpaceWorkingChangeTarget
  expectedHead: string
  expectedChangeToken: string
}

export interface SpaceWorkingChangesDiscardResult {
  snapshot: SpaceSnapshot
  paths: string[]
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
      state:
        | "too_large"
        | "missing_payload"
        | "invalid_utf8"
        | "unsafe_path"
        | "changed_during_read"
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
  previousPath?: string
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
  architecture: string
  services: EidosLiteServiceEnvironment
}

export type EidosLiteAppearance = "system" | "light" | "dark"
export type EidosLiteLanguage = "system" | "en" | "zh"

export interface EidosLitePreferences {
  appearance: EidosLiteAppearance
  language: EidosLiteLanguage
  keyboardShortcuts: EidosLiteKeyboardShortcuts
  automaticUpdates: boolean
  automaticCheckpoints: boolean
  defaultSpaceLocation: string | null
}

export type EidosLiteSettingsDestination = "documentation" | "website" | "logs"

export type EidosLiteUpdateState =
  | "unavailable"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error"

export interface EidosLiteUpdateStatus {
  state: EidosLiteUpdateState
  currentVersion: string
  version?: string
  progressPercent?: number
  unavailableReason?: "development" | "non-production" | "unsupported-platform"
}

export type EidosLiteLogLevel = "debug" | "info" | "warn" | "error"

export interface EidosLiteDiagnosticLogError {
  name: string
  message: string
  code?: string
  stack?: string
  cause?: EidosLiteDiagnosticLogError
}

export interface EidosLiteDiagnosticLogEntry {
  schemaVersion: 1
  timestamp: string
  sequence: number
  level: EidosLiteLogLevel
  source: "main" | "renderer" | "graft-worker"
  event: string
  message?: string
  context?: Record<string, unknown>
  error?: EidosLiteDiagnosticLogError
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
  logs: {
    format: "jsonl"
    retainedFiles: number
    currentBytes: number
    recent: EidosLiteDiagnosticLogEntry[]
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
  avatarUrl?: string
  avatarDataUrl?: string
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
    usedBytes?: number
    reservedBytes?: number
    remainingBytes?: number
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
      | "access-required"
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
  displayName: string
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

export type EidosSyncOperation = "connect" | "sync" | "clone" | "recovery"

export interface EidosSyncProgress {
  runId: string
  operation: EidosSyncOperation
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

export type EidosSyncConnectionResponse =
  | {
      ok: true
      status: EidosSyncStatus
      telemetry: EidosSyncTelemetry
    }
  | {
      ok: false
      runId: string
      failure: EidosSyncFailure
      telemetry: EidosSyncTelemetry
    }

export type EidosSyncCloneResponse =
  | {
      ok: true
      snapshot: SpaceSnapshot | null
      telemetry: EidosSyncTelemetry
    }
  | {
      ok: false
      runId: string
      failure: EidosSyncFailure
      telemetry: EidosSyncTelemetry
    }

export interface EidosSyncOutcome {
  state: "synced" | "conflict" | "read-only"
  message: string
  pulled: boolean
  pushed: boolean
  localHead?: string
  remoteHead?: string
  commonAncestor?: string
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
  | "upload-too-large"
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

export type EidosSyncHelpDestination = "account" | "download" | "sync-access"

export interface EidosLiteCsvSelection {
  token: string
  fileName: string
  size: number
  modifiedAtMs: number
}

export interface EidosLiteCsvOperationProgress {
  operationId: string
  kind: "plan" | "import"
  status: "running" | "canceling" | "completed" | "canceled" | "failed"
  phase: "analyzing" | "importing" | "finalizing"
  processedBytes: number
  totalBytes: number
  processedRows: number
  totalRows: number | null
  message?: string
  updatedAt: number
}

export interface EidosLiteAssetResolution {
  lease: AssetLease
  bytes?: Uint8Array
}

export interface EidosLiteUrlImageResolution {
  lease: UrlImageLease
  bytes: Uint8Array
}

interface RuntimeCustomCalls {
  allocateFileEntry: {
    args: [
      request: {
        name: string
        mediaType: string
        size: string
        uri: string
      },
    ]
    result: FileEntry
  }
  findFileEntry: {
    args: [entryId: string]
    result: FileEntry | null
  }
  reorderTables: {
    args: [tableIds: string[]]
    result: EidosFileSnapshot
  }
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
  previewCsvFile: {
    args: [
      sourceToken: string,
      options: EidosFileCsvImportOptions,
      operationId: string,
    ]
    result: EidosFileCsvImportPlan
  }
  importCsvFile: {
    args: [
      sourceToken: string,
      options: EidosFileCsvImportOptions,
      operationId: string,
    ]
    result: {
      snapshot: EidosFileSnapshot
      result: EidosFileCsvImportResult
    }
  }
  getCsvOperationProgress: {
    args: [operationId: string]
    result: EidosLiteCsvOperationProgress | null
  }
  cancelCsvOperation: {
    args: [operationId: string]
    result: boolean
  }
}

export const RUNTIME_READ_METHODS = [
  "getSnapshot",
  "allocateFileEntry",
  "findFileEntry",
  "getPage",
  "getRow",
  "getGroupCounts",
  "calculateColumnStats",
  "previewFormula",
  "previewCsv",
  "previewCsvFile",
  "getCsvOperationProgress",
  "cancelCsvOperation",
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
  "reorderTables",
  "createView",
  "duplicateView",
  "deleteView",
  "reorderViews",
  "updateView",
  "importCsv",
  "importCsvFile",
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
  getPreferences(): Promise<EidosLitePreferences>
  updatePreferences(
    patch: Partial<EidosLitePreferences>
  ): Promise<EidosLitePreferences>
  chooseDefaultSpaceLocation(): Promise<EidosLitePreferences | null>
  onPreferencesChanged(
    listener: (preferences: EidosLitePreferences) => void
  ): () => void
  getUpdateStatus(): Promise<EidosLiteUpdateStatus>
  onUpdateStatusChanged(
    listener: (status: EidosLiteUpdateStatus) => void
  ): () => void
  checkForUpdates(): Promise<EidosLiteUpdateStatus>
  downloadUpdate(): Promise<EidosLiteUpdateStatus>
  restartToInstallUpdate(): Promise<void>
  openSettings(): Promise<void>
  openSettingsDestination(
    destination: EidosLiteSettingsDestination
  ): Promise<void>
  getDiagnostics(): Promise<EidosLiteDiagnostics>
  copyDiagnostics(): Promise<EidosLiteDiagnostics>
  readClipboardText(): Promise<string>
  openExternalUrl(uri: string): Promise<void>
  openSpace(): Promise<SpaceSnapshot | null>
  newSpace(): Promise<SpaceSnapshot | null>
  listRecentSpaces(): Promise<RecentSpaceEntry[]>
  openRecentSpace(id: string): Promise<SpaceSnapshot | null>
  removeRecentSpace(id: string): Promise<RecentSpaceEntry[]>
  getSpace(): Promise<SpaceSnapshot | null>
  refreshSpace(): Promise<SpaceSnapshot | null>
  refreshExplorer(): Promise<SpaceSnapshot | null>
  loadSpaceDirectory(relativePath: string): Promise<SpaceSnapshot>
  searchSpacePaths(query: string, limit?: number): Promise<SpacePathSearchHit[]>
  onSpaceChanged(listener: (snapshot: SpaceSnapshot) => void): () => void
  onNavigationCommand(
    listener: (direction: EidosLiteNavigationDirection) => void
  ): () => void
  takeLaunchEidosFile(): Promise<string | null>
  onLaunchEidosFileAvailable(listener: () => void): () => void
  openEidosFile(relativePath: string): Promise<OpenEidosFileResult>
  previewTextFile(relativePath: string): Promise<TextFilePreviewResult>
  saveTextFile(request: TextFileSaveRequest): Promise<TextFileSaveResult>
  inspectEidosFileIssue(relativePath: string): Promise<EidosFileIssue | null>
  closeEidosFile(sessionId: string): Promise<void>
  createEidosFile(
    parentRelativePath: string | null,
    name: string
  ): Promise<SpacePathMutationResult>
  createTextFile(
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
  selectEidosFileAssets(sessionId: string): Promise<FileEntry[]>
  importDroppedEidosFileAssets(
    sessionId: string,
    files: readonly File[]
  ): Promise<FileEntry[]>
  acquireRemoteEidosFileAsset(
    sessionId: string,
    uri: string,
    name?: string
  ): Promise<FileEntry>
  resolveEidosFileAsset(
    sessionId: string,
    entryId: string,
    purpose: AssetLease["purpose"]
  ): Promise<EidosLiteAssetResolution>
  resolveEidosFileUrlImage(
    sessionId: string,
    uri: string,
    purpose: UrlImageLease["purpose"]
  ): Promise<EidosLiteUrlImageResolution>
  releaseEidosFileAsset(sessionId: string, leaseId: string): Promise<void>
  activateEidosFileAsset(
    sessionId: string,
    leaseId: string,
    action: "open" | "download"
  ): Promise<void>
  selectCsvFile(): Promise<EidosLiteCsvSelection | null>
  releaseCsvFile(token: string): Promise<void>
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
    parentId?: string | null,
    tableName?: string,
    rowAfter?: string
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
    path: string,
    previousPath?: string
  ): Promise<SpaceVersionTextContentDiff>
  getWorkingTextDiff(
    expectedHead: string | null,
    path: string,
    previousPath?: string
  ): Promise<SpaceVersionTextContentDiff>
  discardWorkingChanges(
    request: SpaceWorkingChangesDiscardRequest
  ): Promise<SpaceWorkingChangesDiscardResult>
  restoreCheckpoint(
    commitId: string,
    expectedHead: string
  ): Promise<SpaceSnapshot>
  getSyncStatus(): Promise<EidosSyncStatus>
  beginSyncSignIn(): Promise<EidosSyncStatus>
  signOutSync(): Promise<EidosSyncStatus>
  getSyncPreflight(): Promise<EidosSyncPreflight>
  enableSync(
    approval: EidosSyncPreflightApproval
  ): Promise<EidosSyncConnectionResponse>
  listSyncRepositories(): Promise<EidosSyncRepositoryList>
  cloneSyncRepository(
    remoteUrl: string,
    displayName?: string
  ): Promise<EidosSyncCloneResponse>
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
  copyPathText(
    relativePath: string,
    mode: EidosLitePathClipboardMode
  ): Promise<void>
}
