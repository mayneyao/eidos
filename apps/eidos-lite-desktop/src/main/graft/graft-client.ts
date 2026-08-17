import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { parse as parseToml, stringify as stringifyToml } from "smol-toml"

import type {
  GraftSpaceStatus,
  EidosSyncMergeConflict,
  EidosSyncMergeCellConflict,
  EidosSyncMergeConflictPage,
  EidosSyncMergeContent,
  EidosSyncMergePath,
  EidosSyncMergePathPage,
  EidosSyncMergePlan,
  EidosSyncMergeSqliteDiff,
  EidosSyncMergeSqliteVersion,
  EidosSyncMergeStatus,
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionFileDiff,
  SpaceVersionHistory,
  SpaceVersionPathChange,
  SpaceVersionRowChange,
  SpaceVersionSchemaChange,
  SpaceVersionTableDiff,
  SpaceVersionTableSummary,
  SpaceVersionTextContentDiff,
  SpaceSyncHistoryStatus,
} from "../../shared/contracts"
import type {
  GraftMergePolicy,
  GraftMergePolicyResult,
  GraftMergePolicyValidationResult,
  GraftSemanticMergeInput,
  GraftSemanticMergeWorkspace,
} from "../../shared/graft-merge-contracts"
import type { GraftTransferProgress } from "../../shared/graft-sdk-contracts"
import { resolveEidosLiteServiceEnvironment } from "../../shared/service-environment"
import type { GraftSdkTransport } from "./graft-sdk-transport"

const SDK_DIFF_PAGE_SIZE = 100
const SDK_PATH_BATCH_SIZE = 1_000
export const GRAFT_SDK_VERSION = "0.3.18"
export const GRAFT_LOCAL_MERGE_SDK_VERSION = "0.3.18"

export interface GraftClientOptions {
  sdkTransport: GraftSdkTransport
  syncRemoteOrigin?: string
}

export interface GraftRepositoryStatus {
  dirty: boolean
  currentHead: string | null
  currentBranch: string | null
  ahead: number
  behind: number
  hasConflicts: boolean
  changedPaths: number
  paths: string[]
  changes: SpaceVersionPathChange[]
  generation?: number
  changeToken?: string
  sync?: SpaceSyncHistoryStatus
  statusCacheHit?: boolean
  persistentSnapshotHit?: boolean
  persistentSnapshotSaved?: boolean
  stabilityRetries?: number
  verifiedPaths?: string[]
  pathDiagnostics?: GraftRepositoryPathDiagnostic[]
}

export interface GraftRepositoryPathDiagnostic {
  path: string
  status: "skipped" | "corrupt" | "analysis_failed"
  operation: string
  protectedByIndex: boolean
  message: string
}

export interface GraftCommitResult {
  id: string
}

interface GraftStatusOptions {
  signal?: AbortSignal
  verifyPaths?: readonly string[]
}

interface GraftRemoteOperationOptions {
  signal?: AbortSignal
  onProgress?: (progress: GraftTransferProgress) => void
}

interface GraftMergeMutationOptions {
  signal?: AbortSignal
  onProgress?: (progress: GraftTransferProgress) => void
  onWorktreePaths?: (paths: string[] | null) => void
}

export interface GraftIgnoreInspection {
  path: string
  isIgnored: boolean
  isTracked: boolean
  isDirectory: boolean
  hasTrackedDescendants: boolean
}

export function isOfficialRemoteUrl(value: string, origin: string): boolean {
  const httpValue = canonicalRemoteUrl(value)
  try {
    const url = new URL(httpValue)
    return (
      url.protocol === "https:" &&
      url.origin === new URL(origin).origin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname.split("/").filter(Boolean).length === 2
    )
  } catch {
    return false
  }
}

