/**
 * Unpublished Graft merge contract used by Eidos Lite development builds.
 *
 * Keep this type-only snapshot aligned with
 * /Users/mayne/workspace/graft/packages/graft-sdk/index.d.ts until the SDK
 * version containing these APIs is published and pinned by Lite.
 */

import type { GraftTransferProgress } from "./graft-sdk-contracts"

export interface GraftOperationOptions {
  signal?: AbortSignal
}

export type GraftMergePlanKind = "up_to_date" | "fast_forward" | "three_way"

export interface GraftPlanMergeOptions extends GraftOperationOptions {
  revision: string
  expectedHead?: string
}

export interface GraftApplyMergeOptions extends GraftOperationOptions {
  revision: string
  expectedHead?: string
  planToken: string
  onProgress?: (progress: GraftTransferProgress) => void
}

export type GraftSemanticKeyCollation = "binary" | "nocase"
export type GraftManagedColumnResolver =
  | "ignore_for_conflict"
  | "max"
  | "min"
  | "max_timestamp"
  | "recompute"

export interface GraftMergePolicy {
  version: 1
  same_row_merge?: boolean
  default_semantic_keys?: string[]
  semantic_keys?: Record<string, string[]>
  semantic_key_collations?: Record<
    string,
    Record<string, GraftSemanticKeyCollation>
  >
  internal_resolvers?: Record<string, string>
  schema_resolvers?: Record<string, string>
  generated_columns?: Record<string, string[]>
  column_resolvers?: Record<string, Record<string, GraftManagedColumnResolver>>
}

export interface GraftMergePolicyResult {
  policy: GraftMergePolicy
  policy_token: string
  active_merge: boolean
}

export interface GraftMergePolicyValidationIssue {
  key: string
  value: string
  message: string
}

export interface GraftMergePolicyValidationResult {
  valid: boolean
  policy: GraftMergePolicy | null
  policy_token: string | null
  errors: GraftMergePolicyValidationIssue[]
}

export interface GraftValidateMergePolicyOptions extends GraftOperationOptions {
  policy: GraftMergePolicy
}

export interface GraftSetMergePolicyOptions extends GraftOperationOptions {
  policy: GraftMergePolicy
  expectedPolicyToken: string
}

export interface GraftMergePlanResult {
  kind: GraftMergePlanKind
  expected_head: string | null
  target: string
  merge_base: string | null
  staged_paths: string[]
  conflicted_paths: string[]
  plan_token: string
  policy_token: string
  policy_version: number
}

export type GraftMergeStatus =
  | { state: "none" }
  | {
      state: "merging"
      orig_head: string
      merge_head: string
      merge_base: string | null
      staged_count: number
      unmerged_count: number
      state_token: string
      policy_token: string
      policy_version: number
    }

export interface GraftMergeApplyResult {
  plan: GraftMergePlanResult
  output: GraftJson
  merge: GraftMergeStatus
  worktree_paths?: string[]
}

export type GraftMergePathFilter = "all" | "unmerged" | "resolved"
export type GraftMergePathState = "unmerged" | "resolved"

export interface GraftListMergePathsOptions extends GraftOperationOptions {
  filter?: GraftMergePathFilter
  limit?: number
  after?: string
  expectedStateToken: string
}

export interface GraftMergePath {
  path: string
  state: GraftMergePathState
  kind: GraftRepositoryPathKind
  storage: GraftRepositoryPathStorage
  has_base: boolean
  has_ours: boolean
  has_theirs: boolean
}

export interface GraftMergePathPage {
  state_token: string
  items: GraftMergePath[]
  next_cursor: string | null
}

export interface GraftListMergeConflictsOptions extends GraftOperationOptions {
  path: string
  limit?: number
  after?: string
  expectedStateToken: string
}

export interface GraftMergeSchemaColumnChange {
  side: "ours" | "theirs" | string
  operation: string
  from?: string
  to?: string
}

export interface GraftMergeConflict {
  id: string
  path: string
  path_kind: GraftRepositoryPathKind
  storage: GraftRepositoryPathStorage
  kind: "row" | "schema" | "opaque" | "file" | string
  reason: string
  status: "resolved" | "unresolved"
  resolution?: "ours" | "theirs" | "manual" | "edited" | "cells"
  auto_resolvable?: boolean
  recommended_result?: "ours" | "theirs" | "merged"
  recommended_action?: "apply_merge" | "stage_worktree_result" | string
  table?: string
  columns?: string[]
  rowid?: number
  key?: Record<string, unknown>
  ours_rowid?: number
  theirs_rowid?: number
  ours_key?: Record<string, unknown>
  theirs_key?: Record<string, unknown>
  semantic_key?: string[]
  semantic_key_collations?: GraftSemanticKeyCollation[]
  cells?: GraftMergeCellConflict[]
  name?: string
  entry_type?: string
  column_changes?: GraftMergeSchemaColumnChange[]
  change?: string
  owner?: string
  ours_op?: string
  theirs_op?: string
  base_row?: unknown[]
  ours_row?: unknown[]
  theirs_row?: unknown[]
  message?: string
  [key: string]: unknown
}

