import type {
  AssetLease,
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileDataSource,
  EidosFileSnapshot,
  EidosSystemMergeResult,
  FileEntry,
  UrlImageLease,
} from "@eidos.space/eidos-file"

import type { EidosLiteServiceEnvironment } from "./service-environment"
import type { EidosLiteBuiltInPlugins } from "./built-in-plugins"
import type {
  EidosLiteKeyboardShortcuts,
  EidosLiteShortcutCommand,
} from "./keyboard-shortcuts"

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
  clipboardWriteText: "eidos-lite:clipboard-write-text",
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
  workspaceShortcutCommand: "eidos-lite:workspace-shortcut-command",
  terminalStart: "eidos-lite:terminal-start",
  terminalWrite: "eidos-lite:terminal-write",
  terminalWritePath: "eidos-lite:terminal-write-path",
  terminalResize: "eidos-lite:terminal-resize",
  terminalClose: "eidos-lite:terminal-close",
  terminalData: "eidos-lite:terminal-data",
  terminalExit: "eidos-lite:terminal-exit",
  launchFileAvailable: "eidos-lite:launch-file-available",
  takeLaunchFile: "eidos-lite:launch-file-take",
  openFile: "eidos-lite:file-open",
  previewTextFile: "eidos-lite:text-file-preview",
  htmlPreviewOpen: "eidos-lite:html-preview-open",
  htmlPreviewLayout: "eidos-lite:html-preview-layout",
  htmlPreviewReload: "eidos-lite:html-preview-reload",
  htmlPreviewClose: "eidos-lite:html-preview-close",
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
  accountStatus: "eidos-lite:account-status",
  accountChanged: "eidos-lite:account-changed",
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
  syncMergeStatus: "eidos-lite:sync-merge-status",
  syncMergePlan: "eidos-lite:sync-merge-plan",
  syncMergeApply: "eidos-lite:sync-merge-apply",
  syncMergePaths: "eidos-lite:sync-merge-paths",
  syncMergeConflicts: "eidos-lite:sync-merge-conflicts",
  syncMergeVersion: "eidos-lite:sync-merge-version",
  syncMergeSqliteDiff: "eidos-lite:sync-merge-sqlite-diff",
  syncMergeResolvePath: "eidos-lite:sync-merge-resolve-path",
  syncMergeResolveRow: "eidos-lite:sync-merge-resolve-row",
  syncMergeResolveCell: "eidos-lite:sync-merge-resolve-cell",
  syncMergeResolveTable: "eidos-lite:sync-merge-resolve-table",
  syncMergeUnresolvePath: "eidos-lite:sync-merge-unresolve-path",
  syncMergeWriteText: "eidos-lite:sync-merge-write-text",
  syncMergeContinue: "eidos-lite:sync-merge-continue",
  syncMergeAbort: "eidos-lite:sync-merge-abort",
  syncOpenHelp: "eidos-lite:sync-open-help",
  publishRun: "eidos-lite:publish-run",
  publishProgress: "eidos-lite:publish-progress",
  publishCollectRun: "eidos-lite:publish-collect-run",
  publishBindingsList: "eidos-lite:publish-bindings-list",
  revealPath: "eidos-lite:path-reveal",
  openPath: "eidos-lite:path-open",
  copyPathText: "eidos-lite:path-copy-text",
} as const

export type SpaceEntryKind = "directory" | "eidos" | "file" | "symlink"
export type EidosLiteNavigationDirection = "back" | "forward"
export type EidosLitePathClipboardMode = "absolute" | "relative"

export type EidosPublishAccessMode = "public" | "password" | "private"
export type EidosPublishAccessSelection = "unchanged" | EidosPublishAccessMode
export type EidosPublishBrandingSelection = "unchanged" | "show" | "hide"
export type EidosPublishFormRespondentAccess = "anyone" | "signed_in"

export interface EidosPublishFormPolicy {
  respondentAccess: EidosPublishFormRespondentAccess
  allowMultipleResponses: boolean
  revision: number
}