function canonicalRemoteUrl(value: string): string {
  return value.startsWith("graft+https://")
    ? `https://${value.slice("graft+https://".length)}`
    : value
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function checkpointValue(value: unknown): string | null {
  const checkpoint = stringValue(value)
  return checkpoint === undefined || checkpoint === "root" ? null : checkpoint
}

function isString(value: string | undefined): value is string {
  return value !== undefined
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === code
  )
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function syncHistoryState(
  value: unknown,
  localHead: string | undefined,
  remoteHead: string | undefined,
  commonAncestor: string | undefined,
  ahead: number,
  behind: number
): SpaceSyncHistoryStatus["state"] {
  if (localHead && remoteHead) {
    if (localHead === remoteHead) return "up_to_date"
    if (commonAncestor) {
      if (localHead === commonAncestor && remoteHead !== commonAncestor) {
        return "behind"
      }
      if (remoteHead === commonAncestor && localHead !== commonAncestor) {
        return "ahead"
      }
      if (
        localHead !== commonAncestor &&
        remoteHead !== commonAncestor &&
        localHead !== remoteHead
      ) {
        return "diverged"
      }
    }
  }
  if (
    value === "up_to_date" ||
    value === "ahead" ||
    value === "behind" ||
    value === "diverged"
  ) {
    return value
  }
  if (ahead > 0 && behind > 0) return "diverged"
  if (ahead > 0) return "ahead"
  if (behind > 0) return "behind"
  return "unknown"
}

export function classifySyncHistory(input: {
  state?: unknown
  localHead?: string
  remoteHead?: string
  commonAncestor?: string
  ahead: number
  behind: number
}): SpaceSyncHistoryStatus["state"] {
  return syncHistoryState(
    input.state,
    input.localHead,
    input.remoteHead,
    input.commonAncestor,
    input.ahead,
    input.behind
  )
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : []
}

function requiredString(value: unknown, label: string): string {
  const result = stringValue(value)
  if (!result) throw new Error(`Graft returned an invalid ${label}`)
  return result
}

function mergeStatus(value: unknown): EidosSyncMergeStatus {
  const item = record(value)
  if (item.state === "none") return { state: "none" }
  if (item.state !== "merging") {
    throw new Error("Graft returned an invalid merge status")
  }
  return {
    state: "merging",
    localHead: requiredString(item.orig_head, "merge Local head"),
    hostedHead: requiredString(item.merge_head, "merge Hosted head"),
    commonAncestor: stringValue(item.merge_base) ?? null,
    stagedCount: Math.max(0, Math.trunc(numberValue(item.staged_count))),
    unmergedCount: Math.max(0, Math.trunc(numberValue(item.unmerged_count))),
    stateToken: requiredString(item.state_token, "merge state token"),
    policyToken: requiredString(item.policy_token, "merge policy token"),
    policyVersion: Math.max(1, Math.trunc(numberValue(item.policy_version))),
  }
}

function semanticMergeWorkspace(value: unknown): GraftSemanticMergeWorkspace {
  const workspace = record(value)
  const inputs = Array.isArray(workspace.inputs)
    ? workspace.inputs.map((input): GraftSemanticMergeInput => {
        const item = record(input)
        if (
          item.version !== "base" &&
          item.version !== "ours" &&
          item.version !== "theirs"
        ) {
          throw new Error("Graft returned an invalid semantic merge input")
        }
        return {
          version: item.version,
          revision: stringValue(item.revision) ?? null,
          file_path: stringValue(item.file_path) ?? null,
          size:
            typeof item.size === "number" && Number.isFinite(item.size)
              ? item.size
              : null,
        }
      })
    : []
  if (inputs.length !== 3) {
    throw new Error("Graft returned an incomplete semantic merge workspace")
  }
  const providerRecord = record(workspace.record)
  if (
    providerRecord.state !== "pending" &&
    providerRecord.state !== "conflict" &&
    providerRecord.state !== "merged"
  ) {
    throw new Error("Graft returned an invalid semantic merge provider record")
  }
  return {
    provider_token: requiredString(workspace.provider_token, "provider token"),
    provider: requiredString(workspace.provider, "provider"),
    path: requiredString(workspace.path, "provider path"),
    workspace_path: requiredString(
      workspace.workspace_path,
      "provider workspace"
    ),
    result_path: requiredString(workspace.result_path, "provider result"),
    managed_tables: stringArray(workspace.managed_tables),
    seed_applied_sql: workspace.seed_applied_sql === true,
    managed_conflicts: Math.max(
      0,
      Math.trunc(numberValue(workspace.managed_conflicts))
    ),
    prepared_at_unix_ms: Math.max(
      0,
      Math.trunc(numberValue(workspace.prepared_at_unix_ms))
    ),
    state_token: requiredString(workspace.state_token, "provider state token"),
    policy_token: requiredString(
      workspace.policy_token,
      "provider policy token"
    ),
    policy_version: Math.max(
      0,
      Math.trunc(numberValue(workspace.policy_version))
    ),
    orig_head: requiredString(workspace.orig_head, "provider Local head"),
    merge_head: requiredString(workspace.merge_head, "provider Hosted head"),
    merge_base: stringValue(workspace.merge_base) ?? null,
    inputs,
    record: providerRecord as GraftSemanticMergeWorkspace["record"],
  }
}

function mergePlan(value: unknown): EidosSyncMergePlan {
  const item = record(value)
  if (
    item.kind !== "up_to_date" &&
    item.kind !== "fast_forward" &&
    item.kind !== "three_way"
  ) {
    throw new Error("Graft returned an invalid merge plan")
  }
  return {
    kind: item.kind,
    expectedHead: stringValue(item.expected_head) ?? null,
    hostedHead: requiredString(item.target, "merge target"),
    commonAncestor: stringValue(item.merge_base) ?? null,
    stagedPaths: stringArray(item.staged_paths),
    conflictedPaths: stringArray(item.conflicted_paths),
    planToken: requiredString(item.plan_token, "merge plan token"),
    policyToken: requiredString(item.policy_token, "merge policy token"),
    policyVersion: Math.max(1, Math.trunc(numberValue(item.policy_version))),
  }
}

function mergePolicyResult(value: unknown): GraftMergePolicyResult {
  const item = record(value)
  const policy = record(item.policy)
  if (policy.version !== 1) {
    throw new Error("Graft returned an unsupported merge policy version")
  }
  return {
    policy: policy as unknown as GraftMergePolicy,
    policy_token: requiredString(item.policy_token, "merge policy token"),
    active_merge: item.active_merge === true,
  }
}

function mergePolicyValidationResult(
  value: unknown
): GraftMergePolicyValidationResult {
  const item = record(value)
  const policy = record(item.policy)
  const errors = Array.isArray(item.errors)
    ? item.errors.map((entry) => {
        const issue = record(entry)
        return {
          key: requiredString(issue.key, "merge policy issue key"),
          value: stringValue(issue.value) ?? "",
          message: requiredString(issue.message, "merge policy issue message"),
        }
      })
    : []
  return {
    valid: item.valid === true,
    policy:
      policy.version === 1 ? (policy as unknown as GraftMergePolicy) : null,
    policy_token: stringValue(item.policy_token) ?? null,
    errors,
  }
}

function mergePathPage(value: unknown): EidosSyncMergePathPage {
  const page = record(value)
  const stateToken = requiredString(page.state_token, "merge state token")
  const items = Array.isArray(page.items)
    ? page.items.map((entry): EidosSyncMergePath => {
        const item = record(entry)
        const kind = item.kind
        const storage = item.storage
        if (
          kind !== "sqlite_database" &&
          kind !== "text_file" &&
          kind !== "binary_file"
        ) {
          throw new Error("Graft returned an invalid merge path kind")
        }
        if (
          storage !== "sqlite_snapshot" &&
          storage !== "inline" &&
          storage !== "external"
        ) {
          throw new Error("Graft returned an invalid merge path storage")
        }
        if (item.state !== "unmerged" && item.state !== "resolved") {
          throw new Error("Graft returned an invalid merge path state")
        }
        return {
          path: requiredString(item.path, "merge path"),
          state: item.state,
          kind,
          storage,
          hasBase: item.has_base === true,
          hasLocal: item.has_ours === true,
          hasHosted: item.has_theirs === true,
        }
      })
    : []
  return {
    stateToken,
    items,
    nextCursor: stringValue(page.next_cursor) ?? null,
  }
}

function mergeConflict(value: unknown): EidosSyncMergeConflict {
  const item = record(value)
  const pathKind = item.path_kind
  const storage = item.storage
  if (
    pathKind !== "sqlite_database" &&
    pathKind !== "text_file" &&
    pathKind !== "binary_file"
  ) {
    throw new Error("Graft returned an invalid merge conflict path kind")
  }
  if (
    storage !== "sqlite_snapshot" &&
    storage !== "inline" &&
    storage !== "external"
  ) {
    throw new Error("Graft returned an invalid merge conflict storage")
  }
  if (item.status !== "resolved" && item.status !== "unresolved") {
    throw new Error("Graft returned an invalid merge conflict status")
  }
  const columnChanges = Array.isArray(item.column_changes)
    ? item.column_changes.map((entry) => {
        const change = record(entry)
        return {
          side: requiredString(change.side, "schema conflict side"),
          operation: requiredString(
            change.operation,
            "schema conflict operation"
          ),
          ...(stringValue(change.from)
            ? { from: stringValue(change.from) }
            : {}),
          ...(stringValue(change.to) ? { to: stringValue(change.to) } : {}),
        }
      })
    : undefined
  const cells = Array.isArray(item.cells)
    ? item.cells.map((entry): EidosSyncMergeCellConflict => {
        const cell = record(entry)
        const resolution =
          cell.resolution === "ours" || cell.resolution === "theirs"
            ? cell.resolution
            : undefined
        return {
          column: requiredString(cell.column, "merge cell column"),
          base: cell.base,
          local: cell.ours,
          hosted: cell.theirs,
          ...(resolution ? { resolution } : {}),
        }
      })
    : undefined
  return {
    id: requiredString(item.id, "merge conflict id"),
    path: requiredString(item.path, "merge conflict path"),
    pathKind,
    storage,
    kind: requiredString(item.kind, "merge conflict kind"),
    reason: requiredString(item.reason, "merge conflict reason"),
    status: item.status,
    ...(item.resolution === "ours" ||
    item.resolution === "theirs" ||
    item.resolution === "manual" ||
    item.resolution === "edited" ||
    item.resolution === "cells"
      ? { resolution: item.resolution }
      : {}),
    ...(typeof item.auto_resolvable === "boolean"
      ? { autoResolvable: item.auto_resolvable }
      : {}),
    ...(item.recommended_result === "ours" ||
    item.recommended_result === "theirs" ||
    item.recommended_result === "merged"
      ? { recommendedResult: item.recommended_result }
      : {}),
    ...(stringValue(item.recommended_action)
      ? { recommendedAction: stringValue(item.recommended_action) }
      : {}),
    ...(stringValue(item.table) ? { table: stringValue(item.table) } : {}),
    ...(Array.isArray(item.columns)
      ? { columns: stringArray(item.columns) }
      : {}),
    ...(typeof item.rowid === "number" ? { rowid: item.rowid } : {}),
    ...(Object.keys(record(item.key)).length ? { key: record(item.key) } : {}),
    ...(typeof item.ours_rowid === "number"
      ? { oursRowid: item.ours_rowid }
      : {}),
    ...(typeof item.theirs_rowid === "number"
      ? { theirsRowid: item.theirs_rowid }
      : {}),
    ...(Object.keys(record(item.ours_key)).length
      ? { oursKey: record(item.ours_key) }
      : {}),
    ...(Object.keys(record(item.theirs_key)).length
      ? { theirsKey: record(item.theirs_key) }
      : {}),
    ...(Array.isArray(item.semantic_key)
      ? { semanticKey: stringArray(item.semantic_key) }
      : {}),
    ...(Array.isArray(item.semantic_key_collations)
      ? {
          semanticKeyCollations: item.semantic_key_collations.filter(
            (entry): entry is "binary" | "nocase" =>
              entry === "binary" || entry === "nocase"
          ),
        }
      : {}),
    ...(cells ? { cells } : {}),
    ...(stringValue(item.name) ? { name: stringValue(item.name) } : {}),
    ...(stringValue(item.entry_type)
      ? { entryType: stringValue(item.entry_type) }
      : {}),
    ...(columnChanges ? { columnChanges } : {}),
    ...(stringValue(item.change) ? { change: stringValue(item.change) } : {}),
    ...(stringValue(item.owner) ? { owner: stringValue(item.owner) } : {}),
    ...(stringValue(item.ours_op)
      ? { oursOperation: stringValue(item.ours_op) }
      : {}),
    ...(stringValue(item.theirs_op)
      ? { theirsOperation: stringValue(item.theirs_op) }
      : {}),
    ...(Array.isArray(item.base_row) ? { baseRow: item.base_row } : {}),
    ...(Array.isArray(item.ours_row) ? { oursRow: item.ours_row } : {}),
    ...(Array.isArray(item.theirs_row) ? { theirsRow: item.theirs_row } : {}),
    ...(stringValue(item.message)
      ? { message: stringValue(item.message) }
      : {}),
  }
}

function mergeConflictPage(value: unknown): EidosSyncMergeConflictPage {
  const page = record(value)
  return {
    stateToken: requiredString(page.state_token, "merge state token"),
    path: requiredString(page.path, "merge conflict path"),
    items: Array.isArray(page.items) ? page.items.map(mergeConflict) : [],
    nextCursor: stringValue(page.next_cursor) ?? null,
  }
}

function mergeContent(value: unknown): EidosSyncMergeContent {
  const item = record(value)
  const content = record(item.content)
  if (
    item.version !== "base" &&
    item.version !== "ours" &&
    item.version !== "theirs" &&
    item.version !== "result"
  ) {
    throw new Error("Graft returned an invalid merge content version")
  }
  if (
    content.state !== "absent" &&
    content.state !== "utf8" &&
    content.state !== "too_large" &&
    content.state !== "missing_payload" &&
    content.state !== "invalid_utf8"
  ) {
    throw new Error("Graft returned invalid merge content")
  }
  const kind = item.kind
  const storage = item.storage
  let projectedContent: EidosSyncMergeContent["content"]
  if (content.state === "absent") {
    projectedContent = { state: "absent" }
  } else if (content.state === "utf8") {
    if (typeof content.content !== "string") {
      throw new Error("Graft returned invalid merge text content")
    }
    projectedContent = {
      state: "utf8",
      content: content.content,
      size: Math.max(0, Math.trunc(numberValue(content.size))),
    }
  } else if (content.state === "too_large") {
    projectedContent = {
      state: "too_large",
      size: Math.max(0, Math.trunc(numberValue(content.size))),
    }
  } else if (content.state === "missing_payload") {
    projectedContent = {
      state: "missing_payload",
      size: Math.max(0, Math.trunc(numberValue(content.size))),
    }
  } else {
    projectedContent = {
      state: "invalid_utf8",
      size: Math.max(0, Math.trunc(numberValue(content.size))),
    }
  }
  return {
    version: item.version,
    revision: stringValue(item.revision) ?? null,
    path: requiredString(item.path, "merge content path"),
    kind:
      kind === "sqlite_database" ||
      kind === "text_file" ||
      kind === "binary_file"
        ? kind
        : null,
    storage:
      storage === "sqlite_snapshot" ||
      storage === "inline" ||
      storage === "external"
        ? storage
        : null,
    content: projectedContent,
    stateToken: requiredString(item.state_token, "merge state token"),
  }
}

function mergeSqliteVersion(value: unknown): EidosSyncMergeSqliteVersion {
  if (value === "base" || value === "ours" || value === "theirs") {
    return value
  }
  throw new Error("Graft returned an invalid merge SQLite version")
}

function mergeSqliteDiff(value: unknown): EidosSyncMergeSqliteDiff {
  const item = record(value)
  const from = record(item.from)
  const to = record(item.to)
  return {
    stateToken: requiredString(item.state_token, "merge state token"),
    path: requiredString(item.path, "merge SQLite path"),
    from: {
      version: mergeSqliteVersion(from.version),
      revision: requiredString(from.revision, "merge SQLite from revision"),
    },
    to: {
      version: mergeSqliteVersion(to.version),
      revision: requiredString(to.revision, "merge SQLite to revision"),
    },
    diff: boundedVersionDiff(item.diff),
  }
}

function pathChange(value: unknown): SpaceVersionPathChange {
  const item = record(value)
  return {
    path: stringValue(item.path) ?? "",
    ...(stringValue(item.previous_path)
      ? { previousPath: stringValue(item.previous_path) }
      : {}),
    change: stringValue(item.change) ?? "modified",
    ...(stringValue(item.kind) ? { kind: stringValue(item.kind) } : {}),
    ...(stringValue(item.storage)
      ? { storage: stringValue(item.storage) }
      : {}),
  }
}

function rowChange(value: unknown): SpaceVersionRowChange {
  const item = record(value)
  const explicitKey = record(item.key)
  const key =
    Object.keys(explicitKey).length > 0
      ? explicitKey
      : typeof item.rowid === "number" && Number.isFinite(item.rowid)
        ? { rowid: item.rowid }
        : {}
  return {
    op: stringValue(item.op) ?? "change",
    key,
    ...(Array.isArray(item.values) ? { values: item.values } : {}),
    ...(Array.isArray(item.old_values) ? { oldValues: item.old_values } : {}),
  }
}

function limitation(value: unknown): string | null {
  if (typeof value === "string") return value
  const item = record(value)
  const kind = stringValue(item.kind)
  if (!kind) return null
  const subject = stringValue(item.subject)
  return subject
    ? `${kind.replaceAll("_", " ")} · ${subject}`
    : kind.replaceAll("_", " ")
}

function schemaChange(value: unknown): SpaceVersionSchemaChange {
  const change = record(value)
  const operation = change.op
  if (
    operation !== "added" &&
    operation !== "deleted" &&
    operation !== "modified"
  ) {
    throw new Error("Graft returned an invalid SQLite schema operation")
  }
  return {
    name: requiredString(change.name, "SQLite schema object name"),
    entryType: requiredString(change.entry_type, "SQLite schema object type"),
    operation,
    sql: requiredString(change.sql, "SQLite schema SQL"),
    ...(stringValue(change.old_sql)
      ? { oldSql: stringValue(change.old_sql) }
      : {}),
  }
}

function boundedFileDiff(value: unknown): SpaceVersionFileDiff {
  const item = record(value)
  const mode = stringValue(item.mode)
  const summaries = Array.isArray(item.summaries)
    ? item.summaries.map(tableSummary)
    : []
  const tables =
    mode === "summary"
      ? summaries.map(
          (summary): SpaceVersionTableDiff => ({
            name: summary.name,
            columns: [],
            primaryKeyColumns: [],
            changes: [],
            summary,
            rowChangesLoaded: false,
          })
        )
      : Array.isArray(item.tables)
        ? item.tables.map((table) => ({
            ...tableDiff(table),
            hasMore: item.has_more === true,
            nextCursor: stringValue(item.next_cursor) ?? null,
          }))
        : []
  return {
    ...pathChange(value),
    rowDiffAvailable: item.row_diff_available === true,
    ...(stringValue(item.logical_status)
      ? { logicalStatus: stringValue(item.logical_status) }
      : {}),
    limitations: Array.isArray(item.limitations)
      ? item.limitations
          .map(limitation)
          .filter((entry): entry is string => entry !== null)
      : [],
    schemaChanges: Array.isArray(item.schema_changes)
      ? item.schema_changes.map(schemaChange)
      : [],
    tables,
    detailsLoaded: true,
  }
}

function boundedVersionDiff(value: unknown): SpaceVersionDiff {
  const item = record(value)
  return {
    currentHead: stringValue(item.current_head) ?? null,
    currentBranch: stringValue(item.current_branch) ?? null,
    from: checkpointValue(item.from),
    to: checkpointValue(item.to),
    paths: Array.isArray(item.paths) ? item.paths.map(pathChange) : [],
    files: Array.isArray(item.files) ? item.files.map(boundedFileDiff) : [],
    hasMore: false,
    nextCursor: null,
  }
}

function boundedSqliteDiffPage(value: unknown): SpaceVersionDiff {
  const item = record(value)
  const diffs = Array.isArray(item.paths)
    ? item.paths.map((entry) => boundedVersionDiff(record(entry).diff))
    : []
  const paths = new Map<string, SpaceVersionPathChange>()
  const files = new Map<string, SpaceVersionFileDiff>()
  for (const diff of diffs) {
    for (const change of diff.paths) paths.set(change.path, change)
    for (const file of diff.files) files.set(file.path, file)
  }
  return {
    currentHead: diffs[0]?.currentHead ?? null,
    currentBranch: diffs[0]?.currentBranch ?? null,
    from: diffs[0]?.from ?? null,
    to: diffs[0]?.to ?? null,
    paths: [...paths.values()].sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
    files: [...files.values()].sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
    hasMore: item.has_more === true,
    nextCursor: stringValue(item.next_cursor) ?? null,
  }
}

function tableDiff(value: unknown): SpaceVersionTableDiff {
  const item = record(value)
  return {
    name: stringValue(item.name) ?? "Unknown table",
    columns: stringArray(item.columns),
    primaryKeyColumns: stringArray(item.primary_key_columns),
    changes: Array.isArray(item.changes) ? item.changes.map(rowChange) : [],
    rowChangesLoaded: true,
  }
}

function fileDiff(value: unknown): SpaceVersionFileDiff {
  const item = record(value)
  return {
    ...pathChange(value),
    rowDiffAvailable: item.row_diff_available === true,
    ...(stringValue(item.logical_status)
      ? { logicalStatus: stringValue(item.logical_status) }
      : {}),
    limitations: stringArray(item.limitations),
    schemaChanges: [],
    tables: Array.isArray(item.tables) ? item.tables.map(tableDiff) : [],
    detailsLoaded: true,
  }
}

function versionDiff(value: unknown): SpaceVersionDiff {
  const item = record(value)
  return {
    currentHead: stringValue(item.current_head) ?? null,
    currentBranch: stringValue(item.current_branch) ?? null,
    from: checkpointValue(item.from),
    to: checkpointValue(item.to),
    paths: Array.isArray(item.paths) ? item.paths.map(pathChange) : [],
    files: Array.isArray(item.files) ? item.files.map(fileDiff) : [],
    ...(typeof item.total_paths === "number"
      ? { totalPaths: Math.max(0, Math.trunc(item.total_paths)) }
      : {}),
    hasMore: item.has_more === true,
    nextCursor: stringValue(item.next_cursor) ?? null,
  }
}

function tableSummary(value: unknown): SpaceVersionTableSummary {
  const item = record(value)
  return {
    name: stringValue(item.name) ?? "Unknown table",
    inserts: numberValue(item.inserts),
    deletes: numberValue(item.deletes),
    updates: numberValue(item.updates),
  }
}

function commit(value: unknown): SpaceVersionCommit {
  const item = record(value)
  const parents = stringArray(item.parents)
  const parent = stringValue(item.parent) ?? parents[0] ?? null
  const changes = Array.isArray(item.changes)
    ? item.changes.map(pathChange)
    : []
  const pathCounts = record(item.path_changes)
  const fileCountKnown =
    item.path_counts_complete === true || changes.length > 0
  const summarizedFiles =
    numberValue(pathCounts.added) +
    numberValue(pathCounts.modified) +
    numberValue(pathCounts.deleted)
  return {
    id: stringValue(item.id) ?? "",
    parent,
    parents: parents.length ? parents : parent ? [parent] : [],
    message: stringValue(item.message) ?? "Checkpoint",
    timestampMs: numberValue(item.timestamp_ms),
    files: changes.length || summarizedFiles,
    fileCountKnown,
    changes,
    tables: Array.isArray(item.tables) ? item.tables.map(tableSummary) : [],
    changedTables: numberValue(item.changed_tables),
  }
}

function versionHistory(value: unknown): SpaceVersionHistory {
  const item = record(value)
  return {
    currentHead: stringValue(item.current_head) ?? null,
    currentBranch: stringValue(item.current_branch) ?? null,
    commits: Array.isArray(item.commits) ? item.commits.map(commit) : [],
    hasMore: item.has_more === true,
    nextCursor: stringValue(item.next_cursor) ?? null,
  }
}

function mergeVersionDiffs(
  values: readonly unknown[],
  metadata: Partial<SpaceVersionDiff> = {}
): SpaceVersionDiff {
  const diffs = values.map(versionDiff)
  const paths = new Map<string, SpaceVersionPathChange>()
  const files = new Map<string, SpaceVersionFileDiff>()
  for (const diff of diffs) {
    for (const change of diff.paths) paths.set(change.path, change)
    for (const file of diff.files) files.set(file.path, file)
  }
  const first = diffs[0]
  return {
    currentHead: metadata.currentHead ?? first?.currentHead ?? null,
    currentBranch: metadata.currentBranch ?? first?.currentBranch ?? null,
    from: metadata.from ?? first?.from ?? null,
    to: metadata.to ?? first?.to ?? null,
    paths: [...paths.values()].sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
    files: [...files.values()].sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
    ...(metadata.totalPaths === undefined
      ? {}
      : { totalPaths: metadata.totalPaths }),
    hasMore: metadata.hasMore ?? false,
    nextCursor: metadata.nextCursor ?? null,
  }
}

export class GraftClient {
  private verifiedVersion: Promise<string> | null = null
  private openedRoot: string | null = null
  private exactMergeWorktreePaths = false
  readonly backend = "sdk" as const
  readonly syncRemoteOrigin: string
  private readonly sdkTransport: GraftSdkTransport

  constructor(options: GraftClientOptions) {
    this.sdkTransport = options.sdkTransport
    this.syncRemoteOrigin =
      options.syncRemoteOrigin ??
      resolveEidosLiteServiceEnvironment().syncRemoteOrigin
  }

  expectedVersion(): string {
    return process.env.EIDOS_LITE_GRAFT_SDK_PATH?.trim()
      ? GRAFT_LOCAL_MERGE_SDK_VERSION
      : GRAFT_SDK_VERSION
  }

  hasOpenSession(): boolean {
    return this.openedRoot !== null
  }

  hasExactMergeWorktreePaths(): boolean {
    return this.exactMergeWorktreePaths
  }

  async open(root: string): Promise<void> {
    const canonicalRoot = await this.canonicalRepositoryRoot(root)
    await this.requireSdkTransport().open(canonicalRoot)
    this.openedRoot = canonicalRoot
    await this.version()
  }

  async close(): Promise<void> {
    this.openedRoot = null
    this.verifiedVersion = null
    this.exactMergeWorktreePaths = false
    await this.requireSdkTransport().close()
  }

  async reopen(): Promise<void> {
    if (!this.openedRoot) throw new Error("Graft repository session is closed")
    await this.requireSdkTransport().reopen()
  }

  async version(): Promise<string> {
    if (!this.verifiedVersion) {
      this.verifiedVersion = this.requireSdkTransport()
        .command("sdkVersion")
        .then((value) => {
          if (typeof value !== "string") {
            throw new Error("Graft SDK returned an invalid version")
          }
          return value
        })
        .then((version) => {
          if (version !== this.expectedVersion()) {
            throw new Error(
              `Graft ${this.expectedVersion()} is required; found ${version}`
            )
          }
          return version
        })
        .catch((error) => {
          this.verifiedVersion = null
          throw error
        })
    }
    return this.verifiedVersion
  }

  async inspectSpace(
    root: string,
    options: GraftStatusOptions = {}
  ): Promise<GraftSpaceStatus> {
    let version: string
    try {
      await this.open(root)
      version = await this.version()
    } catch (error) {
      return {
        available: false,
        backend: this.backend,
        expectedVersion: this.expectedVersion(),
        initialized: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    const initialized = await fs
      .stat(path.join(root, ".graft"))
      .then((stats) => stats.isDirectory())
      .catch(() => false)
    if (!initialized) {
      return {
        available: true,
        backend: this.backend,
        version,
        expectedVersion: this.expectedVersion(),
        initialized: false,
      }
    }
    try {
      const status = await this.status(root, options)
      const changedPaths = status.dirty ? status.changedPaths : 0
      return {
        available: true,
        backend: this.backend,
        version,
        expectedVersion: this.expectedVersion(),
        initialized: true,
        clean: !status.dirty,
        ...(changedPaths === undefined ? {} : { changedPaths }),
        ...(status.currentHead ? { currentHead: status.currentHead } : {}),
        ...(status.sync ? { sync: status.sync } : {}),
        ...(status.generation === undefined
          ? {}
          : { generation: status.generation }),
        ...(status.changeToken ? { changeToken: status.changeToken } : {}),
        ...(status.statusCacheHit === undefined
          ? {}
          : { statusCacheHit: status.statusCacheHit }),
        ...(status.pathDiagnostics?.length
          ? { pathDiagnostics: status.pathDiagnostics }
          : {}),
      }
    } catch (error) {
      return {
        available: true,
        backend: this.backend,
        version,
        expectedVersion: this.expectedVersion(),
        initialized: true,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async initialize(root: string): Promise<void> {
    const initialized = await fs
      .stat(path.join(root, ".graft"))
      .then((stats) => stats.isDirectory())
      .catch(() => false)
    if (!initialized) {
      await this.runSdk(root, "init")
    }
  }

  async stageAll(
    root: string,
    options: GraftStatusOptions = {}
  ): Promise<unknown> {
    const status = await this.status(root, options)
    if (status.paths.length === 0) return { paths: [] }
    if (status.verifiedPaths?.length) {
      await this.clearStaleWorktreeMarkers(root, status.verifiedPaths)
    }
    const results: unknown[] = []
    for (
      let index = 0;
      index < status.paths.length;
      index += SDK_PATH_BATCH_SIZE
    ) {
      const paths = status.paths.slice(index, index + SDK_PATH_BATCH_SIZE)
      results.push(
        await this.runSdk(
          root,
          "stagePaths",
          [
            {
              paths,
              ...(status.currentHead
                ? { expectedHead: status.currentHead }
                : {}),
            },
          ],
          options
        )
      )
    }
    return { batches: results }
  }

  async recordPathMove(
    root: string,
    previousPath: string,
    path: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<unknown> {
    return this.runSdk(
      root,
      "recordPathMove",
      [{ previousPath, path }],
      options
    )
  }

  async commit(root: string, message: string): Promise<GraftCommitResult> {
    const value = record(await this.runSdk(root, "commit", [message]))
    const id = stringValue(record(value.commit).id) ?? stringValue(value.id)
    if (!id || !/^[0-9a-f]{64}$/i.test(id)) {
      throw new Error("Graft did not return the saved checkpoint id")
    }
    return { id }
  }

  async status(
    root: string,
    options: GraftStatusOptions = {}
  ): Promise<GraftRepositoryStatus> {
    const response = record(
      await this.statusIncremental(root, { signal: options.signal })
    )
    const value = record(response.status)
    const upstream = record(value.upstream_status ?? value.upstream)
    const head = record(value.head)
    const changedEntries = Array.isArray(value.paths)
      ? value.paths.map(record)
      : []
    const changes = changedEntries
      .map((entry): SpaceVersionPathChange | null => {
        const relativePath = stringValue(entry.path)
        if (!relativePath) return null
        return {
          path: relativePath,
          ...(stringValue(entry.previous_path)
            ? { previousPath: stringValue(entry.previous_path) }
            : {}),
          change:
            stringValue(entry.change) ??
            stringValue(entry.staged_change) ??
            stringValue(entry.unstaged_change) ??
            stringValue(entry.worktree_status) ??
            stringValue(entry.index_status) ??
            "modified",
          ...(stringValue(entry.kind) ? { kind: stringValue(entry.kind) } : {}),
          ...(stringValue(entry.storage)
            ? { storage: stringValue(entry.storage) }
            : {}),
        }
      })
      .filter((entry): entry is SpaceVersionPathChange => entry !== null)
    const changed = changes.map((entry) => entry.path)
    const pathDiagnostics = Array.isArray(value.path_diagnostics)
      ? value.path_diagnostics
          .map((entry): GraftRepositoryPathDiagnostic | null => {
            const diagnostic = record(entry)
            const status = diagnostic.status
            const diagnosticPath = stringValue(diagnostic.path)
            if (
              !diagnosticPath ||
              (status !== "skipped" &&
                status !== "corrupt" &&
                status !== "analysis_failed")
            ) {
              return null
            }
            return {
              path: diagnosticPath,
              status,
              operation: stringValue(diagnostic.operation) ?? "status",
              protectedByIndex: diagnostic.protected_by_index === true,
              message:
                stringValue(diagnostic.message) ??
                "Graft could not analyze this path safely.",
            }
          })
          .filter(
            (entry): entry is GraftRepositoryPathDiagnostic => entry !== null
          )
      : []
    const telemetry = record(response.telemetry)
    const ahead = Math.max(
      0,
      Math.trunc(numberValue(value.ahead ?? upstream.ahead))
    )
    const behind = Math.max(
      0,
      Math.trunc(numberValue(value.behind ?? upstream.behind))
    )
    const remoteHead = stringValue(upstream.remote_target)
    const localHead = stringValue(upstream.local)
    const commonAncestor = stringValue(upstream.common_ancestor)
    const hasUpstreamStatus = Object.keys(upstream).length > 0
    const status: GraftRepositoryStatus = {
      dirty: value.dirty === true || changes.length > 0,
      currentHead:
        stringValue(value.current_head) ??
        stringValue(value.head_target) ??
        null,
      currentBranch:
        stringValue(value.current_branch) ?? stringValue(head.name) ?? null,
      ahead,
      behind,
      hasConflicts:
        value.has_conflicts === true || numberValue(value.conflicted) > 0,
      changedPaths: changed.length,
      paths: changed,
      changes,
      ...(pathDiagnostics.length > 0 ? { pathDiagnostics } : {}),
      ...(hasUpstreamStatus
        ? {
            sync: {
              state: classifySyncHistory({
                state: upstream.state,
                localHead,
                remoteHead,
                commonAncestor,
                ahead,
                behind,
              }),
              ...(localHead ? { localHead } : {}),
              ...(remoteHead ? { remoteHead } : {}),
              ...(commonAncestor ? { commonAncestor } : {}),
              ahead,
              behind,
            },
          }
        : {}),
      ...(typeof response.generation === "number"
        ? { generation: response.generation }
        : {}),
      ...(stringValue(response.change_token)
        ? { changeToken: stringValue(response.change_token) }
        : {}),
      ...(typeof telemetry.status_cache_hit === "boolean"
        ? { statusCacheHit: telemetry.status_cache_hit }
        : {}),
      ...(typeof telemetry.persistent_snapshot_hit === "boolean"
        ? { persistentSnapshotHit: telemetry.persistent_snapshot_hit }
        : {}),
      ...(typeof telemetry.persistent_snapshot_saved === "boolean"
        ? { persistentSnapshotSaved: telemetry.persistent_snapshot_saved }
        : {}),
      ...(typeof telemetry.stability_retries === "number"
        ? {
            stabilityRetries: Math.max(
              0,
              Math.trunc(telemetry.stability_retries)
            ),
          }
        : {}),
    }
    if (status.dirty || !options.verifyPaths?.length) return status

    // Graft 0.3.0 can retain a stale clean SQLite snapshot after a restore is
    // staged and committed. A targeted diff remains authoritative, so verify
    // the Eidos Files already known to the caller before reporting clean.
    const markedPaths = await this.markedWorktreePaths(
      root,
      options.verifyPaths
    )
    if (markedPaths.length === 0) return status
    const verification = await this.diffAllExplicitPaths(root, markedPaths, {
      rows: false,
      ...(status.currentHead ? { from: status.currentHead } : {}),
      signal: options.signal,
    })
    const verifiedChanges = verification.paths.filter((change) => change.path)
    if (verifiedChanges.length === 0) return status
    const mergedChanges = [...status.changes, ...verifiedChanges].filter(
      (change, index, entries) =>
        entries.findIndex((candidate) => candidate.path === change.path) ===
        index
    )
    const paths = mergedChanges.map((change) => change.path).sort()
    return {
      ...status,
      dirty: true,
      changedPaths: paths.length,
      paths,
      changes: mergedChanges,
      verifiedPaths: verifiedChanges.map((change) => change.path),
    }
  }

  async workingDiff(
    root: string,
    rows = true,
    options: {
      limit?: number
      after?: string
      signal?: AbortSignal
      verifyPaths?: readonly string[]
    } = {}
  ): Promise<SpaceVersionDiff> {
    const status = await this.status(root, options)
    return this.diffExplicitPaths(root, status.paths, {
      rows,
      limit: options.limit,
      after: options.after,
      signal: options.signal,
      currentHead: status.currentHead,
      currentBranch: status.currentBranch,
      totalPaths: status.changedPaths,
    })
  }

  async workingChanges(
    root: string,
    options: {
      limit?: number
      after?: string
      signal?: AbortSignal
      verifyPaths?: readonly string[]
    } = {}
  ): Promise<SpaceVersionDiff> {
    const status = await this.status(root, options)
    const sorted = [...status.changes].sort((left, right) =>
      left.path.localeCompare(right.path)
    )
    const remaining = options.after
      ? sorted.filter((change) => change.path > options.after!)
      : sorted
    const limit = this.safePageSize(options.limit)
    const paths = remaining.slice(0, limit)
    return {
      currentHead: status.currentHead,
      currentBranch: status.currentBranch,
      ...(status.changeToken ? { changeToken: status.changeToken } : {}),
      from: status.currentHead,
      to: null,
      paths,
      files: [],
      totalPaths: status.changedPaths,
      hasMore: remaining.length > paths.length,
      nextCursor:
        remaining.length > paths.length ? (paths.at(-1)?.path ?? null) : null,
    }
  }

  async revisionChanges(
    root: string,
    commitId: string,
    parentId?: string | null,
    options: { limit?: number; after?: string; signal?: AbortSignal } = {}
  ): Promise<SpaceVersionDiff> {
    const page = record(
      await this.runSdk(
        root,
        "commitChangedPaths",
        [
          {
            revision: commitId,
            limit: this.safePageSize(options.limit),
            ...(options.after ? { after: options.after } : {}),
          },
        ],
        options
      )
    )
    const resolvedParent = stringValue(page.parent) ?? parentId ?? null
    return {
      currentHead: commitId,
      currentBranch: null,
      from: resolvedParent,
      to: commitId,
      paths: Array.isArray(page.paths) ? page.paths.map(pathChange) : [],
      files: [],
      totalPaths: Math.max(
        0,
        Math.trunc(numberValue(page.total_changed_paths))
      ),
      hasMore: page.has_more === true,
      nextCursor: stringValue(page.next_cursor) ?? null,
    }
  }

  async pathDiff(
    root: string,
    relativePath: string,
    options: {
      rows?: boolean
      table?: string
      from?: string | null
      to?: string | null
      root?: string | null
      signal?: AbortSignal
    } = {}
  ): Promise<SpaceVersionDiff> {
    return this.diffExplicitPaths(root, [relativePath], {
      rows: options.rows ?? true,
      signal: options.signal,
      ...(options.table ? { table: options.table } : {}),
      ...(options.from ? { from: options.from } : {}),
      ...(options.to ? { to: options.to } : {}),
      ...(options.root ? { root: options.root } : {}),
    })
  }

  async sqlitePathDiff(
    root: string,
    relativePath: string,
    options: {
      table?: string
      rowAfter?: string
      rowLimit?: number
      stagedFallback?: boolean
      from?: string | null
      to?: string | null
      root?: string | null
      signal?: AbortSignal
    } = {}
  ): Promise<SpaceVersionDiff> {
    const value = await this.runSdk(
      root,
      "diffSqlitePaths",
      [
        {
          paths: [relativePath],
          mode: options.table ? "rows" : "summary",
          ...(options.stagedFallback ? { stagedFallback: true } : {}),
          limit: 1,
          ...(options.table
            ? {
                table: options.table,
                rowLimit: Math.max(
                  1,
                  Math.min(Math.trunc(options.rowLimit ?? 100), 1_000)
                ),
                ...(options.rowAfter ? { rowAfter: options.rowAfter } : {}),
              }
            : {}),
          ...(options.from ? { from: options.from } : {}),
          ...(options.to ? { to: options.to } : {}),
          ...(options.root ? { root: options.root } : {}),
        },
      ],
      options
    )
    return boundedSqliteDiffPage(value)
  }

  async revisionDiff(
    root: string,
    commitId: string,
    parentId?: string | null,
    options: { limit?: number; after?: string; signal?: AbortSignal } = {}
  ): Promise<SpaceVersionDiff> {
    const page = record(
      await this.runSdk(
        root,
        "commitChangedPaths",
        [
          {
            revision: commitId,
            limit: this.safePageSize(options.limit),
            ...(options.after ? { after: options.after } : {}),
          },
        ],
        options
      )
    )
    const resolvedParent = stringValue(page.parent) ?? parentId ?? null
    const paths = Array.isArray(page.paths)
      ? page.paths
          .map(record)
          .map((entry) => stringValue(entry.path))
          .filter(isString)
      : []
    return this.diffExplicitPaths(root, paths, {
      rows: true,
      signal: options.signal,
      ...(resolvedParent
        ? { from: resolvedParent, to: commitId }
        : { root: commitId }),
      hasMore: page.has_more === true,
      nextCursor: stringValue(page.next_cursor) ?? null,
      totalPaths: Math.max(
        0,
        Math.trunc(numberValue(page.total_changed_paths))
      ),
    })
  }

  async revisionTextDiff(
    root: string,
    commitId: string,
    parentId: string | null,
    relativePath: string,
    maxBytes: number,
    previousPath?: string
  ): Promise<SpaceVersionTextContentDiff> {
    await this.open(root)
    return this.requireSdkTransport().revisionTextDiff({
      commitId,
      parentId,
      path: relativePath,
      ...(previousPath ? { previousPath } : {}),
      maxBytes,
    })
  }

  async compareRevisions(
    root: string,
    from: string,
    to: string
  ): Promise<SpaceVersionDiff> {
    const paths = await this.changedPathsBetween(root, from, to)
    return this.diffAllExplicitPaths(root, paths, {
      rows: true,
      from,
      to,
    })
  }

  async materializationPathsBetweenRevisions(
    root: string,
    from: string,
    to: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<string[]> {
    return this.changedPathsBetween(root, from, to, options)
  }

  async history(
    root: string,
    limit = 50,
    options: { after?: string; signal?: AbortSignal } = {}
  ): Promise<SpaceVersionHistory> {
    const metadata = record(
      await this.runSdk(root, "repositoryMetadata", [], options)
    )
    const page = record(
      await this.runSdk(
        root,
        "historySummaries",
        [
          {
            limit,
            ...(options.after ? { after: options.after } : {}),
          },
        ],
        options
      )
    )
    const history = versionHistory({
      current_head: stringValue(metadata.current_head) ?? null,
      current_branch: stringValue(metadata.current_branch) ?? null,
      ...page,
    })
    const upstreamTarget = stringValue(metadata.upstream_target)
    if (
      options.after ||
      !upstreamTarget ||
      history.commits.some((item) => item.id === upstreamTarget)
    ) {
      return history
    }
    const upstreamCommit = commit(
      await this.runSdk(root, "commitDetails", [upstreamTarget], options)
    )
    if (upstreamCommit.id !== upstreamTarget) return history
    const insertionIndex = history.commits.findIndex(
      (item) => item.timestampMs < upstreamCommit.timestampMs
    )
    const commits = [...history.commits]
    commits.splice(
      insertionIndex < 0 ? commits.length : insertionIndex,
      0,
      upstreamCommit
    )
    return { ...history, commits }
  }

  async inspectIgnore(
    root: string,
    relativePath: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<GraftIgnoreInspection> {
    const value = record(
      await this.runSdk(root, "isIgnoredPath", [relativePath], options)
    )
    return {
      path: stringValue(value.path) ?? relativePath,
      isIgnored: value.is_ignored === true,
      isTracked: value.is_tracked === true,
      isDirectory: value.is_directory === true,
      hasTrackedDescendants: value.has_tracked_descendants === true,
    }
  }

  async inspectIgnores(
    root: string,
    relativePaths: readonly string[],
    options: { signal?: AbortSignal } = {}
  ): Promise<GraftIgnoreInspection[]> {
    const normalized = relativePaths.map((relativePath) =>
      relativePath.split("\\").join("/")
    )
    const inspections: GraftIgnoreInspection[] = []
    for (
      let index = 0;
      index < normalized.length;
      index += SDK_PATH_BATCH_SIZE
    ) {
      const requested = normalized.slice(index, index + SDK_PATH_BATCH_SIZE)
      const value = record(
        await this.runSdk(
          root,
          "isIgnoredPaths",
          [{ paths: requested }],
          options
        )
      )
      const returned = Array.isArray(value.paths) ? value.paths.map(record) : []
      if (returned.length !== requested.length) {
        throw new Error(
          `Graft returned ${returned.length} ignore results for ${requested.length} requested paths`
        )
      }
      for (const [resultIndex, item] of returned.entries()) {
        const relativePath = stringValue(item.path)
        if (relativePath !== requested[resultIndex]) {
          throw new Error("Graft returned ignore results out of request order")
        }
        inspections.push({
          path: relativePath,
          isIgnored: item.is_ignored === true,
          isTracked: item.is_tracked === true,
          isDirectory: item.is_directory === true,
          hasTrackedDescendants: item.has_tracked_descendants === true,
        })
      }
    }
    return inspections
  }

  async trackedIgnored(
    root: string,
    options: { limit?: number; after?: string; signal?: AbortSignal } = {}
  ): Promise<{
    paths: string[]
    total: number
    hasMore: boolean
    nextCursor: string | null
  }> {
    const value = record(
      await this.runSdk(
        root,
        "inventory",
        [
          {
            kind: "tracked_ignored",
            limit: Math.max(1, Math.min(options.limit ?? 100, 1_000)),
            ...(options.after ? { after: options.after } : {}),
          },
        ],
        options
      )
    )
    return {
      paths: Array.isArray(value.items)
        ? value.items
            .map(record)
            .map((item) => stringValue(item.path))
            .filter((item): item is string => Boolean(item))
        : [],
      total: Math.max(0, Math.trunc(numberValue(value.total_matching))),
      hasMore: value.has_more === true,
      nextCursor: stringValue(value.next_cursor) ?? null,
    }
  }

  async untrackPaths(
    root: string,
    paths: readonly string[],
    expectedHead: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<void> {
    for (let index = 0; index < paths.length; index += SDK_PATH_BATCH_SIZE) {
      await this.runSdk(
        root,
        "untrackPaths",
        [
          {
            paths: paths.slice(index, index + SDK_PATH_BATCH_SIZE),
            expectedHead,
          },
        ],
        options
      )
    }
  }

  async restorePaths(
    root: string,
    source: string,
    expectedHead: string,
    relativePaths: readonly string[],
    options: { signal?: AbortSignal; requireClean?: boolean } = {}
  ): Promise<void> {
    for (
      let index = 0;
      index < relativePaths.length;
      index += SDK_PATH_BATCH_SIZE
    ) {
      await this.runSdk(
        root,
        "restorePaths",
        [
          {
            source,
            expectedHead,
            paths: relativePaths.slice(index, index + SDK_PATH_BATCH_SIZE),
            ...(options.requireClean === undefined
              ? {}
              : { requireClean: options.requireClean }),
          },
        ],
        options
      )
    }
  }

  restorePath(
    root: string,
    source: string,
    expectedHead: string,
    relativePath: string
  ): Promise<unknown> {
    return this.restorePaths(root, source, expectedHead, [relativePath])
  }

  addRemote(root: string, name: string, url: string): Promise<unknown> {
    return this.runSdk(root, "configureRemote", [
      {
        name,
        url,
        upstreamBranch: "main",
      },
    ])
  }

  async remoteUrl(
    root: string,
    name = "origin",
    options: { signal?: AbortSignal } = {}
  ): Promise<string | null> {
    const value = record(await this.runSdk(root, "listRemotes", [], options))
    if (!Array.isArray(value.remotes)) {
      throw new Error("Graft returned an invalid remote list")
    }
    const remote = value.remotes
      .map(record)
      .find((entry) => entry.name === name)
    if (!remote) return null
    const url = stringValue(remote.url)
    if (!url) throw new Error("Graft returned an invalid Remote URL")
    return url
  }

  setMainUpstream(root: string, name = "origin"): Promise<unknown> {
    return this.remoteUrl(root, name).then((remoteUrl) => {
      if (!remoteUrl) throw new Error(`Graft Remote ${name} is not configured`)
      return { configured: true }
    })
  }

  push(
    root: string,
    token?: string,
    options: GraftRemoteOperationOptions = {}
  ): Promise<unknown> {
    return this.setHttpCredential(root, "origin", token, options).then(() =>
      this.runSdk(root, "push", [{ remote: "origin", branch: "main" }], options)
    )
  }

  fetch(
    root: string,
    options: GraftRemoteOperationOptions = {}
  ): Promise<unknown> {
    return this.runSdk(
      root,
      "fetch",
      [{ remote: "origin", branch: "main" }],
      options
    )
  }

  pull(
    root: string,
    options: GraftRemoteOperationOptions = {}
  ): Promise<unknown> {
    return this.runSdk(
      root,
      "pull",
      [{ remote: "origin", branch: "main" }],
      options
    )
  }

  async getMergePolicy(
    root: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<GraftMergePolicyResult> {
    return mergePolicyResult(
      await this.runSdk(root, "getMergePolicy", [], options)
    )
  }

  async validateMergePolicy(
    root: string,
    policy: GraftMergePolicy,
    options: { signal?: AbortSignal } = {}
  ): Promise<GraftMergePolicyValidationResult> {
    return mergePolicyValidationResult(
      await this.runSdk(root, "validateMergePolicy", [{ policy }], options)
    )
  }

  async setMergePolicy(
    root: string,
    policy: GraftMergePolicy,
    expectedPolicyToken: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<GraftMergePolicyResult> {
    return mergePolicyResult(
      await this.runSdk(
        root,
        "setMergePolicy",
        [{ policy, expectedPolicyToken }],
        options
      )
    )
  }

  async planMerge(
    root: string,
    revision: string,
    expectedHead: string | null,
    options: { signal?: AbortSignal } = {}
  ): Promise<EidosSyncMergePlan> {
    const value = await this.runSdk(
      root,
      "planMerge",
      [
        {
          revision,
          ...(expectedHead ? { expectedHead } : {}),
        },
      ],
      options
    )
    return mergePlan(value)
  }

  async applyMerge(
    root: string,
    revision: string,
    expectedHead: string | null,
    planToken: string,
    options: GraftMergeMutationOptions = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(
        root,
        "applyMerge",
        [
          {
            revision,
            ...(expectedHead ? { expectedHead } : {}),
            planToken,
          },
        ],
        options
      )
    )
    return this.finishMergeMutation(value, options)
  }

  async getMergeStatus(
    root: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<EidosSyncMergeStatus> {
    return mergeStatus(await this.runSdk(root, "getMergeStatus", [], options))
  }

  async getMergeStatusIfAvailable(
    root: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<EidosSyncMergeStatus> {
    try {
      return await this.getMergeStatus(root, options)
    } catch (error) {
      if (hasErrorCode(error, "EIDOS_LITE_GRAFT_MERGE_UNAVAILABLE")) {
        return { state: "none" }
      }
      throw error
    }
  }

  async listMergePaths(
    root: string,
    expectedStateToken: string,
    options: {
      filter?: "all" | "unmerged" | "resolved"
      limit?: number
      after?: string
      signal?: AbortSignal
    } = {}
  ): Promise<EidosSyncMergePathPage> {
    return mergePathPage(
      await this.runSdk(
        root,
        "listMergePaths",
        [
          {
            expectedStateToken,
            filter: options.filter ?? "all",
            limit: this.safePageSize(options.limit),
            ...(options.after ? { after: options.after } : {}),
          },
        ],
        options
      )
    )
  }

  async listMergeConflicts(
    root: string,
    relativePath: string,
    expectedStateToken: string,
    options: { limit?: number; after?: string; signal?: AbortSignal } = {}
  ): Promise<EidosSyncMergeConflictPage> {
    return mergeConflictPage(
      await this.runSdk(
        root,
        "listMergeConflicts",
        [
          {
            path: relativePath,
            expectedStateToken,
            limit: this.safePageSize(options.limit),
            ...(options.after ? { after: options.after } : {}),
          },
        ],
        options
      )
    )
  }

  async readMergeVersion(
    root: string,
    relativePath: string,
    version: EidosSyncMergeContent["version"],
    expectedStateToken: string,
    options: { maxBytes?: number; signal?: AbortSignal } = {}
  ): Promise<EidosSyncMergeContent> {
    return mergeContent(
      await this.runSdk(
        root,
        "readMergeVersion",
        [
          {
            path: relativePath,
            version,
            expectedStateToken,
            maxBytes: Math.max(
              1,
              Math.min(Math.trunc(options.maxBytes ?? 1024 * 1024), 8_388_608)
            ),
          },
        ],
        options
      )
    )
  }

  async diffMergeSqlite(
    root: string,
    relativePath: string,
    from: EidosSyncMergeSqliteVersion,
    to: EidosSyncMergeSqliteVersion,
    expectedStateToken: string,
    options:
      | { mode?: "summary"; signal?: AbortSignal }
      | {
          mode: "rows"
          table: string
          rowLimit?: number
          rowAfter?: string
          signal?: AbortSignal
        } = {}
  ): Promise<EidosSyncMergeSqliteDiff> {
    const rows = options.mode === "rows"
    return mergeSqliteDiff(
      await this.runSdk(
        root,
        "diffMergeSqlite",
        [
          {
            path: relativePath,
            from,
            to,
            mode: rows ? "rows" : "summary",
            expectedStateToken,
            ...(rows
              ? {
                  table: options.table,
                  rowLimit: Math.max(
                    1,
                    Math.min(Math.trunc(options.rowLimit ?? 100), 1_000)
                  ),
                  ...(options.rowAfter ? { rowAfter: options.rowAfter } : {}),
                }
              : {}),
          },
        ],
        options
      )
    )
  }

  async setMergePathResult(
    root: string,
    relativePath: string,
    result: "ours" | "theirs",
    expectedStateToken: string,
    options: GraftMergeMutationOptions = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(
        root,
        "setMergePathResult",
        [{ path: relativePath, result, expectedStateToken }],
        options
      )
    )
    return this.finishMergeMutation(value, options)
  }

  async resolveMergeRow(
    root: string,
    relativePath: string,
    table: string,
    identity: number | Record<string, unknown>,
    result: "ours" | "theirs",
    expectedStateToken: string,
    options: GraftMergeMutationOptions = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(
        root,
        "resolveMergeRow",
        [
          {
            path: relativePath,
            table,
            identity,
            result,
            expectedStateToken,
          },
        ],
        options
      )
    )
    return this.finishMergeMutation(value, options)
  }

  async resolveMergeCell(
    root: string,
    relativePath: string,
    table: string,
    identity: number | Record<string, unknown>,
    column: string,
    result: "ours" | "theirs",
    expectedStateToken: string,
    options: GraftMergeMutationOptions = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(
        root,
        "resolveMergeCell",
        [
          {
            path: relativePath,
            table,
            identity,
            column,
            result,
            expectedStateToken,
          },
        ],
        options
      )
    )
    return this.finishMergeMutation(value, options)
  }

  async resolveMergeTable(
    root: string,
    relativePath: string,
    table: string,
    result: "ours" | "theirs",
    expectedStateToken: string,
    options: GraftMergeMutationOptions = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(
        root,
        "resolveMergeTable",
        [
          {
            path: relativePath,
            table,
            result,
            expectedStateToken,
          },
        ],
        options
      )
    )
    return this.finishMergeMutation(value, options)
  }

  async unresolveMergePath(
    root: string,
    relativePath: string,
    expectedStateToken: string,
    options: GraftMergeMutationOptions = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(
        root,
        "unresolveMergePath",
        [{ path: relativePath, expectedStateToken }],
        options
      )
    )
    return this.finishMergeMutation(value, options)
  }

  async stageMergeSqliteResult(
    root: string,
    relativePath: string,
    expectedStateToken: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(
        root,
        "stageMergeSqliteResult",
        [{ path: relativePath, expectedStateToken }],
        options
      )
    )
    return mergeStatus(value.merge)
  }

  async prepareSemanticMerge(
    root: string,
    relativePath: string,
    provider: string,
    managedTables: readonly string[],
    expectedStateToken: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<GraftSemanticMergeWorkspace> {
    return semanticMergeWorkspace(
      await this.runSdk(
        root,
        "prepareSemanticMerge",
        [
          {
            path: relativePath,
            provider,
            managedTables: [...managedTables],
            expectedStateToken,
          },
        ],
        options
      )
    )
  }

  async recordSemanticMergeConflicts(
    root: string,
    providerToken: string,
    conflicts: readonly unknown[],
    automaticResolutions: readonly unknown[],
    expectedStateToken: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<GraftSemanticMergeWorkspace> {
    return semanticMergeWorkspace(
      await this.runSdk(
        root,
        "recordSemanticMergeConflicts",
        [
          {
            providerToken,
            conflicts: [...conflicts],
            automaticResolutions: [...automaticResolutions],
            expectedStateToken,
          },
        ],
        options
      )
    )
  }

  async acceptSemanticMergeResult(
    root: string,
    providerToken: string,
    validation: unknown,
    automaticResolutions: readonly unknown[],
    expectedStateToken: string,
    options: GraftMergeMutationOptions = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(
        root,
        "acceptSemanticMergeResult",
        [
          {
            providerToken,
            validation,
            automaticResolutions: [...automaticResolutions],
            expectedStateToken,
          },
        ],
        options
      )
    )
    return this.finishMergeMutation(value, options)
  }

  async writeAndStageTextResult(
    root: string,
    relativePath: string,
    content: string,
    expectedStateToken: string,
    options: GraftMergeMutationOptions = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(
        root,
        "writeAndStageTextResult",
        [{ path: relativePath, content, expectedStateToken }],
        options
      )
    )
    return this.finishMergeMutation(value, options)
  }

  async continueMerge(
    root: string,
    message: string,
    expectedStateToken: string,
    options: GraftMergeMutationOptions = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(
        root,
        "continueMerge",
        [{ message, expectedStateToken }],
        options
      )
    )
    return this.finishMergeMutation(value, options)
  }

  async abortMerge(
    root: string,
    expectedStateToken: string,
    options: GraftMergeMutationOptions = {}
  ): Promise<EidosSyncMergeStatus> {
    const value = record(
      await this.runSdk(root, "abortMerge", [{ expectedStateToken }], options)
    )
    return this.finishMergeMutation(value, options)
  }

  private finishMergeMutation(
    value: Record<string, unknown>,
    options: GraftMergeMutationOptions
  ): EidosSyncMergeStatus {
    const worktreePaths = Array.isArray(value.worktree_paths)
      ? stringArray(value.worktree_paths)
      : null
    if (worktreePaths !== null) this.exactMergeWorktreePaths = true
    options.onWorktreePaths?.(worktreePaths)
    return mergeStatus(value.merge)
  }

  clone(
    targetDirectory: string,
    remoteUrl: string,
    token?: string,
    options: { onProgress?: (progress: GraftTransferProgress) => void } = {}
  ): Promise<unknown> {
    return this.requireSdkTransport().clone(
      path.resolve(targetDirectory),
      remoteUrl,
      token,
      options
    )
  }

  async configureOfficialRemote(
    root: string,
    remoteUrl: string,
    token: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<void> {
    if (!isOfficialRemoteUrl(remoteUrl, this.syncRemoteOrigin)) {
      throw new Error("Eidos Lite accepts only the official Eidos Sync Remote")
    }
    if (!token) throw new Error("An Eidos Sync access token is required")
    const existing = await this.remoteUrl(root, "origin", options)
    if (
      existing !== null &&
      canonicalRemoteUrl(existing) !== canonicalRemoteUrl(remoteUrl)
    ) {
      throw new Error(
        "This Space already has a different origin Remote. Eidos Lite will not overwrite it."
      )
    }
    // `configureRemote` is intentionally repeated for an existing origin. It
    // refreshes the in-memory credential and, critically, reasserts that the
    // current branch compares against origin/main. A test or another Graft
    // client may have selected a different upstream without changing origin.
    await this.runSdk(
      root,
      "configureRemote",
      [
        {
          name: "origin",
          // Reuse the SDK's exact stored spelling when origin already
          // exists. `graft+https:` and `https:` are equivalent to Eidos,
          // while configureRemote deliberately compares exact URLs.
          url: existing ?? remoteUrl,
          bearerToken: token,
          upstreamBranch: "main",
        },
      ],
      options
    )
  }

  async clearHttpCredentials(root: string, name = "origin"): Promise<void> {
    await this.runSdk(root, "clearHttpBearerToken", [name])
  }

  async operationMaterializesWorktree(
    operation: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<boolean> {
    const root = this.openedRoot
    if (!root) throw new Error("Graft repository session is closed")
    const result = await this.runSdk(
      root,
      "operationMaterializesWorktree",
      [operation],
      options
    )
    return result === true
  }

  async verifyCrashRecoveryForTesting(root: string): Promise<boolean> {
    const terminate = this.requireSdkTransport().terminateForTesting
    if (!terminate) {
      throw new Error("Graft SDK crash probe requires a utility transport")
    }
    const before = await this.status(root)
    await terminate.call(this.requireSdkTransport())
    const after = await this.status(root)
    return (
      before.dirty === after.dirty &&
      before.currentHead === after.currentHead &&
      before.currentBranch === after.currentBranch
    )
  }

  private async runSdk<T = unknown>(
    root: string,
    command: Parameters<GraftSdkTransport["command"]>[0],
    args: unknown[] = [],
    options: GraftRemoteOperationOptions = {}
  ): Promise<T> {
    const canonicalRoot = await this.canonicalRepositoryRoot(root)
    if (this.openedRoot && this.openedRoot !== canonicalRoot) {
      throw new Error(
        "One GraftClient cannot own more than one repository session"
      )
    }
    await this.requireSdkTransport().open(canonicalRoot)
    this.openedRoot = canonicalRoot
    return this.requireSdkTransport().command(
      command,
      args,
      options
    ) as Promise<T>
  }

  private async statusIncremental(
    root: string,
    options: { signal?: AbortSignal }
  ): Promise<unknown> {
    try {
      return await this.runSdk(root, "statusIncremental", [], options)
    } catch (error) {
      if (
        options.signal?.aborted ||
        !hasErrorCode(error, "GRAFT_SDK_REPOSITORY_STALE")
      ) {
        throw error
      }
      return this.runSdk(root, "statusIncremental", [], options)
    }
  }

  private safePageSize(value?: number): number {
    if (!Number.isFinite(value)) return SDK_DIFF_PAGE_SIZE
    return Math.max(1, Math.min(Math.trunc(value ?? SDK_DIFF_PAGE_SIZE), 100))
  }

  private async canonicalRepositoryRoot(root: string): Promise<string> {
    const resolved = path.resolve(root)
    return fs.realpath(resolved).catch(() => resolved)
  }

  private async clearStaleWorktreeMarkers(
    root: string,
    relativePaths: readonly string[]
  ): Promise<void> {
    const worktree = await this.readWorktreeState(root)
    if (!worktree) return
    const { state, statePath } = worktree
    const targets = new Set(relativePaths)
    const dirty = stringArray(state.dirty).filter((item) => !targets.has(item))
    const deleted = stringArray(state.deleted).filter(
      (item) => !targets.has(item)
    )
    if (
      dirty.length === stringArray(state.dirty).length &&
      deleted.length === stringArray(state.deleted).length
    ) {
      return
    }

    // Graft 0.3.0 leaves restored SQLite paths marked dirty so its stale
    // in-memory volume wins over the materialized file. Removing only the
    // explicitly verified markers makes stagePaths import the live database.
    const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`
    const next = stringifyToml({ ...state, dirty, deleted })
    try {
      await fs.writeFile(temporaryPath, next, { encoding: "utf8", flag: "wx" })
      await fs.rename(temporaryPath, statePath)
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  }

  private async markedWorktreePaths(
    root: string,
    relativePaths: readonly string[]
  ): Promise<string[]> {
    const worktree = await this.readWorktreeState(root)
    if (!worktree) return []
    const dirty = new Set([
      ...stringArray(worktree.state.dirty),
      ...stringArray(worktree.state.deleted),
    ])
    return [...new Set(relativePaths)].filter((relativePath) =>
      dirty.has(relativePath)
    )
  }

  private async readWorktreeState(root: string): Promise<{
    statePath: string
    state: Record<string, unknown>
  } | null> {
    const statePath = path.join(root, ".graft", "index", "worktree.toml")
    const raw = await fs.readFile(statePath, "utf8").catch((error) => {
      if (hasErrorCode(error, "ENOENT")) return null
      throw error
    })
    return raw === null ? null : { statePath, state: record(parseToml(raw)) }
  }

  private async diffExplicitPaths(
    root: string,
    paths: readonly string[],
    options: {
      rows: boolean
      table?: string
      limit?: number
      after?: string
      signal?: AbortSignal
      from?: string
      to?: string
      root?: string
      currentHead?: string | null
      currentBranch?: string | null
      totalPaths?: number
      hasMore?: boolean
      nextCursor?: string | null
    }
  ): Promise<SpaceVersionDiff> {
    const sorted = [...new Set(paths)].sort()
    const remaining = options.after
      ? sorted.filter((relativePath) => relativePath > options.after!)
      : sorted
    if (remaining.length === 0) {
      return mergeVersionDiffs([], {
        currentHead: options.currentHead,
        currentBranch: options.currentBranch,
        totalPaths: options.totalPaths,
        from: options.from ?? null,
        to: options.to ?? null,
        hasMore: options.hasMore ?? false,
        nextCursor: options.nextCursor ?? null,
      })
    }
    const pageSize = this.safePageSize(options.limit)
    const requestPaths = remaining.slice(0, pageSize)
    const value = record(
      await this.runSdk(
        root,
        "diffPaths",
        [
          {
            paths: requestPaths,
            rows: options.rows,
            limit: pageSize,
            ...(options.table ? { table: options.table } : {}),
            ...(options.from ? { from: options.from } : {}),
            ...(options.to ? { to: options.to } : {}),
            ...(options.root ? { root: options.root } : {}),
          },
        ],
        options
      )
    )
    const values = Array.isArray(value.paths)
      ? value.paths.map(record).map((entry) => entry.diff)
      : []
    return mergeVersionDiffs(values, {
      currentHead: options.currentHead,
      currentBranch: options.currentBranch,
      totalPaths: options.totalPaths,
      from: options.from ?? null,
      to: options.to ?? null,
      hasMore:
        options.hasMore === true ||
        value.has_more === true ||
        remaining.length > requestPaths.length,
      nextCursor:
        options.nextCursor ??
        stringValue(value.next_cursor) ??
        (remaining.length > requestPaths.length
          ? (requestPaths.at(-1) ?? null)
          : null),
    })
  }

  private async diffAllExplicitPaths(
    root: string,
    paths: readonly string[],
    options: {
      rows: boolean
      from?: string
      to?: string
      root?: string
      signal?: AbortSignal
    }
  ): Promise<SpaceVersionDiff> {
    const values: unknown[] = []
    const sorted = [...new Set(paths)].sort()
    for (let index = 0; index < sorted.length; index += SDK_DIFF_PAGE_SIZE) {
      const page = record(
        await this.runSdk(
          root,
          "diffPaths",
          [
            {
              paths: sorted.slice(index, index + SDK_DIFF_PAGE_SIZE),
              rows: options.rows,
              limit: SDK_DIFF_PAGE_SIZE,
              ...(options.from ? { from: options.from } : {}),
              ...(options.to ? { to: options.to } : {}),
              ...(options.root ? { root: options.root } : {}),
            },
          ],
          options
        )
      )
      if (Array.isArray(page.paths)) {
        values.push(...page.paths.map(record).map((entry) => entry.diff))
      }
    }
    return mergeVersionDiffs(values, {
      from: options.from ?? null,
      to: options.to ?? null,
    })
  }

  private async changedPathsBetween(
    root: string,
    ancestor: string,
    descendant: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<string[]> {
    const paths = new Set<string>()
    let current: string | null = descendant
    for (let depth = 0; current && current !== ancestor; depth += 1) {
      if (depth >= 10_000) {
        throw new Error("Space history is too deep to compare safely")
      }
      let after: string | undefined
      let parent: string | null = null
      do {
        const page = record(
          await this.runSdk(
            root,
            "commitChangedPaths",
            [
              {
                revision: current,
                limit: SDK_DIFF_PAGE_SIZE,
                ...(after ? { after } : {}),
              },
            ],
            options
          )
        )
        parent = stringValue(page.parent) ?? null
        if (Array.isArray(page.paths)) {
          for (const item of page.paths.map(record)) {
            for (const relativePath of [
              stringValue(item.path),
              stringValue(item.previous_path),
            ]) {
              if (relativePath) paths.add(relativePath)
            }
          }
        }
        after = page.has_more ? stringValue(page.next_cursor) : undefined
      } while (after)
      current = parent
    }
    if (current !== ancestor) {
      throw new Error("The selected checkpoint is not in the current history")
    }
    return [...paths].sort()
  }

  private async setHttpCredential(
    root: string,
    name: string,
    token?: string,
    options: GraftRemoteOperationOptions = {}
  ): Promise<void> {
    if (!token) return
    await this.runSdk(root, "setHttpBearerToken", [name, token], options)
  }

  private requireSdkTransport(): GraftSdkTransport {
    if (!this.sdkTransport) {
      throw new Error("The Graft SDK session transport is unavailable")
    }
    return this.sdkTransport
  }
}