export interface GraftMergeCellConflict {
  column: string
  base: unknown
  ours: unknown
  theirs: unknown
  resolution?: "ours" | "theirs"
}

export interface GraftMergeConflictPage {
  state_token: string
  path: string
  items: GraftMergeConflict[]
  next_cursor: string | null
}

export type GraftMergeVersion = "base" | "ours" | "theirs" | "result"

export interface GraftReadMergeVersionOptions extends GraftOperationOptions {
  path: string
  version: GraftMergeVersion
  maxBytes: number
  expectedStateToken: string
}

export type GraftMergeContentState =
  | { state: "absent" }
  | { state: "utf8"; content: string; size: number }
  | { state: "too_large"; size: number }
  | { state: "missing_payload"; size: number }
  | { state: "invalid_utf8"; size: number }

export interface GraftMergeContent {
  version: GraftMergeVersion
  revision: string | null
  path: string
  kind: GraftRepositoryPathKind | null
  storage: GraftRepositoryPathStorage | null
  content: GraftMergeContentState
  state_token: string
}

export type GraftMergeSqliteVersion = "base" | "ours" | "theirs"

interface GraftDiffMergeSqliteBase extends GraftOperationOptions {
  path: string
  from: GraftMergeSqliteVersion
  to: GraftMergeSqliteVersion
  expectedStateToken: string
}

export type GraftDiffMergeSqliteOptions =
  | (GraftDiffMergeSqliteBase & {
      mode: "summary"
      table?: never
      rowLimit?: never
      rowAfter?: never
    })
  | (GraftDiffMergeSqliteBase & {
      mode: "rows"
      table: string
      rowLimit?: number
      rowAfter?: string
    })

export interface GraftSqliteTableSummary {
  name: string
  inserts: number
  deletes: number
  updates: number
}

export interface GraftSqliteRowChange {
  op: "insert" | "delete" | "update"
  rowid?: number
  key?: Record<string, unknown>
  values: unknown[]
  old_values?: unknown[]
}

export interface GraftSqliteRowChangeTable {
  name: string
  columns?: string[]
  primary_key_columns?: string[]
  changes: GraftSqliteRowChange[]
}

export interface GraftSqliteSchemaChange {
  name: string
  entry_type: string
  op: "added" | "deleted" | "modified"
  sql: string
  old_sql?: string
}

export interface GraftBoundedSqliteDiffFile {
  path: string
  previous_path?: string
  change: "added" | "modified" | "deleted" | "renamed"
  kind: GraftRepositoryPathKind
  storage: GraftRepositoryPathStorage
  row_diff_available: boolean
  mode: "summary" | "rows"
  logical_status: string
  capabilities: string[]
  limitations: Array<{ kind: string; subject?: string }>
  message?: string
  summaries?: GraftSqliteTableSummary[]
  schema_changes?: GraftSqliteSchemaChange[]
  tables?: GraftSqliteRowChangeTable[]
  opaque_changes?: unknown[]
  has_more: boolean
  next_cursor?: string
  telemetry: {
    requested_table?: string
    tables_considered: number
    tables_scanned: number
    rows_scanned: number
    rows_returned: number
    truncated: boolean
    response_scope:
      | "streaming_rowid"
      | "streaming_primary_key"
      | "streaming_btree"
      | "materialized_compat"
      | "unavailable"
  }
}

export interface GraftBoundedSqliteRepositoryDiff {
  current_head?: string
  current_branch?: string
  from: string
  to: string
  paths: Array<{
    path: string
    previous_path?: string
    change: "added" | "modified" | "deleted" | "renamed"
    kind: GraftRepositoryPathKind
    storage: GraftRepositoryPathStorage
  }>
  files: GraftBoundedSqliteDiffFile[]
}

export interface GraftMergeSqliteDiffResult {
  state_token: string
  path: string
  from: { version: GraftMergeSqliteVersion; revision: string }
  to: { version: GraftMergeSqliteVersion; revision: string }
  diff: GraftBoundedSqliteRepositoryDiff
}

export type GraftMergePathResult = "ours" | "theirs"

export interface GraftSetMergePathResultOptions extends GraftOperationOptions {
  path: string
  result: GraftMergePathResult
  expectedStateToken: string
}

export interface GraftResolveMergeRowOptions extends GraftOperationOptions {
  path: string
  table: string
  identity: number | Record<string, unknown>
  result: GraftMergePathResult
  expectedStateToken: string
}

export interface GraftResolveMergeCellOptions extends GraftOperationOptions {
  path: string
  table: string
  identity: number | Record<string, unknown>
  column: string
  result: GraftMergePathResult
  expectedStateToken: string
}

export interface GraftResolveMergeTableOptions extends GraftOperationOptions {
  path: string
  table: string
  result: GraftMergePathResult
  expectedStateToken: string
}

export interface GraftUnresolveMergePathOptions extends GraftOperationOptions {
  path: string
  expectedStateToken: string
}

export interface GraftStageMergeSqliteResultOptions extends GraftOperationOptions {
  path: string
  expectedStateToken: string
}