export interface EidosPublishRequest {
  requestId: string
  relativePath: string
  slug: string
  accessMode: EidosPublishAccessSelection
  branding: EidosPublishBrandingSelection
  formView?: string
  formRespondentAccess?: EidosPublishFormRespondentAccess
  formAllowMultipleResponses?: boolean
  password?: string
}

export type EidosPublishProgress =
  | {
      requestId: string
      kind: "stage"
      message: string
    }
  | {
      requestId: string
      kind: "bytes"
      label: string
      currentBytes: string
      totalBytes: string
      percent: number
    }

export interface EidosPublishResult {
  published: boolean
  ready: boolean
  versionCreated: boolean
  fingerprintSpec: "eidos.publish/source-bundle@1"
  publishFingerprint: string
  driverId:
    | "org.eidos.driver.eidos"
    | "org.eidos.driver.markdown"
    | "org.eidos.driver.form"
  mediaType:
    | "application/vnd.eidos+sqlite3"
    | "text/markdown"
    | "application/vnd.eidos.form+json"
  publicationId: string
  publicationSlug: string
  visibility: "public" | "private"
  accessMode: EidosPublishAccessMode
  showBranding: boolean
  formPolicy: EidosPublishFormPolicy | null
  versionId: string
  sourceBytes: string
  sourceSha256: string
  attachmentFiles: number
  attachmentReferences: number
  attachmentPaths: string[]
  attachmentBytes: string
  bundleBytes: string
  deduplicatedBytes: string
  servingTargetSha256: string | null
  url: string
}

export type EidosPublishResponse =
  | { ok: true; result: EidosPublishResult }
  | {
      ok: false
      failure: {
        code: string
        message: string
        status?: number
      }
    }

export interface EidosPublishCollectRequest {
  requestId: string
  relativePath: string
  publicationId: string
}

export interface EidosPublishCollectResult {
  collected: true
  publicationId: string
  collectorId: string
  collectorGeneration: number
  importedSubmissions: number
  replayedSubmissions: number
}

export type EidosPublishCollectResponse =
  | { ok: true; result: EidosPublishCollectResult }
  | Extract<EidosPublishResponse, { ok: false }>

export type EidosPublicationSourceKind = "eidos-file" | "markdown" | "form"
export type EidosPublicationContentStatus = "current" | "changed" | "unknown"

export interface EidosPublicationCollectorState {
  collectorId: string | null
  collectorGeneration: number | null
  lastAttemptedAt: string | null
  lastSucceededAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  importedSubmissions: number
  replayedSubmissions: number
}

export interface EidosPublicationBinding {
  bindingId: string
  serviceOrigin: string
  accountId: string
  spaceId: string
  relativePath: string
  sourceKind: EidosPublicationSourceKind
  formViewId: string | null
  publicationId: string
  slug: string
  driverId: EidosPublishResult["driverId"]
  currentVersionId: string
  url: string
  accessMode: EidosPublishAccessMode
  showBranding: boolean
  formPolicy: EidosPublishFormPolicy | null
  sourceSha256: string
  fingerprintSpec: EidosPublishResult["fingerprintSpec"] | null
  publishFingerprint: string | null
  contentStatus: EidosPublicationContentStatus
  publishedAt: string
  updatedAt: string
  collector: EidosPublicationCollectorState | null
}

export interface EidosPublicationBindingsRequest {
  relativePath?: string
}

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
export const EIDOS_SPACE_DOCUMENT_SCHEME = "eidos-space-document"

export type TextFileBrowserPreview =
  | { kind: "html"; url: string }
  | { kind: "markdown" }

export interface HtmlPreviewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface HtmlPreviewOpenRequest {
  previewId: string
  url: string
  bounds: HtmlPreviewBounds
  visible: boolean
}

export interface HtmlPreviewLayoutRequest {
  previewId: string
  bounds: HtmlPreviewBounds
  visible: boolean
}

export type TextFilePreviewResult =
  | {
      type: "text"
      relativePath: string
      content: string
      encoding: TextFileEncoding
      bom: boolean
      revision: string
      browserPreview?: TextFileBrowserPreview
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
  pathDiagnostics?: GraftPathDiagnostic[]
  sync?: SpaceSyncHistoryStatus
  checking?: boolean
  error?: string
}

