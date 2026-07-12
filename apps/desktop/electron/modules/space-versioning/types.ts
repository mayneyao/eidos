export type SpaceVersionPathKind =
  | "sqlite_database"
  | "text_file"
  | "binary_file"
  | "unknown"

export type SpaceVersionPathStorage =
  | "sqlite_snapshot"
  | "inline"
  | "external"
  | "unknown"

export type SpaceVersionPathState =
  | "none"
  | "added"
  | "modified"
  | "deleted"
  | "untracked"
  | "conflicted"
  | "unknown"

export interface SpaceVersionPathStatus {
  path: string
  kind: SpaceVersionPathKind
  storage: SpaceVersionPathStorage
  state: Exclude<SpaceVersionPathState, "none">
  indexState: SpaceVersionPathState
  worktreeState: SpaceVersionPathState
  code: string | null
  staged: boolean
  conflicted: boolean
}

export interface SpaceVersionStatusCounts {
  unstaged: number
  staged: number
  conflicted: number
}

export type SpaceVersionUpstreamState =
  | "up_to_date"
  | "ahead"
  | "behind"
  | "diverged"
  | "unknown"

export interface SpaceVersionUpstreamStatus {
  remote: string
  branch: string
  ahead: number
  behind: number
  state: SpaceVersionUpstreamState
}

export interface SpaceVersionStatus {
  spaceId: string
  enabled: boolean
  currentHead: string | null
  currentBranch: string | null
  mergeHead: string | null
  repositoryFormatVersion: number | null
  dirty: boolean
  hasUnstagedChanges: boolean
  hasStagedChanges: boolean
  hasConflicts: boolean
  counts: SpaceVersionStatusCounts
  paths: SpaceVersionPathStatus[]
  remoteNames?: string[]
  upstream?: SpaceVersionUpstreamStatus | null
  ahead?: number
  behind?: number
}

export interface SpaceVersionRemote {
  name: string
  url: string
}

export interface SpaceVersionRemoteListResult {
  currentHead: string | null
  currentBranch: string | null
  remotes: SpaceVersionRemote[]
}

export interface SpaceVersionConfigureRemoteOptions {
  name?: string
  url: string
  branch?: string
}

export interface SpaceVersionConfigureRemoteResult {
  remote: SpaceVersionRemote
  status: SpaceVersionStatus
}

export interface SpaceVersionRemoveRemoteOptions {
  name?: string
}

export interface SpaceVersionRemoveRemoteResult {
  name: string
  status: SpaceVersionStatus
}

export interface SpaceVersionSyncOptions {
  remote?: string
  branch?: string
  expectedHead?: string | null
}

export interface SpaceVersionSyncResult {
  operation: "fetch" | "pull" | "push"
  remote: string
  branch: string | null
  commits: number
  forced: boolean
  status: SpaceVersionStatus
}

export interface SpaceVersionConflictPath {
  path: string
  kind: SpaceVersionPathKind
  storage: SpaceVersionPathStorage
  status: "unresolved" | "resolved"
  total: number
  unresolved: number
  resolved: number
}

export interface SpaceVersionConflictList {
  currentHead: string | null
  currentBranch: string | null
  mergeHead: string | null
  paths: SpaceVersionConflictPath[]
}

export type SpaceVersionConflictResolution = "ours" | "theirs" | "manual"

export interface SpaceVersionResolveConflictOptions {
  path: string
  resolution: SpaceVersionConflictResolution
  expectedHead: string | null
}

export interface SpaceVersionResolveConflictResult {
  path: string
  resolution: SpaceVersionConflictResolution
  remainingConflicts: number
  status: SpaceVersionStatus
}

export type SpaceVersionChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "unknown"

export interface SpaceVersionPathChange {
  path: string
  change: SpaceVersionChangeKind
  kind: SpaceVersionPathKind
  storage: SpaceVersionPathStorage
}

export interface SpaceVersionCommit {
  id: string
  parent: string | null
  parents: string[]
  tree: string | null
  message: string
  timestampMs: number | null
  changes: SpaceVersionPathChange[]
  changedPaths: number
}

export interface SpaceVersionCommitOptions {
  message: string
}

