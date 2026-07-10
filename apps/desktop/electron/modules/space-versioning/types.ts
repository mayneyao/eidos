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

export interface SpaceVersionStatus {
  spaceId: string
  enabled: boolean
  currentHead: string | null
  currentBranch: string | null
  repositoryFormatVersion: number | null
  dirty: boolean
  hasUnstagedChanges: boolean
  hasStagedChanges: boolean
  hasConflicts: boolean
  counts: SpaceVersionStatusCounts
  paths: SpaceVersionPathStatus[]
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
  from: string
  to?: string
  path?: string
  includeContent?: boolean
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

export interface SpaceVersionDiff {
  currentHead: string | null
  currentBranch: string | null
  from: string
  to: string
  paths: SpaceVersionPathChange[]
  content: SpaceVersionTextContentDiff | null
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