export interface GraftPathDiagnostic {
  path: string
  status: "skipped" | "corrupt" | "analysis_failed"
  operation: string
  protectedByIndex: boolean
  message: string
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

export interface SpaceVersionSchemaChange {
  name: string
  entryType: string
  operation: "added" | "deleted" | "modified"
  sql: string
  oldSql?: string
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
  schemaChanges?: SpaceVersionSchemaChange[]
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

export type SpaceWorkingChangeTarget =
  | {
      kind: "all"
    }
  | {
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
  /** All commit parents in Graft order. Merge commits have two or more. */
  parents?: string[]
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
  /** Files rewritten outside their resident Runtime before this snapshot was emitted. */
  materializedPaths?: string[]
}

export interface EidosLiteTerminalSession {
  id: string
  shell: string
}

export interface EidosLiteTerminalExit {
  sessionId: string
  exitCode: number
  signal?: number
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
/** `system` follows the operating system; every other value is an IANA zone. */
export type EidosLiteTimeZone = string

export interface EidosLitePreferences {
  appearance: EidosLiteAppearance
  language: EidosLiteLanguage
  timeZone: EidosLiteTimeZone
  weekStartsOnMonday: boolean
  builtInPlugins: EidosLiteBuiltInPlugins
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

export interface EidosSyncTransferProgress {
  direction: "upload" | "download"
  transferredBytes: number
  totalBytes: number | null
  bytesPerSecond: number
  estimatedRemainingMs: number | null
}

export interface EidosSyncProgress {
  runId: string
  operation: EidosSyncOperation
  state: "active" | "completed" | "failed"
  phase: EidosSyncPhase
  detail: string
  startedAtMs: number
  phaseStartedAtMs: number
  elapsedMs: number
  transfer?: EidosSyncTransferProgress
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
  materializedPaths?: string[] | null
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

export type EidosSyncMergePlanKind = "up_to_date" | "fast_forward" | "three_way"

export interface EidosSyncMergePlan {
  kind: EidosSyncMergePlanKind
  expectedHead: string | null
  hostedHead: string
  commonAncestor: string | null
  stagedPaths: string[]
  conflictedPaths: string[]
  planToken: string
  policyToken: string
  policyVersion: number
}

export type EidosSyncMergeStatus =
  | { state: "none" }
  | {
      state: "merging"
      localHead: string
      hostedHead: string
      commonAncestor: string | null
      stagedCount: number
      unmergedCount: number
      stateToken: string
      policyToken: string
      policyVersion: number
    }

export type EidosSyncMergePathFilter = "all" | "unmerged" | "resolved"
export type EidosSyncMergePathKind =
  | "sqlite_database"
  | "text_file"
  | "binary_file"
export type EidosSyncMergePathStorage =
  | "sqlite_snapshot"
  | "inline"
  | "external"

export interface EidosSyncMergePath {
  path: string
  state: "unmerged" | "resolved"
  kind: EidosSyncMergePathKind
  storage: EidosSyncMergePathStorage
  hasBase: boolean
  hasLocal: boolean
  hasHosted: boolean
}

export interface EidosSyncMergePathPage {
  stateToken: string
  items: EidosSyncMergePath[]
  nextCursor: string | null
}

export interface EidosSyncMergeSchemaColumnChange {
  side: string
  operation: string
  from?: string
  to?: string
}

export interface EidosSyncMergeConflict {
  id: string
  path: string
  pathKind: EidosSyncMergePathKind
  storage: EidosSyncMergePathStorage
  kind: string
  reason: string
  status: "resolved" | "unresolved"
  resolution?: "ours" | "theirs" | "manual" | "edited" | "cells"
  autoResolvable?: boolean
  recommendedResult?: "ours" | "theirs" | "merged"
  recommendedAction?: string
  table?: string
  /** Eidos Runtime physical column order for the full row payloads. */
  rowColumns?: string[]
  columns?: string[]
  rowid?: number
  key?: Record<string, unknown>
  oursRowid?: number
  theirsRowid?: number
  oursKey?: Record<string, unknown>
  theirsKey?: Record<string, unknown>
  semanticKey?: string[]
  semanticKeyCollations?: Array<"binary" | "nocase">
  cells?: EidosSyncMergeCellConflict[]
  name?: string
  entryType?: string
  columnChanges?: EidosSyncMergeSchemaColumnChange[]
  change?: string
  owner?: string
  oursOperation?: string
  theirsOperation?: string
  baseRow?: unknown[]
  oursRow?: unknown[]
  theirsRow?: unknown[]
  message?: string
}

export interface EidosSyncMergeCellConflict {
  column: string
  base: unknown
  local: unknown
  hosted: unknown
  resolution?: EidosSyncMergeChoice
}

export interface EidosSyncMergeConflictPage {
  stateToken: string
  path: string
  items: EidosSyncMergeConflict[]
  nextCursor: string | null
}

export type EidosSyncMergeVersion = "base" | "ours" | "theirs" | "result"
export type EidosSyncMergeContentState =
  | { state: "absent" }
  | { state: "utf8"; content: string; size: number }
  | { state: "too_large"; size: number }
  | { state: "missing_payload"; size: number }
  | { state: "invalid_utf8"; size: number }

export interface EidosSyncMergeContent {
  version: EidosSyncMergeVersion
  revision: string | null
  path: string
  kind: EidosSyncMergePathKind | null
  storage: EidosSyncMergePathStorage | null
  content: EidosSyncMergeContentState
  stateToken: string
}

export type EidosSyncMergeSqliteVersion = "base" | "ours" | "theirs"

export interface EidosSyncMergeSqliteRevision {
  version: EidosSyncMergeSqliteVersion
  revision: string
}

export interface EidosSyncMergeSqliteDiff {
  stateToken: string
  path: string
  from: EidosSyncMergeSqliteRevision
  to: EidosSyncMergeSqliteRevision
  diff: SpaceVersionDiff
}

export type EidosSyncMergeChoice = "ours" | "theirs"
export type EidosSyncMergeFailureCode =
  | "stale"
  | "cancelled"
  | "unavailable"
  | "invalid-state"
  | "unknown"

export interface EidosSyncMergeFailure {
  code: EidosSyncMergeFailureCode
  title: string
  message: string
  localSafe: true
  retryable: boolean
}

export type EidosSyncMergeResponse<T> =
  | { ok: true; value: T }
  | { ok: false; failure: EidosSyncMergeFailure }

export interface EidosSyncMergeApplyRequest {
  expectedHead: string | null
  planToken: string
}

export interface EidosSyncMergePathsRequest {
  stateToken: string
  filter?: EidosSyncMergePathFilter
  limit?: number
  after?: string
}

export interface EidosSyncMergeConflictsRequest {
  stateToken: string
  path: string
  limit?: number
  after?: string
}

export interface EidosSyncMergeVersionRequest {
  stateToken: string
  path: string
  version: EidosSyncMergeVersion
}

export type EidosSyncMergeSqliteDiffRequest =
  | {
      stateToken: string
      path: string
      from: EidosSyncMergeSqliteVersion
      to: EidosSyncMergeSqliteVersion
      mode: "summary"
    }
  | {
      stateToken: string
      path: string
      from: EidosSyncMergeSqliteVersion
      to: EidosSyncMergeSqliteVersion
      mode: "rows"
      table: string
      rowLimit?: number
      rowAfter?: string
    }

export interface EidosSyncMergeResolvePathRequest {
  stateToken: string
  path: string
  result: EidosSyncMergeChoice
}

export interface EidosSyncMergeResolveRowRequest extends EidosSyncMergeResolvePathRequest {
  table: string
  identity: number | Record<string, unknown>
}

export interface EidosSyncMergeResolveCellRequest extends EidosSyncMergeResolveRowRequest {
  column: string
}

export interface EidosSyncMergeResolveTableRequest extends EidosSyncMergeResolvePathRequest {
  table: string
}

export interface EidosSyncMergeUnresolvePathRequest {
  stateToken: string
  path: string
}

export interface EidosSyncMergeWriteTextRequest {
  stateToken: string
  path: string
  content: string
}

export interface EidosSyncMergeContinueRequest {
  stateToken: string
  message: string
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
  "getRowIndex",
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
  "revertRowMutation",
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
      readOnly?: boolean
    }
  | {
      type: "call"
      requestId: number
      method: RuntimeMethod
      args: unknown[]
    }
  | {
      type: "mergeSystemMetadata"
      requestId: number
      basePath: string
      oursPath: string
      theirsPath: string
      resultPath: string
      oursKey: string
      theirsKey: string
      operationInstant: string
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

export interface RuntimeSystemMetadataMergeOptions {
  basePath: string
  oursPath: string
  theirsPath: string
  resultPath: string
  oursKey: string
  theirsKey: string
  operationInstant: string
}

export type RuntimeSystemMetadataMergeResult = EidosSystemMergeResult

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
  writeClipboardText(text: string): Promise<void>
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
  onWorkspaceShortcutCommand(
    listener: (command: EidosLiteShortcutCommand) => void
  ): () => void
  startTerminal(cols: number, rows: number): Promise<EidosLiteTerminalSession>
  writeTerminal(sessionId: string, data: string): void
  writeTerminalPath(sessionId: string, relativePath: string): Promise<void>
  resizeTerminal(sessionId: string, cols: number, rows: number): void
  closeTerminal(sessionId: string): Promise<void>
  onTerminalData(
    listener: (sessionId: string, data: string) => void
  ): () => void
  onTerminalExit(listener: (exit: EidosLiteTerminalExit) => void): () => void
  takeLaunchEidosFile(): Promise<string | null>
  onLaunchEidosFileAvailable(listener: () => void): () => void
  openEidosFile(relativePath: string): Promise<OpenEidosFileResult>
  previewTextFile(relativePath: string): Promise<TextFilePreviewResult>
  openHtmlPreview(request: HtmlPreviewOpenRequest): Promise<void>
  layoutHtmlPreview(request: HtmlPreviewLayoutRequest): Promise<void>
  reloadHtmlPreview(previewId: string): Promise<void>
  closeHtmlPreview(previewId: string): Promise<void>
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
  getAccountStatus(): Promise<SyncAccountStatus>
  onAccountChanged(listener: (status: SyncAccountStatus) => void): () => void
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
  getSyncMergeStatus(): Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>
  planSyncMerge(): Promise<EidosSyncMergeResponse<EidosSyncMergePlan>>
  applySyncMerge(
    request: EidosSyncMergeApplyRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>
  listSyncMergePaths(
    request: EidosSyncMergePathsRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergePathPage>>
  listSyncMergeConflicts(
    request: EidosSyncMergeConflictsRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeConflictPage>>
  readSyncMergeVersion(
    request: EidosSyncMergeVersionRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeContent>>
  diffSyncMergeSqlite(
    request: EidosSyncMergeSqliteDiffRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeSqliteDiff>>
  resolveSyncMergePath(
    request: EidosSyncMergeResolvePathRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>
  resolveSyncMergeRow(
    request: EidosSyncMergeResolveRowRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>
  resolveSyncMergeCell(
    request: EidosSyncMergeResolveCellRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>
  resolveSyncMergeTable(
    request: EidosSyncMergeResolveTableRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>
  unresolveSyncMergePath(
    request: EidosSyncMergeUnresolvePathRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>
  writeSyncMergeText(
    request: EidosSyncMergeWriteTextRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>
  continueSyncMerge(
    request: EidosSyncMergeContinueRequest
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>
  abortSyncMerge(
    stateToken: string
  ): Promise<EidosSyncMergeResponse<EidosSyncMergeStatus>>
  openSyncHelp(destination: EidosSyncHelpDestination): Promise<void>
  publishFile(request: EidosPublishRequest): Promise<EidosPublishResponse>
  collectPublishedForm(
    request: EidosPublishCollectRequest
  ): Promise<EidosPublishCollectResponse>
  listPublicationBindings(
    request?: EidosPublicationBindingsRequest
  ): Promise<EidosPublicationBinding[]>
  onPublishProgress(
    listener: (progress: EidosPublishProgress) => void
  ): () => void
  revealPath(relativePath: string): Promise<void>
  openPath(relativePath: string): Promise<void>
  copyPathText(
    relativePath: string,
    mode: EidosLitePathClipboardMode
  ): Promise<void>
}
