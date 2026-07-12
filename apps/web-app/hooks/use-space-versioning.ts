import { useCallback, useEffect, useRef, useState } from "react"

import { flushPendingFileWrites } from "@/apps/web-app/components/file-space/pending-writes"

export type SpaceVersionChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted"
  | "unknown"

export interface SpaceVersionChange {
  path: string
  status: SpaceVersionChangeStatus
  previousPath?: string
  staged?: true
  unstaged?: true
  conflicted?: true
}

export interface SpaceVersionCommit {
  id: string
  message: string
  timestamp: number | null
  parents: string[]
  changedPaths: SpaceVersionChange[]
  labels: string[]
}

export interface SpaceVersionStatus {
  enabled: boolean
  clean: boolean
  hasConflicts: boolean
  branch: string | null
  head: SpaceVersionCommit | null
  changes: SpaceVersionChange[]
  remoteNames: string[]
  upstream: SpaceVersionUpstream | null
  ahead: number
  behind: number
}

export type SpaceVersionUpstreamState =
  | "up_to_date"
  | "ahead"
  | "behind"
  | "diverged"
  | "unknown"

export interface SpaceVersionUpstream {
  remote: string
  branch: string
  ahead: number
  behind: number
  state: SpaceVersionUpstreamState
}

export interface SpaceVersionRemote {
  name: string
  url: string
}

export interface SpaceVersionConfigureRemoteRequest {
  name?: string
  url: string
  branch?: string
}

export interface SpaceVersionSyncRequest {
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

export interface SpaceVersionHistory {
  commits: SpaceVersionCommit[]
  nextCursor: string | null
  hasMore: boolean
}

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

export type SpaceVersionPathChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "unknown"

export interface SpaceVersionPathChange {
  path: string
  change: SpaceVersionPathChangeKind
  kind: SpaceVersionPathKind
  storage: SpaceVersionPathStorage
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
  change: SpaceVersionPathChangeKind
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
  change: SpaceVersionPathChangeKind
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
  from: string | null
  to: string | null
  paths: SpaceVersionPathChange[]
  content: SpaceVersionTextContentDiff | null
  sqliteFiles: SpaceVersionSqliteFileDiff[]
}

export interface SpaceVersionDiffRequest {
  root?: string
  from?: string
  to?: string
  path?: string
  includeContent?: boolean
  includeRows?: boolean
}

export interface SpaceVersionStagePathRequest {
  path: string
  expectedHead: string | null
}

export interface SpaceVersionStagePathResult {
  path: string
  status: SpaceVersionStatus
}

export type SpaceVersionUnstagePathRequest = SpaceVersionStagePathRequest
export type SpaceVersionUnstagePathResult = SpaceVersionStagePathResult

export interface SpaceVersionDiscardPathRequest {
  path: string
  expectedHead: string | null
  confirmed: true
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

export interface SpaceVersionRestorePathRequest {
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

export interface SpaceVersionRestoreVersionRequest {
  revision: string
  expectedHead: string
  overwriteChanges?: boolean
}

export interface SpaceVersionRestoreVersionResult {
  revision: string
  restoredPaths: string[]
  status: SpaceVersionStatus
}

export type SpaceVersioningOperation =
  | "enabling"
  | "committing"
  | "staging"
  | "discarding"
  | "restoring"
  | "configuring-remote"
  | "fetching"
  | "pulling"
  | "pushing"
  | null

export function isDestructiveSpaceVersioningOperation(
  operation: SpaceVersioningOperation
): boolean {
  return (
    operation === "restoring" ||
    operation === "discarding" ||
    operation === "pulling"
  )
}

interface SpaceVersioningBridge {
  getStatus: (spaceId: string) => Promise<unknown>
  enable: (spaceId: string) => Promise<unknown>
  getRemotes: (spaceId: string) => Promise<unknown>
  configureRemote: (
    spaceId: string,
    options: SpaceVersionConfigureRemoteRequest
  ) => Promise<unknown>
  removeRemote: (
    spaceId: string,
    options?: { name?: string }
  ) => Promise<unknown>
  fetchRemote: (
    spaceId: string,
    options?: SpaceVersionSyncRequest
  ) => Promise<unknown>
  pullRemote: (
    spaceId: string,
    options?: SpaceVersionSyncRequest
  ) => Promise<unknown>
  pushRemote: (
    spaceId: string,
    options?: SpaceVersionSyncRequest
  ) => Promise<unknown>
  commit: (spaceId: string, options: { message: string }) => Promise<unknown>
  getHistory: (
    spaceId: string,
    options?: { limit?: number; cursor?: string }
  ) => Promise<unknown>
  getCommit: (spaceId: string, commitId: string) => Promise<unknown>
  getDiff: (
    spaceId: string,
    request: SpaceVersionDiffRequest
  ) => Promise<unknown>
  stagePath: (
    spaceId: string,
    request: SpaceVersionStagePathRequest
  ) => Promise<unknown>
  unstagePath: (
    spaceId: string,
    request: SpaceVersionUnstagePathRequest
  ) => Promise<unknown>
  discardPath: (
    spaceId: string,
    request: SpaceVersionDiscardPathRequest
  ) => Promise<unknown>
  restorePath: (
    spaceId: string,
    request: SpaceVersionRestorePathRequest
  ) => Promise<unknown>
  restoreVersion: (
    spaceId: string,
    request: SpaceVersionRestoreVersionRequest
  ) => Promise<unknown>
}

interface EidosEventBridge {
  on?: (
    channel: string,
    listener: (...args: unknown[]) => void
  ) => string | undefined
  off?: (channel: string, listenerId: string) => void
}

type UnknownRecord = Record<string, unknown>

export const SPACE_VERSIONING_CHANGED_EVENT = "space-versioning:changed"
export const SPACE_VERSIONING_OPERATION_EVENT = "space-versioning:operation"

type ActiveSpaceVersioningOperation = Exclude<SpaceVersioningOperation, null>

interface SpaceVersioningOperationDetail {
  spaceId: string
  operation: SpaceVersioningOperation
}

const activeSpaceVersioningOperations = new Map<
  string,
  ActiveSpaceVersioningOperation
>()

export function useActiveSpaceVersioningOperation(
  spaceId: string | undefined
): SpaceVersioningOperation {
  const [operation, setOperation] = useState<SpaceVersioningOperation>(() =>
    spaceId ? (activeSpaceVersioningOperations.get(spaceId) ?? null) : null
  )

  useEffect(() => {
    setOperation(
      spaceId ? (activeSpaceVersioningOperations.get(spaceId) ?? null) : null
    )
    if (!spaceId || typeof window === "undefined") return

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<SpaceVersioningOperationDetail>)
        .detail
      if (detail?.spaceId === spaceId) setOperation(detail.operation)
    }
    window.addEventListener(SPACE_VERSIONING_OPERATION_EVENT, listener)
    return () => {
      window.removeEventListener(SPACE_VERSIONING_OPERATION_EVENT, listener)
    }
  }, [spaceId])