export interface SpaceVersionCommitResult {
  currentHead: string
  currentBranch: string | null
  commit: SpaceVersionCommit
}

export interface SpaceVersionHistoryOptions {
  limit?: number
  cursor?: string
}

export interface SpaceVersionHistoryResult {
  currentHead: string | null
  currentBranch: string | null
  commits: SpaceVersionCommit[]
  nextCursor: string | null
  hasMore: boolean
}

export interface SpaceVersionDiffOptions {
  root?: string
  from?: string
  to?: string
  path?: string
  includeContent?: boolean
  includeRows?: boolean
}

export type SpaceVersionTextContentState =
  | { state: "absent" }
  | {
      state: "utf8"
      content: string
      size: number
      contentHash: string
    }
  | {
      state: "too_large" | "missing_payload" | "invalid_utf8"
      size: number
      contentHash: string
    }

export interface SpaceVersionTextContentDiff {
  path: string
  change: SpaceVersionChangeKind
  kind: "text_file"
  storage: SpaceVersionPathStorage
  before: SpaceVersionTextContentState
  after: SpaceVersionTextContentState
}

export type SpaceVersionSqliteValue = string | number | boolean | null

export type SpaceVersionSqliteRowOperation = "insert" | "update" | "delete"

export interface SpaceVersionSqliteRowChange {
  operation: SpaceVersionSqliteRowOperation
  rowId: number
  values: SpaceVersionSqliteValue[]
  beforeValues: SpaceVersionSqliteValue[] | null
}

export interface SpaceVersionSqliteTableDiff {
  name: string
  columns: string[]
  changes: SpaceVersionSqliteRowChange[]
}

export interface SpaceVersionSqliteLimitation {
  kind: string
  subject: string | null
}

export interface SpaceVersionSqliteOpaqueChange {
  name: string
  change: string
  reason: string
  owner: string | null
}

export interface SpaceVersionSqliteFileDiff {
  path: string
  change: SpaceVersionChangeKind
  kind: "sqlite_database"
  storage: SpaceVersionPathStorage
  rowDiffAvailable: boolean
  logicalStatus: string
  capabilities: string[]
  limitations: SpaceVersionSqliteLimitation[]
  message: string | null
  tables: SpaceVersionSqliteTableDiff[]
  opaqueChanges: SpaceVersionSqliteOpaqueChange[]
}

export interface SpaceVersionDiff {
  currentHead: string | null
  currentBranch: string | null
  from: string
  to: string
  paths: SpaceVersionPathChange[]
  content: SpaceVersionTextContentDiff | null
  sqliteFiles: SpaceVersionSqliteFileDiff[]
}

export interface SpaceVersionStagePathOptions {
  path: string
  expectedHead: string | null
}

export interface SpaceVersionStagePathResult {
  path: string
  status: SpaceVersionStatus
}

export type SpaceVersionUnstagePathOptions = SpaceVersionStagePathOptions
export type SpaceVersionUnstagePathResult = SpaceVersionStagePathResult

export interface SpaceVersionDiscardPathOptions {
  path: string
  expectedHead: string | null
  confirmed?: boolean
}

export type SpaceVersionDiscardEffect = "deleted" | "restored" | "noop"

export interface SpaceVersionDiscardPathResult {
  path: string
  effect: SpaceVersionDiscardEffect
  status: SpaceVersionStatus
}

export type SpaceVersionRestoreEffect =
  | "created"
  | "modified"
  | "deleted"
  | "noop"

export interface SpaceVersionRestorePathOptions {
  revision: string
  path: string
  expectedHead: string
  overwriteChanges?: boolean
  allowDelete?: boolean
}

export interface SpaceVersionRestorePathResult {
  revision: string
  path: string
  kind: SpaceVersionPathKind
  storage: SpaceVersionPathStorage
  effect: SpaceVersionRestoreEffect
  status: SpaceVersionStatus
}

export interface SpaceVersionRestoreOptions {
  revision: string
  expectedHead: string
  overwriteChanges?: boolean
}

export interface SpaceVersionRestoreResult {
  revision: string
  restoredPaths: string[]
  status: SpaceVersionStatus
}