export interface GraftPrepareSemanticMergeOptions extends GraftOperationOptions {
  path: string
  provider: string
  managedTables: string[]
  expectedStateToken: string
}

export type GraftSemanticMergeProviderRecord =
  | { state: "pending" }
  | {
      state: "conflict"
      conflicts: unknown[]
      automatic_resolutions: unknown[]
    }
  | {
      state: "merged"
      validation: unknown
      automatic_resolutions: unknown[]
    }

export interface GraftSemanticMergeInput {
  version: GraftMergeSqliteVersion
  revision: string | null
  file_path: string | null
  size: number | null
}

export interface GraftSemanticMergeWorkspace {
  provider_token: string
  provider: string
  path: string
  workspace_path: string
  result_path: string
  managed_tables: string[]
  seed_applied_sql: boolean
  managed_conflicts: number
  prepared_at_unix_ms: number
  state_token: string
  policy_token: string
  policy_version: number
  orig_head: string
  merge_head: string
  merge_base: string | null
  inputs: GraftSemanticMergeInput[]
  record: GraftSemanticMergeProviderRecord
}

export interface GraftRecordSemanticMergeConflictsOptions extends GraftOperationOptions {
  providerToken: string
  conflicts: unknown[]
  automaticResolutions?: unknown[]
  expectedStateToken: string
}

export interface GraftAcceptSemanticMergeResultOptions extends GraftOperationOptions {
  providerToken: string
  validation: unknown
  automaticResolutions?: unknown[]
  expectedStateToken: string
}

export interface GraftWriteAndStageTextResultOptions extends GraftOperationOptions {
  path: string
  content: string
  expectedStateToken: string
}

export interface GraftContinueMergeOptions extends GraftOperationOptions {
  message: string
  expectedStateToken: string
}

export interface GraftAbortMergeOptions extends GraftOperationOptions {
  expectedStateToken: string
}

export interface GraftMergeOperationResult {
  output: GraftJson
  merge: GraftMergeStatus
  worktree_paths?: string[]
}

export type GraftJson = Record<string, unknown> | unknown[]
export type GraftRepositoryPathKind =
  | "sqlite_database"
  | "text_file"
  | "binary_file"
export type GraftRepositoryPathStorage =
  | "sqlite_snapshot"
  | "inline"
  | "external"

export interface GraftMergeRepositorySession {
  getMergePolicy(
    options?: GraftOperationOptions
  ): Promise<GraftMergePolicyResult>
  validateMergePolicy(
    options: GraftValidateMergePolicyOptions
  ): Promise<GraftMergePolicyValidationResult>
  setMergePolicy(
    options: GraftSetMergePolicyOptions
  ): Promise<GraftMergePolicyResult>
  planMerge(options: GraftPlanMergeOptions): Promise<GraftMergePlanResult>
  applyMerge(options: GraftApplyMergeOptions): Promise<GraftMergeApplyResult>
  getMergeStatus(options?: GraftOperationOptions): Promise<GraftMergeStatus>
  listMergePaths(
    options: GraftListMergePathsOptions
  ): Promise<GraftMergePathPage>
  listMergeConflicts(
    options: GraftListMergeConflictsOptions
  ): Promise<GraftMergeConflictPage>
  readMergeVersion(
    options: GraftReadMergeVersionOptions
  ): Promise<GraftMergeContent>
  diffMergeSqlite(
    options: GraftDiffMergeSqliteOptions
  ): Promise<GraftMergeSqliteDiffResult>
  setMergePathResult(
    options: GraftSetMergePathResultOptions
  ): Promise<GraftMergeOperationResult>
  resolveMergeRow(
    options: GraftResolveMergeRowOptions
  ): Promise<GraftMergeOperationResult>
  resolveMergeCell(
    options: GraftResolveMergeCellOptions
  ): Promise<GraftMergeOperationResult>
  resolveMergeTable(
    options: GraftResolveMergeTableOptions
  ): Promise<GraftMergeOperationResult>
  unresolveMergePath(
    options: GraftUnresolveMergePathOptions
  ): Promise<GraftMergeOperationResult>
  stageMergeSqliteResult(
    options: GraftStageMergeSqliteResultOptions
  ): Promise<GraftMergeOperationResult>
  prepareSemanticMerge(
    options: GraftPrepareSemanticMergeOptions
  ): Promise<GraftSemanticMergeWorkspace>
  recordSemanticMergeConflicts(
    options: GraftRecordSemanticMergeConflictsOptions
  ): Promise<GraftSemanticMergeWorkspace>
  acceptSemanticMergeResult(
    options: GraftAcceptSemanticMergeResultOptions
  ): Promise<GraftMergeOperationResult>
  writeAndStageTextResult(
    options: GraftWriteAndStageTextResultOptions
  ): Promise<GraftMergeOperationResult>
  continueMerge(
    options: GraftContinueMergeOptions
  ): Promise<GraftMergeOperationResult>
  abortMerge(
    options: GraftAbortMergeOptions
  ): Promise<GraftMergeOperationResult>
}