  return operation
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim()
    return normalized || null
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return null
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (value === 1 || value === "true") return true
  if (value === 0 || value === "false") return false
  return null
}

function asNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function firstValue(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

function unwrapPayload(value: unknown): unknown {
  let current = value
  for (let depth = 0; depth < 4 && isRecord(current); depth += 1) {
    if (current.success === false) {
      const message = asString(current.error) ?? asString(current.message)
      throw new Error(message ?? "Versioning request failed")
    }
    const next = firstValue(current, ["data", "result", "value"])
    if (next === undefined || next === current) break
    current = next
  }
  return current
}

function normalizePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const normalized = value.replace(/^\.\//, "").replace(/^\/+/, "")
  return normalized || null
}

export function normalizeChangeStatus(
  value: unknown
): SpaceVersionChangeStatus {
  const status = asString(value)?.toLowerCase().replace(/_/g, "-")
  if (!status) return "unknown"
  if (["a", "add", "added", "new", "created"].includes(status)) {
    return "added"
  }
  if (
    ["m", "modify", "modified", "changed", "update", "updated"].includes(status)
  ) {
    return "modified"
  }
  if (["d", "delete", "deleted", "removed"].includes(status)) {
    return "deleted"
  }
  if (["r", "rename", "renamed", "moved"].includes(status)) {
    return "renamed"
  }
  if (["?", "??", "u", "untracked", "unversioned"].includes(status)) {
    return "untracked"
  }
  if (["!", "c", "conflict", "conflicted", "unmerged"].includes(status)) {
    return "conflicted"
  }
  return "unknown"
}

function normalizeChange(
  value: unknown,
  fallbackPath?: string
): SpaceVersionChange | null {
  if (typeof value === "string") {
    const porcelainMatch = value.match(/^\s*(\?\?|[AMDRCU!])\s+(.+)$/i)
    if (porcelainMatch) {
      const path = normalizePath(porcelainMatch[2])
      return path
        ? { path, status: normalizeChangeStatus(porcelainMatch[1]) }
        : null
    }
    const path = normalizePath(value)
    return path ? { path, status: "unknown" } : null
  }
  if (!isRecord(value)) return null

  const path =
    normalizePath(
      firstValue(value, ["path", "file", "filePath", "name", "relativePath"])
    ) ?? normalizePath(fallbackPath)
  if (!path) return null
  const previousPath = normalizePath(
    firstValue(value, ["previousPath", "oldPath", "from", "source"])
  )
  const status = normalizeChangeStatus(
    firstValue(value, ["status", "state", "change", "changeType", "type"])
  )
  const staged = asBoolean(value.staged) === true
  const worktreeState = normalizeChangeStatus(
    firstValue(value, [
      "worktreeState",
      "worktree_state",
      "unstagedChange",
      "unstaged_change",
    ])
  )
  const unstaged =
    asBoolean(value.unstaged) === true || worktreeState !== "unknown"
  const conflicted =
    asBoolean(value.conflicted) === true || status === "conflicted"
  return {
    path,
    status,
    ...(previousPath && previousPath !== path ? { previousPath } : {}),
    ...(staged ? { staged: true as const } : {}),
    ...(unstaged ? { unstaged: true as const } : {}),
    ...(conflicted ? { conflicted: true as const } : {}),
  }
}

function dedupeChanges(changes: SpaceVersionChange[]): SpaceVersionChange[] {
  const byPath = new Map<string, SpaceVersionChange>()
  for (const change of changes) {
    const existing = byPath.get(change.path)
    if (!existing || existing.status === "unknown")
      byPath.set(change.path, change)
  }
  return [...byPath.values()]
}

export function normalizeSpaceVersionChanges(
  value: unknown
): SpaceVersionChange[] {
  if (Array.isArray(value)) {
    return dedupeChanges(
      value
        .map((entry) => normalizeChange(entry))
        .filter((entry): entry is SpaceVersionChange => entry !== null)
    )
  }
  if (!isRecord(value)) return []

  const nested = firstValue(value, [
    "changes",
    "changedPaths",
    "paths",
    "files",
    "entries",
  ])
  if (nested !== undefined && nested !== value) {
    const normalized = normalizeSpaceVersionChanges(nested)
    if (normalized.length > 0 || Array.isArray(nested)) return normalized
  }

  const entries = Object.entries(value)
    .map(([path, status]) => normalizeChange(status, path))
    .filter((entry): entry is SpaceVersionChange => entry !== null)
  return dedupeChanges(entries)
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  const stringValue = asString(value)
  if (!stringValue) return null
  if (/^\d+(\.\d+)?$/.test(stringValue)) {
    const numericValue = Number(stringValue)
    return numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue
  }
  const parsed = Date.parse(stringValue)
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (isRecord(entry)) {
        return asString(firstValue(entry, ["name", "label", "id", "hash"]))
      }
      return asString(entry)
    })
    .filter((entry): entry is string => entry !== null)
}

export function normalizeSpaceVersionCommit(
  value: unknown,
  fallbackId = ""
): SpaceVersionCommit | null {
  const outerPayload = unwrapPayload(value)
  if (!isRecord(outerPayload)) return null
  const nestedCommit = outerPayload.commit
  const payload = isRecord(nestedCommit) ? nestedCommit : outerPayload
  const id =
    asString(
      firstValue(payload, ["id", "commitId", "commit", "hash", "oid", "lsn"])
    ) ?? fallbackId
  if (!id) return null
  const message =
    asString(firstValue(payload, ["message", "subject", "title", "summary"])) ??
    "Version without a message"
  const changedSource = firstValue(payload, [
    "changes",
    "changedPaths",
    "files",
    "paths",
  ])
  return {
    id,
    message,
    timestamp: normalizeTimestamp(
      firstValue(payload, [
        "timestamp",
        "timestampMs",
        "timestamp_ms",
        "time",
        "date",
        "createdAt",
        "committedAt",
      ])
    ),
    parents: normalizeStringArray(
      firstValue(payload, ["parents", "parentIds", "parent", "parentId"])
    ),
    changedPaths: normalizeSpaceVersionChanges(changedSource),
    labels: normalizeStringArray(
      firstValue(payload, ["labels", "refs", "branches", "tags"])
    ),
  }
}

function normalizeSpaceVersionUpstream(
  value: unknown
): SpaceVersionUpstream | null {
  if (!isRecord(value)) return null
  const remote = asString(value.remote)
  const branch = asString(value.branch)
  if (!remote || !branch) return null
  const rawState = asString(value.state)
  const state: SpaceVersionUpstreamState =
    rawState === "up_to_date" ||
    rawState === "ahead" ||
    rawState === "behind" ||
    rawState === "diverged"
      ? rawState
      : "unknown"
  return {
    remote,
    branch,
    ahead: asNonNegativeInteger(value.ahead) ?? 0,
    behind: asNonNegativeInteger(value.behind) ?? 0,
    state,
  }
}

