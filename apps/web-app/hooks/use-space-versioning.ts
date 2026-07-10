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

export interface SpaceVersionDiff {
  currentHead: string | null
  currentBranch: string | null
  from: string | null
  to: string | null
  paths: SpaceVersionPathChange[]
  content: SpaceVersionTextContentDiff | null
}

export interface SpaceVersionDiffRequest {
  from: string
  to?: string
  path?: string
  includeContent?: boolean
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
  | "restoring"
  | null

interface SpaceVersioningBridge {
  getStatus: (spaceId: string) => Promise<unknown>
  enable: (spaceId: string) => Promise<unknown>
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

const activeSpaceVersioningOperations = new Map<
  string,
  ActiveSpaceVersioningOperation
>()

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
  const conflicted =
    asBoolean(value.conflicted) === true || status === "conflicted"
  return {
    path,
    status,
    ...(previousPath && previousPath !== path ? { previousPath } : {}),
    ...(staged ? { staged: true as const } : {}),
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
        nextOperation === "restoring"
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

  const restorePath = useCallback(
    async (request: SpaceVersionRestorePathRequest) => {
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
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
        const raw = await requireSpaceVersioningBridge().restorePath(
          activeSpaceId,
          request
        )
        const result = normalizeSpaceVersionRestorePathResult(raw)
        await refresh()
        announceSpaceVersioningChange(activeSpaceId, instanceTokenRef.current)
        return result
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

  const restoreVersion = useCallback(
    async (request: SpaceVersionRestoreVersionRequest) => {
      setError(null)
      let activeSpaceId: string | undefined
      let finishOperation: (() => void) | undefined
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
        const raw = await requireSpaceVersioningBridge().restoreVersion(
          activeSpaceId,
          request
        )
        const result = normalizeSpaceVersionRestoreVersionResult(raw)
        await refresh()
        announceSpaceVersioningChange(activeSpaceId, instanceTokenRef.current)
        return result
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
    commit,
    getCommit,
    getDiff,
    restorePath,
    restoreVersion,
    refresh,
    refreshStatus,
    refreshHistory,
    loadMoreHistory,
  }
}