export function normalizeSpaceVersionStatus(
  value: unknown
): SpaceVersionStatus {
  const payload = unwrapPayload(value)
  if (!isRecord(payload)) {
    return {
      enabled: false,
      clean: true,
      hasConflicts: false,
      branch: null,
      head: null,
      changes: [],
      remoteNames: [],
      upstream: null,
      ahead: 0,
      behind: 0,
    }
  }

  const changes = normalizeSpaceVersionChanges(
    firstValue(payload, [
      "changes",
      "changedPaths",
      "files",
      "paths",
      "statusEntries",
    ])
  )
  const state = asString(payload.status)?.toLowerCase()
  const explicitEnabled = asBoolean(
    firstValue(payload, [
      "enabled",
      "initialized",
      "isInitialized",
      "is_initialized",
      "repositoryExists",
      "repository_exists",
    ])
  )
  const enabled =
    explicitEnabled ??
    !["disabled", "not-initialized", "uninitialized", "missing"].includes(
      state ?? ""
    )
  const clean =
    asBoolean(firstValue(payload, ["clean", "isClean"])) ?? changes.length === 0
  const hasConflicts =
    asBoolean(firstValue(payload, ["hasConflicts", "has_conflicts"])) ??
    changes.some(
      (change) => change.conflicted || change.status === "conflicted"
    )
  const headValue = firstValue(payload, [
    "head",
    "latest",
    "currentCommit",
    "current_commit",
  ])
  const headId = asString(
    firstValue(payload, [
      "headId",
      "head_id",
      "headCommit",
      "head_commit",
      "currentHead",
      "current_head",
      "commitId",
      "commit_id",
    ])
  )

  return {
    enabled,
    clean,
    hasConflicts,
    branch:
      asString(
        firstValue(payload, [
          "branch",
          "currentBranch",
          "current_branch",
          "headName",
          "head_name",
        ])
      ) ?? (isRecord(headValue) ? asString(headValue.branch) : null),
    head:
      normalizeSpaceVersionCommit(headValue, headId ?? "") ??
      (headId
        ? {
            id: headId,
            message: "Current version",
            timestamp: null,
            parents: [],
            changedPaths: [],
            labels: [],
          }
        : null),
    changes,
    remoteNames: normalizeStringArray(
      firstValue(payload, ["remoteNames", "remote_names"])
    ),
    upstream: normalizeSpaceVersionUpstream(
      firstValue(payload, ["upstream", "upstreamStatus", "upstream_status"])
    ),
    ahead:
      asNonNegativeInteger(firstValue(payload, ["ahead", "aheadCount"])) ?? 0,
    behind:
      asNonNegativeInteger(firstValue(payload, ["behind", "behindCount"])) ?? 0,
  }
}

function dedupeCommits(commits: SpaceVersionCommit[]): SpaceVersionCommit[] {
  const seen = new Set<string>()
  return commits.filter((commit) => {
    if (seen.has(commit.id)) return false
    seen.add(commit.id)
    return true
  })
}

export function normalizeSpaceVersionHistory(
  value: unknown
): SpaceVersionHistory {
  const payload = unwrapPayload(value)
  const entries = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? firstValue(payload, ["commits", "history", "entries", "items", "log"])
      : []
  const commits = dedupeCommits(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => normalizeSpaceVersionCommit(entry))
      .filter((entry): entry is SpaceVersionCommit => entry !== null)
  )
  const nextCursor = isRecord(payload)
    ? asString(firstValue(payload, ["nextCursor", "cursor", "next"]))
    : null
  const explicitHasMore = isRecord(payload)
    ? asBoolean(firstValue(payload, ["hasMore", "has_more"]))
    : null
  return {
    commits,
    nextCursor,
    hasMore: nextCursor !== null && (explicitHasMore ?? true),
  }
}

function normalizePathKind(value: unknown): SpaceVersionPathKind {
  const kind = asString(value)?.toLowerCase().replace(/-/g, "_")
  if (
    kind === "sqlite_database" ||
    kind === "text_file" ||
    kind === "binary_file"
  ) {
    return kind
  }
  return "unknown"
}

function normalizePathStorage(value: unknown): SpaceVersionPathStorage {
  const storage = asString(value)?.toLowerCase().replace(/-/g, "_")
  if (
    storage === "sqlite_snapshot" ||
    storage === "inline" ||
    storage === "external"
  ) {
    return storage
  }
  return "unknown"
}

function normalizePathChangeKind(value: unknown): SpaceVersionPathChangeKind {
  const change = normalizeChangeStatus(value)
  if (
    change === "added" ||
    change === "modified" ||
    change === "deleted" ||
    change === "renamed"
  ) {
    return change
  }
  return "unknown"
}

function normalizeVersionPathChange(
  value: unknown
): SpaceVersionPathChange | null {
  if (!isRecord(value)) return null
  const path = normalizePath(value.path)
  if (!path) return null
  return {
    path,
    change: normalizePathChangeKind(value.change),
    kind: normalizePathKind(value.kind),
    storage: normalizePathStorage(value.storage),
  }
}

function normalizeTextContentState(
  value: unknown
): SpaceVersionTextContentState | null {
  if (!isRecord(value)) return null
  if (value.state === "absent") return { state: "absent" }
  const size = value.size
  const contentHash = asString(value.contentHash)
  if (
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    !contentHash
  ) {
    return null
  }
  if (value.state === "utf8" && typeof value.content === "string") {
    return {
      state: "utf8",
      content: value.content,
      size,
      contentHash,
    }
  }
  if (
    value.state === "too_large" ||
    value.state === "missing_payload" ||
    value.state === "invalid_utf8"
  ) {
    return { state: value.state, size, contentHash }
  }
  return null
}

function normalizeTextContentDiff(
  value: unknown
): SpaceVersionTextContentDiff | null {
  if (!isRecord(value) || value.kind !== "text_file") return null
  const path = normalizePath(value.path)
  const before = normalizeTextContentState(value.before)
  const after = normalizeTextContentState(value.after)
  if (!path || !before || !after) return null
  return {
    path,
    change: normalizePathChangeKind(value.change),
    kind: "text_file",
    storage: normalizePathStorage(value.storage),
    before,
    after,
  }
}

function isSqliteValue(value: unknown): value is SpaceVersionSqliteValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
}

function normalizeSqliteRowChange(
  value: unknown
): SpaceVersionSqliteRowChange | null {
  if (!isRecord(value)) return null
  if (
    value.operation !== "insert" &&
    value.operation !== "update" &&
    value.operation !== "delete"
  ) {
    return null
  }
  if (typeof value.rowId !== "number" || !Number.isSafeInteger(value.rowId)) {
    return null
  }
  if (!Array.isArray(value.values) || !value.values.every(isSqliteValue)) {
    return null
  }
  const beforeValues =
    value.beforeValues === null
      ? null
      : Array.isArray(value.beforeValues) &&
          value.beforeValues.every(isSqliteValue)
        ? value.beforeValues
        : undefined
  if (beforeValues === undefined) return null
  if (value.operation === "update" && beforeValues === null) return null
  return {
    operation: value.operation,
    rowId: value.rowId,
    values: value.values,
    beforeValues,
  }
}

function normalizeSqliteTableDiff(
  value: unknown
): SpaceVersionSqliteTableDiff | null {
  if (!isRecord(value)) return null
  const name = asString(value.name)
  if (!name) return null
  const columns = Array.isArray(value.columns)
    ? value.columns.filter(
        (column): column is string => typeof column === "string"
      )
    : []
  const changes = Array.isArray(value.changes)
    ? value.changes
        .map(normalizeSqliteRowChange)
        .filter(
          (change): change is SpaceVersionSqliteRowChange => change !== null
        )
    : []
  return { name, columns, changes }
}

function normalizeSqliteFileDiff(
  value: unknown
): SpaceVersionSqliteFileDiff | null {
  if (!isRecord(value) || value.kind !== "sqlite_database") return null
  const path = normalizePath(value.path)
  if (!path || typeof value.rowDiffAvailable !== "boolean") return null
  const limitations = Array.isArray(value.limitations)
    ? value.limitations.flatMap((entry) => {
        if (!isRecord(entry)) return []
        const kind = asString(entry.kind)
        return kind ? [{ kind, subject: asString(entry.subject) }] : []
      })
    : []
  const opaqueChanges = Array.isArray(value.opaqueChanges)
    ? value.opaqueChanges.flatMap((entry) => {
        if (!isRecord(entry)) return []
        const name = asString(entry.name)
        const change = asString(entry.change)
        const reason = asString(entry.reason)
        return name && change && reason
          ? [{ name, change, reason, owner: asString(entry.owner) }]
          : []
      })
    : []
  const tables = Array.isArray(value.tables)
    ? value.tables
        .map(normalizeSqliteTableDiff)
        .filter((table): table is SpaceVersionSqliteTableDiff => table !== null)
    : []
  return {
    path,
    change: normalizePathChangeKind(value.change),
    kind: "sqlite_database",
    storage: normalizePathStorage(value.storage),
    rowDiffAvailable: value.rowDiffAvailable,
    logicalStatus: asString(value.logicalStatus) ?? "unknown",
    capabilities: Array.isArray(value.capabilities)
      ? value.capabilities.filter(
          (capability): capability is string => typeof capability === "string"
        )
      : [],
    limitations,
    message: asString(value.message),
    tables,
    opaqueChanges,
  }
}

export function normalizeSpaceVersionDiff(value: unknown): SpaceVersionDiff {
  const payload = unwrapPayload(value)
  if (!isRecord(payload)) {
    return {
      currentHead: null,
      currentBranch: null,
      from: null,
      to: null,
      paths: [],
      content: null,
      sqliteFiles: [],
    }
  }
  const rawPaths = Array.isArray(payload.paths) ? payload.paths : []
  const paths = rawPaths
    .map((entry) => normalizeVersionPathChange(entry))
    .filter((entry): entry is SpaceVersionPathChange => entry !== null)
  return {
    currentHead: asString(payload.currentHead),
    currentBranch: asString(payload.currentBranch),
    from: asString(payload.from),
    to: asString(payload.to),
    paths,
    content: normalizeTextContentDiff(payload.content),
    sqliteFiles: Array.isArray(payload.sqliteFiles)
      ? payload.sqliteFiles
          .map(normalizeSqliteFileDiff)
          .filter((file): file is SpaceVersionSqliteFileDiff => file !== null)
      : [],
  }
}

export function normalizeSpaceVersionRemotes(
  value: unknown
): SpaceVersionRemote[] {
  const payload = unwrapPayload(value)
  const remotes = isRecord(payload) ? payload.remotes : undefined
  if (!Array.isArray(remotes)) return []
  return remotes.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const name = asString(entry.name)
    const url = asString(entry.url)
    return name && url ? [{ name, url }] : []
  })
}

export function normalizeSpaceVersionSyncResult(
  value: unknown
): SpaceVersionSyncResult {
  const payload = unwrapPayload(value)
  if (!isRecord(payload)) {
    throw new Error("Desktop returned an invalid remote sync result")
  }
  const operation = asString(payload.operation)
  const remote = asString(payload.remote)
  if (
    (operation !== "fetch" && operation !== "pull" && operation !== "push") ||
    !remote ||
    payload.status === undefined
  ) {
    throw new Error("Desktop returned an incomplete remote sync result")
  }
  return {
    operation,
    remote,
    branch: asString(payload.branch),
    commits: asNonNegativeInteger(payload.commits) ?? 0,
    forced: asBoolean(payload.forced) ?? false,
    status: normalizeSpaceVersionStatus(payload.status),
  }
}

export function normalizeSpaceVersionStagePathResult(
  value: unknown
): SpaceVersionStagePathResult {
  const payload = unwrapPayload(value)
  if (!isRecord(payload)) {
    throw new Error("Desktop returned an invalid include result")
  }
  const stagedPath = normalizePath(payload.path)
  if (!stagedPath || payload.status === undefined) {
    throw new Error("Desktop returned an incomplete include result")
  }
  return {
    path: stagedPath,
    status: normalizeSpaceVersionStatus(payload.status),
  }
}

export function normalizeSpaceVersionDiscardPathResult(
  value: unknown
): SpaceVersionDiscardPathResult {
  const payload = unwrapPayload(value)
  if (!isRecord(payload)) {
    throw new Error("Desktop returned an invalid discard result")
  }
  const discardedPath = normalizePath(payload.path)
  const effect = asString(payload.effect)
  if (
    !discardedPath ||
    !["deleted", "restored", "noop"].includes(effect ?? "") ||
    payload.status === undefined
  ) {
    throw new Error("Desktop returned an incomplete discard result")
  }
  return {
    path: discardedPath,
    effect: effect as SpaceVersionDiscardEffect,
    status: normalizeSpaceVersionStatus(payload.status),
  }
}

function normalizeRestoreEffect(value: unknown): SpaceVersionRestoreEffect {
  switch (asString(value)) {
    case "created":
    case "modified":
    case "deleted":
    case "noop":
      return value as SpaceVersionRestoreEffect
    default:
      throw new Error("Desktop returned an invalid file restore result")
  }
}

export function normalizeSpaceVersionRestorePathResult(
  value: unknown
): SpaceVersionRestorePathResult {
  const payload = unwrapPayload(value)
  if (!isRecord(payload)) {
    throw new Error("Desktop returned an invalid file restore result")
  }
  const revision = asString(payload.revision)
  const restoredPath = normalizePath(payload.path)
  if (!revision || !restoredPath) {
    throw new Error("Desktop returned an incomplete file restore result")
  }
  return {
    revision,
    path: restoredPath,
    kind: normalizePathKind(payload.kind),
    storage: normalizePathStorage(payload.storage),
    effect: normalizeRestoreEffect(payload.effect),
    status: normalizeSpaceVersionStatus(payload.status),
  }
}

export function normalizeSpaceVersionRestoreVersionResult(
  value: unknown
): SpaceVersionRestoreVersionResult {
  const payload = unwrapPayload(value)
  if (!isRecord(payload)) {
    throw new Error("Desktop returned an invalid Space restore result")
  }
  const revision = asString(payload.revision)
  const restoredPaths = Array.isArray(payload.restoredPaths)
    ? payload.restoredPaths
        .map((entry) => normalizePath(entry))
        .filter((entry): entry is string => entry !== null)
    : []
  if (!revision) {
    throw new Error("Desktop returned an incomplete Space restore result")
  }
  return {
    revision,
    restoredPaths: [...new Set(restoredPaths)],
    status: normalizeSpaceVersionStatus(payload.status),
  }
}

function getSpaceVersioningBridge(): SpaceVersioningBridge | null {
  if (typeof window === "undefined") return null
  const eidos = (
    window as unknown as { eidos?: { spaceVersioning?: SpaceVersioningBridge } }
  ).eidos
  return eidos?.spaceVersioning ?? null
}

function requireSpaceVersioningBridge(): SpaceVersioningBridge {
  const bridge = getSpaceVersioningBridge()
  if (!bridge) {
    throw new Error("Version history is available in the desktop app")
  }
  return bridge
}

function errorFrom(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

interface HistorySnapshot {
  commits: SpaceVersionCommit[]
  nextCursor: string | null
  hasMore: boolean
}

function mergeCommits(
  current: SpaceVersionCommit[],
  incoming: SpaceVersionCommit[]
): SpaceVersionCommit[] {
  return dedupeCommits([...current, ...incoming])
}

function announceSpaceVersioningChange(spaceId: string, source: object) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new window.CustomEvent(SPACE_VERSIONING_CHANGED_EVENT, {
      detail: { spaceId, source },
    })
  )
}

function announceSpaceVersioningOperation(
  spaceId: string,
  operation: SpaceVersioningOperation
) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new window.CustomEvent(SPACE_VERSIONING_OPERATION_EVENT, {
      detail: { spaceId, operation },
    })
  )
}

function beginSpaceVersioningOperation(
  spaceId: string,
  operation: ActiveSpaceVersioningOperation
): () => void {
  const activeOperation = activeSpaceVersioningOperations.get(spaceId)
  if (activeOperation) {
    throw new Error(
      `Another version operation is already running (${activeOperation}).`
    )
  }

  activeSpaceVersioningOperations.set(spaceId, operation)
  announceSpaceVersioningOperation(spaceId, operation)
  let finished = false
  return () => {
    if (finished) return
    finished = true
    if (activeSpaceVersioningOperations.get(spaceId) === operation) {
      activeSpaceVersioningOperations.delete(spaceId)
      announceSpaceVersioningOperation(spaceId, null)
    }
  }
}

export function useSpaceVersioning(
  spaceId: string | undefined,
  options: { loadHistory?: boolean; historyLimit?: number } = {}
) {
  const { loadHistory = false, historyLimit = 250 } = options
  const [status, setStatus] = useState<SpaceVersionStatus | null>(null)
  const [history, setHistory] = useState<SpaceVersionCommit[]>([])
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(
    null
  )
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(loadHistory)
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false)
  const [operation, setOperation] = useState<SpaceVersioningOperation>(null)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)
  const statusRequestRef = useRef(0)
  const historyRequestRef = useRef(0)
  const historyGenerationRef = useRef(0)
  const historyLoadMoreRequestRef = useRef(0)
  const historyLoadMoreInFlightRef = useRef(false)
  const historyLoadedRef = useRef(loadHistory)
  const historySnapshotRef = useRef<HistorySnapshot>({
    commits: [],
    nextCursor: null,
    hasMore: false,
  })
  const instanceTokenRef = useRef<object>({})

  const applyHistorySnapshot = useCallback((snapshot: HistorySnapshot) => {
    historySnapshotRef.current = snapshot
    setHistory(snapshot.commits)
    setHistoryNextCursor(snapshot.nextCursor)
    setHistoryHasMore(snapshot.hasMore)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    statusRequestRef.current += 1
    historyRequestRef.current += 1
    historyGenerationRef.current += 1
    historyLoadMoreRequestRef.current += 1
    historyLoadMoreInFlightRef.current = false
    historyLoadedRef.current = loadHistory
    historySnapshotRef.current = {
      commits: [],
      nextCursor: null,
      hasMore: false,
    }
    setStatus(null)
    setHistory([])
    setHistoryNextCursor(null)
    setHistoryHasMore(false)
    setError(null)
    setStatusLoading(true)
    setHistoryLoading(loadHistory)
    setHistoryLoadingMore(false)
    setOperation(
      spaceId ? (activeSpaceVersioningOperations.get(spaceId) ?? null) : null
    )
  }, [loadHistory, spaceId])

  const requireSpaceId = useCallback(() => {
    if (!spaceId) throw new Error("No active Space")
    return spaceId
  }, [spaceId])

  const refreshStatus = useCallback(async () => {
    const requestId = ++statusRequestRef.current
    if (!spaceId) {
      setStatus(null)
      setStatusLoading(false)
      return null
    }
    setStatusLoading(true)
    try {
      const raw = await requireSpaceVersioningBridge().getStatus(spaceId)
      const nextStatus = normalizeSpaceVersionStatus(raw)
      if (mountedRef.current && requestId === statusRequestRef.current) {
        setStatus(nextStatus)
        setError(null)
      }
      return nextStatus
    } catch (requestError) {
      if (mountedRef.current && requestId === statusRequestRef.current) {
        setError(errorFrom(requestError))
      }
      return null
    } finally {
      if (mountedRef.current && requestId === statusRequestRef.current) {
        setStatusLoading(false)
      }
    }
  }, [spaceId])

  const refreshHistory = useCallback(async () => {
    const requestId = ++historyRequestRef.current
    const generation = ++historyGenerationRef.current
    historyLoadMoreRequestRef.current += 1
    historyLoadMoreInFlightRef.current = false
    historyLoadedRef.current = true
    if (!spaceId) {
      applyHistorySnapshot({ commits: [], nextCursor: null, hasMore: false })
      setHistoryLoading(false)
      setHistoryLoadingMore(false)
      return []
    }
    historySnapshotRef.current = {
      commits: historySnapshotRef.current.commits,
      nextCursor: null,
      hasMore: false,
    }
    setHistoryNextCursor(null)
    setHistoryHasMore(false)
    setHistoryLoading(true)
    setHistoryLoadingMore(false)
    try {
      const raw = await requireSpaceVersioningBridge().getHistory(spaceId, {
        limit: historyLimit,
      })
      const page = normalizeSpaceVersionHistory(raw)
      const snapshot: HistorySnapshot = {
        commits: page.commits,
        nextCursor: page.hasMore ? page.nextCursor : null,
        hasMore: page.hasMore,
      }
      if (
        mountedRef.current &&
        requestId === historyRequestRef.current &&
        generation === historyGenerationRef.current
      ) {
        applyHistorySnapshot(snapshot)
        setError(null)
      }
      return snapshot.commits
    } catch (requestError) {
      if (
        mountedRef.current &&
        requestId === historyRequestRef.current &&
        generation === historyGenerationRef.current
      ) {
        setError(errorFrom(requestError))
      }
      return []
    } finally {
      if (
        mountedRef.current &&
        requestId === historyRequestRef.current &&
        generation === historyGenerationRef.current
      ) {
        setHistoryLoading(false)
      }
    }
  }, [applyHistorySnapshot, historyLimit, spaceId])

  const loadMoreHistory = useCallback(async () => {
    const current = historySnapshotRef.current
    if (
      !spaceId ||
      historyLoadMoreInFlightRef.current ||
      !current.hasMore ||
      !current.nextCursor
    ) {
      return current.commits
    }

    const cursor = current.nextCursor
    const generation = historyGenerationRef.current
    const requestId = ++historyLoadMoreRequestRef.current
    historyLoadMoreInFlightRef.current = true
    setHistoryLoadingMore(true)
    setError(null)

    try {
      const raw = await requireSpaceVersioningBridge().getHistory(spaceId, {
        limit: historyLimit,
        cursor,
      })
      const page = normalizeSpaceVersionHistory(raw)
      if (
        !mountedRef.current ||
        generation !== historyGenerationRef.current ||
        requestId !== historyLoadMoreRequestRef.current
      ) {
        return historySnapshotRef.current.commits
      }

      const nextCursor =
        page.hasMore && page.nextCursor !== cursor ? page.nextCursor : null
      const snapshot: HistorySnapshot = {
        commits: mergeCommits(historySnapshotRef.current.commits, page.commits),
        nextCursor,
        hasMore: nextCursor !== null,
      }
      applyHistorySnapshot(snapshot)
      return snapshot.commits
    } catch (requestError) {
      if (
        mountedRef.current &&
        generation === historyGenerationRef.current &&
        requestId === historyLoadMoreRequestRef.current
      ) {
        setError(errorFrom(requestError))
      }
      return historySnapshotRef.current.commits
    } finally {
      if (
        mountedRef.current &&
        generation === historyGenerationRef.current &&
        requestId === historyLoadMoreRequestRef.current
      ) {
        historyLoadMoreInFlightRef.current = false
        setHistoryLoadingMore(false)
      }
    }
  }, [applyHistorySnapshot, historyLimit, spaceId])

  const refresh = useCallback(async () => {
    const nextStatus = await refreshStatus()
    const shouldLoadHistory = loadHistory || historyLoadedRef.current
    if (shouldLoadHistory && nextStatus?.enabled) {
      await refreshHistory()
    } else if (shouldLoadHistory && mountedRef.current) {
      if (nextStatus && !nextStatus.enabled) {
        applyHistorySnapshot({
          commits: [],
          nextCursor: null,
          hasMore: false,
        })
      }
      setHistoryLoading(false)
      setHistoryLoadingMore(false)
    }
  }, [applyHistorySnapshot, loadHistory, refreshHistory, refreshStatus])

  const reconcileAfterPossibleMutation = useCallback(
    async (activeSpaceId: string) => {
      try {
        await refresh()
      } catch {
        // Reconciliation is best-effort and must never hide the mutation result.
      }
      try {
        announceSpaceVersioningChange(activeSpaceId, instanceTokenRef.current)
      } catch {
        // A failed notification must not replace the original mutation error.
      }
    },
    [refresh]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!spaceId || typeof window === "undefined") return
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      if (
        !isRecord(detail) ||
        detail.spaceId !== spaceId ||
        detail.source === instanceTokenRef.current
      ) {
        return
      }
      void refresh()
    }
    window.addEventListener(SPACE_VERSIONING_CHANGED_EVENT, listener)
    return () => {
      window.removeEventListener(SPACE_VERSIONING_CHANGED_EVENT, listener)
    }
  }, [refresh, spaceId])

  useEffect(() => {
    if (!spaceId || typeof window === "undefined") return
    setOperation(activeSpaceVersioningOperations.get(spaceId) ?? null)
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      if (!isRecord(detail) || detail.spaceId !== spaceId) return
      const nextOperation = detail.operation
      if (
        nextOperation === null ||
        nextOperation === "enabling" ||
        nextOperation === "committing" ||
        nextOperation === "staging" ||
        nextOperation === "discarding" ||
        nextOperation === "restoring" ||
        nextOperation === "configuring-remote" ||
        nextOperation === "fetching" ||
        nextOperation === "pulling" ||
        nextOperation === "pushing"
      ) {
        setOperation(nextOperation)
      }
    }
    window.addEventListener(SPACE_VERSIONING_OPERATION_EVENT, listener)
    return () => {
      window.removeEventListener(SPACE_VERSIONING_OPERATION_EVENT, listener)
    }
  }, [spaceId])

  useEffect(() => {
    if (!spaceId || typeof window === "undefined") return
    const eventBridge = (window as unknown as { eidos?: EidosEventBridge })
      .eidos
    if (!eventBridge?.on) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const listenerId = eventBridge.on("space-files:changed", (...args) => {
      let payload: UnknownRecord | undefined
      for (let index = args.length - 1; index >= 0; index -= 1) {
        const candidate = args[index]
        if (isRecord(candidate)) {
          payload = candidate
          break
        }
      }
      if (payload?.spaceId !== spaceId) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void refreshStatus(), 250)
    })
    return () => {
      if (timer) clearTimeout(timer)
      if (listenerId) eventBridge.off?.("space-files:changed", listenerId)
    }
  }, [refreshStatus, spaceId])

  const enable = useCallback(async () => {
    setError(null)
    let activeSpaceId: string | undefined
    let finishOperation: (() => void) | undefined
    try {
      activeSpaceId = requireSpaceId()
      finishOperation = beginSpaceVersioningOperation(activeSpaceId, "enabling")
      setOperation("enabling")
      if (!(await flushPendingFileWrites({ spaceId: activeSpaceId }))) {
        throw new Error(
          "Eidos could not save all pending file changes before enabling version history."
        )
      }
      await requireSpaceVersioningBridge().enable(activeSpaceId)
      await refresh()
      announceSpaceVersioningChange(activeSpaceId, instanceTokenRef.current)
    } catch (requestError) {
      const nextError = errorFrom(requestError)
      if (mountedRef.current) setError(nextError)
      throw nextError
    } finally {
      finishOperation?.()
      if (mountedRef.current) {
        setOperation(
          activeSpaceId
            ? (activeSpaceVersioningOperations.get(activeSpaceId) ?? null)
            : null
        )
      }
    }
  }, [refresh, requireSpaceId])

  const getRemotes = useCallback(async () => {
    const raw =
      await requireSpaceVersioningBridge().getRemotes(requireSpaceId())
    return normalizeSpaceVersionRemotes(raw)
  }, [requireSpaceId])

  const configureRemote = useCallback(
    async (request: SpaceVersionConfigureRemoteRequest) => {
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
      try {
        activeSpaceId = requireSpaceId()
        finishOperation = beginSpaceVersioningOperation(
          activeSpaceId,
          "configuring-remote"
        )
        setOperation("configuring-remote")
        const raw = await requireSpaceVersioningBridge().configureRemote(
          activeSpaceId,
          request
        )
        const payload = unwrapPayload(raw)
        if (!isRecord(payload) || payload.status === undefined) {
          throw new Error("Desktop returned an invalid remote configuration")
        }
        const nextStatus = normalizeSpaceVersionStatus(payload.status)
        statusRequestRef.current += 1
        if (mountedRef.current) {
          setStatus(nextStatus)
          setStatusLoading(false)
        }
        await reconcileAfterPossibleMutation(activeSpaceId)
        return nextStatus
      } catch (requestError) {
        const nextError = errorFrom(requestError)
        if (mountedRef.current) setError(nextError)
        throw nextError
      } finally {
        finishOperation?.()
        if (mountedRef.current) {
          setOperation(
            activeSpaceId
              ? (activeSpaceVersioningOperations.get(activeSpaceId) ?? null)
              : null
          )
        }
      }
    },
    [reconcileAfterPossibleMutation, requireSpaceId]
  )

  const removeRemote = useCallback(
    async (name = "origin") => {
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
      try {
        activeSpaceId = requireSpaceId()
        finishOperation = beginSpaceVersioningOperation(
          activeSpaceId,
          "configuring-remote"
        )
        setOperation("configuring-remote")
        const raw = await requireSpaceVersioningBridge().removeRemote(
          activeSpaceId,
          { name }
        )
        const payload = unwrapPayload(raw)
        if (!isRecord(payload) || payload.status === undefined) {
          throw new Error("Desktop returned an invalid remote removal result")
        }
        const nextStatus = normalizeSpaceVersionStatus(payload.status)
        statusRequestRef.current += 1
        if (mountedRef.current) {
          setStatus(nextStatus)
          setStatusLoading(false)
        }
        await reconcileAfterPossibleMutation(activeSpaceId)
        return nextStatus
      } catch (requestError) {
        const nextError = errorFrom(requestError)
        if (mountedRef.current) setError(nextError)
        throw nextError
      } finally {
        finishOperation?.()
        if (mountedRef.current) {
          setOperation(
            activeSpaceId
              ? (activeSpaceVersioningOperations.get(activeSpaceId) ?? null)
              : null
          )
        }
      }
    },
    [reconcileAfterPossibleMutation, requireSpaceId]
  )

  const syncRemote = useCallback(
    async (
      syncOperation: SpaceVersionSyncResult["operation"],
      request: SpaceVersionSyncRequest = {}
    ) => {
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
      try {
        activeSpaceId = requireSpaceId()
        const activeOperation: ActiveSpaceVersioningOperation =
          syncOperation === "fetch"
            ? "fetching"
            : syncOperation === "pull"
              ? "pulling"
              : "pushing"
        finishOperation = beginSpaceVersioningOperation(
          activeSpaceId,
          activeOperation
        )
        setOperation(activeOperation)
        if (
          syncOperation !== "fetch" &&
          !(await flushPendingFileWrites({ spaceId: activeSpaceId }))
        ) {
          throw new Error(
            `Eidos could not save all pending file changes before ${syncOperation}.`
          )
        }
        const bridge = requireSpaceVersioningBridge()
        const raw =
          syncOperation === "fetch"
            ? await bridge.fetchRemote(activeSpaceId, request)
            : syncOperation === "pull"
              ? await bridge.pullRemote(activeSpaceId, request)
              : await bridge.pushRemote(activeSpaceId, request)
        const result = normalizeSpaceVersionSyncResult(raw)
        statusRequestRef.current += 1
        if (mountedRef.current) {
          setStatus(result.status)
          setStatusLoading(false)
        }
        await reconcileAfterPossibleMutation(activeSpaceId)
        return result
      } catch (requestError) {
        const nextError = errorFrom(requestError)
        if (activeSpaceId) {
          await reconcileAfterPossibleMutation(activeSpaceId)
        }
        if (mountedRef.current) setError(nextError)
        throw nextError
      } finally {
        finishOperation?.()
        if (mountedRef.current) {
          setOperation(
            activeSpaceId
              ? (activeSpaceVersioningOperations.get(activeSpaceId) ?? null)
              : null
          )
        }
      }
    },
    [reconcileAfterPossibleMutation, requireSpaceId]
  )

  const fetchRemote = useCallback(
    (request: SpaceVersionSyncRequest = {}) => syncRemote("fetch", request),
    [syncRemote]
  )
  const pullRemote = useCallback(
    (request: SpaceVersionSyncRequest = {}) => syncRemote("pull", request),
    [syncRemote]
  )
  const pushRemote = useCallback(
    (request: SpaceVersionSyncRequest = {}) => syncRemote("push", request),
    [syncRemote]
  )

  const commit = useCallback(
    async (message: string) => {
      const normalizedMessage = message.trim()
      if (!normalizedMessage) throw new Error("Enter a version message")
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
      try {
        activeSpaceId = requireSpaceId()
        finishOperation = beginSpaceVersioningOperation(
          activeSpaceId,
          "committing"
        )
        setOperation("committing")
        if (!(await flushPendingFileWrites({ spaceId: activeSpaceId }))) {
          throw new Error(
            "Eidos could not save all pending file changes before creating this version."
          )
        }
        const raw = await requireSpaceVersioningBridge().commit(activeSpaceId, {
          message: normalizedMessage,
        })
        await refresh()
        announceSpaceVersioningChange(activeSpaceId, instanceTokenRef.current)
        return normalizeSpaceVersionCommit(raw)
      } catch (requestError) {
        const nextError = errorFrom(requestError)
        if (mountedRef.current) setError(nextError)
        throw nextError
      } finally {
        finishOperation?.()
        if (mountedRef.current) {
          setOperation(
            activeSpaceId
              ? (activeSpaceVersioningOperations.get(activeSpaceId) ?? null)
              : null
          )
        }
      }
    },
    [refresh, requireSpaceId]
  )

  const getCommit = useCallback(
    async (commitId: string) => {
      const raw = await requireSpaceVersioningBridge().getCommit(
        requireSpaceId(),
        commitId
      )
      return normalizeSpaceVersionCommit(raw, commitId)
    },
    [requireSpaceId]
  )

  const getDiff = useCallback(
    async (request: SpaceVersionDiffRequest) => {
      const raw = await requireSpaceVersioningBridge().getDiff(
        requireSpaceId(),
        request
      )
      return normalizeSpaceVersionDiff(raw)
    },
    [requireSpaceId]
  )

  const stagePath = useCallback(
    async (request: SpaceVersionStagePathRequest) => {
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
      let bridgeInvoked = false
      try {
        activeSpaceId = requireSpaceId()
        finishOperation = beginSpaceVersioningOperation(
          activeSpaceId,
          "staging"
        )
        setOperation("staging")
        if (
          !(await flushPendingFileWrites({
            spaceId: activeSpaceId,
            path: request.path,
          }))
        ) {
          throw new Error(
            "Eidos could not save pending edits for this file before including it."
          )
        }
        const bridge = requireSpaceVersioningBridge()
        bridgeInvoked = true
        const raw = await bridge.stagePath(activeSpaceId, request)
        const result = normalizeSpaceVersionStagePathResult(raw)
        statusRequestRef.current += 1
        if (mountedRef.current) {
          setStatus(result.status)
          setStatusLoading(false)
        }
        await reconcileAfterPossibleMutation(activeSpaceId)
        return result
      } catch (requestError) {
        const nextError = errorFrom(requestError)
        if (activeSpaceId && bridgeInvoked) {
          await reconcileAfterPossibleMutation(activeSpaceId)
        }
        if (mountedRef.current) setError(nextError)
        throw nextError
      } finally {
        finishOperation?.()
        if (mountedRef.current) {
          setOperation(
            activeSpaceId
              ? (activeSpaceVersioningOperations.get(activeSpaceId) ?? null)
              : null
          )
        }
      }
    },
    [reconcileAfterPossibleMutation, requireSpaceId]
  )

  const unstagePath = useCallback(
    async (request: SpaceVersionUnstagePathRequest) => {
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
      let bridgeInvoked = false
      try {
        activeSpaceId = requireSpaceId()
        finishOperation = beginSpaceVersioningOperation(
          activeSpaceId,
          "staging"
        )
        setOperation("staging")
        const bridge = requireSpaceVersioningBridge()
        bridgeInvoked = true
        const raw = await bridge.unstagePath(activeSpaceId, request)
        const result = normalizeSpaceVersionStagePathResult(raw)
        statusRequestRef.current += 1
        if (mountedRef.current) {
          setStatus(result.status)
          setStatusLoading(false)
        }
        await reconcileAfterPossibleMutation(activeSpaceId)
        return result
      } catch (requestError) {
        const nextError = errorFrom(requestError)
        if (activeSpaceId && bridgeInvoked) {
          await reconcileAfterPossibleMutation(activeSpaceId)
        }
        if (mountedRef.current) setError(nextError)
        throw nextError
      } finally {
        finishOperation?.()
        if (mountedRef.current) {
          setOperation(
            activeSpaceId
              ? (activeSpaceVersioningOperations.get(activeSpaceId) ?? null)
              : null
          )
        }
      }
    },
    [reconcileAfterPossibleMutation, requireSpaceId]
  )

  const discardPath = useCallback(
    async (request: SpaceVersionDiscardPathRequest) => {
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
      let bridgeInvoked = false
      try {
        activeSpaceId = requireSpaceId()
        finishOperation = beginSpaceVersioningOperation(
          activeSpaceId,
          "discarding"
        )
        setOperation("discarding")
        if (
          !(await flushPendingFileWrites({
            spaceId: activeSpaceId,
            path: request.path,
          }))
        ) {
          throw new Error(
            "Eidos could not save pending edits for this file before discarding it."
          )
        }
        const bridge = requireSpaceVersioningBridge()
        bridgeInvoked = true
        const raw = await bridge.discardPath(activeSpaceId, request)
        const result = normalizeSpaceVersionDiscardPathResult(raw)
        statusRequestRef.current += 1
        if (mountedRef.current) {
          setStatus(result.status)
          setStatusLoading(false)
        }
        await reconcileAfterPossibleMutation(activeSpaceId)
        return result
      } catch (requestError) {
        const nextError = errorFrom(requestError)
        if (activeSpaceId && bridgeInvoked) {
          await reconcileAfterPossibleMutation(activeSpaceId)
        }
        if (mountedRef.current) setError(nextError)
        throw nextError
      } finally {
        finishOperation?.()
        if (mountedRef.current) {
          setOperation(
            activeSpaceId
              ? (activeSpaceVersioningOperations.get(activeSpaceId) ?? null)
              : null
          )
        }
      }
    },
    [reconcileAfterPossibleMutation, requireSpaceId]
  )

  const restorePath = useCallback(
    async (request: SpaceVersionRestorePathRequest) => {
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
      let bridgeInvoked = false
      try {
        activeSpaceId = requireSpaceId()
        finishOperation = beginSpaceVersioningOperation(
          activeSpaceId,
          "restoring"
        )
        setOperation("restoring")
        if (
          !(await flushPendingFileWrites({
            spaceId: activeSpaceId,
            path: request.path,
          }))
        ) {
          throw new Error(
            "Eidos could not save pending edits for this file before restoring it."
          )
        }
        const bridge = requireSpaceVersioningBridge()
        bridgeInvoked = true
        const raw = await bridge.restorePath(activeSpaceId, request)
        const result = normalizeSpaceVersionRestorePathResult(raw)
        statusRequestRef.current += 1
        if (mountedRef.current) {
          setStatus(result.status)
          setStatusLoading(false)
        }
        await reconcileAfterPossibleMutation(activeSpaceId)
        return result
      } catch (requestError) {
        const nextError = errorFrom(requestError)
        if (activeSpaceId && bridgeInvoked) {
          await reconcileAfterPossibleMutation(activeSpaceId)
        }
        if (mountedRef.current) setError(nextError)
        throw nextError
      } finally {
        finishOperation?.()
        if (mountedRef.current) {
          setOperation(
            activeSpaceId
              ? (activeSpaceVersioningOperations.get(activeSpaceId) ?? null)
              : null
          )
        }
      }
    },
    [reconcileAfterPossibleMutation, requireSpaceId]
  )

  const restoreVersion = useCallback(
    async (request: SpaceVersionRestoreVersionRequest) => {
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
      let bridgeInvoked = false
      try {
        activeSpaceId = requireSpaceId()
        finishOperation = beginSpaceVersioningOperation(
          activeSpaceId,
          "restoring"
        )
        setOperation("restoring")
        if (!(await flushPendingFileWrites({ spaceId: activeSpaceId }))) {
          throw new Error(
            "Eidos could not save all pending file changes before restoring this Space."
          )
        }
        const bridge = requireSpaceVersioningBridge()
        bridgeInvoked = true
        const raw = await bridge.restoreVersion(activeSpaceId, request)
        const result = normalizeSpaceVersionRestoreVersionResult(raw)
        statusRequestRef.current += 1
        if (mountedRef.current) {
          setStatus(result.status)
          setStatusLoading(false)
        }
        await reconcileAfterPossibleMutation(activeSpaceId)
        return result
      } catch (requestError) {
        const nextError = errorFrom(requestError)
        if (activeSpaceId && bridgeInvoked) {
          await reconcileAfterPossibleMutation(activeSpaceId)
        }
        if (mountedRef.current) setError(nextError)
        throw nextError
      } finally {
        finishOperation?.()
        if (mountedRef.current) {
          setOperation(
            activeSpaceId
              ? (activeSpaceVersioningOperations.get(activeSpaceId) ?? null)
              : null
          )
        }
      }
    },
    [reconcileAfterPossibleMutation, requireSpaceId]
  )

  return {
    status,
    history,
    historyNextCursor,
    historyHasMore,
    statusLoading,
    historyLoading,
    historyLoadingMore,
    operation,
    error,
    available: getSpaceVersioningBridge() !== null,
    enable,
    getRemotes,
    configureRemote,
    removeRemote,
    fetchRemote,
    pullRemote,
    pushRemote,
    commit,
    getCommit,
    getDiff,
    stagePath,
    unstagePath,
    discardPath,
    restorePath,
    restoreVersion,
    refresh,
    refreshStatus,
    refreshHistory,
    loadMoreHistory,
  }
}
