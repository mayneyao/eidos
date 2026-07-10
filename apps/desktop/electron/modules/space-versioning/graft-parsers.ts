import type {
  SpaceVersionChangeKind,
  SpaceVersionCommit,
  SpaceVersionCommitResult,
  SpaceVersionDiff,
  SpaceVersionPathChange,
  SpaceVersionPathKind,
  SpaceVersionPathState,
  SpaceVersionPathStatus,
  SpaceVersionPathStorage,
  SpaceVersionStatus,
  SpaceVersionStatusCounts,
  SpaceVersionTextContentDiff,
  SpaceVersionTextContentState,
} from "./types"

type JsonObject = Record<string, unknown>

export interface ParsedGraftLog {
  currentHead: string | null
  currentBranch: string | null
  commits: SpaceVersionCommit[]
}

export interface ParsedGraftRestoreSource {
  revision: string
  path: string
  change: SpaceVersionChangeKind
  kind: SpaceVersionPathKind
  storage: SpaceVersionPathStorage
  containsPath: boolean
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : []
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function requiredString(value: unknown, label: string): string {
  const result = stringValue(value)
  if (!result) {
    throw new Error(`Graft text diff ${label} is missing`)
  }
  return result
}

function pathKind(value: unknown): SpaceVersionPathKind {
  switch (value) {
    case "sqlite_database":
    case "text_file":
    case "binary_file":
      return value
    default:
      return "unknown"
  }
}

function pathStorage(value: unknown): SpaceVersionPathStorage {
  switch (value) {
    case "sqlite_snapshot":
    case "inline":
    case "external":
      return value
    default:
      return "unknown"
  }
}

function pathState(value: unknown): SpaceVersionPathState {
  switch (value) {
    case "none":
    case "added":
    case "modified":
    case "deleted":
    case "untracked":
    case "conflicted":
      return value
    case "unmerged":
      return "conflicted"
    default:
      return "unknown"
  }
}

function changeKind(value: unknown): SpaceVersionChangeKind {
  switch (value) {
    case "added":
    case "modified":
    case "deleted":
    case "renamed":
      return value
    default:
      return "unknown"
  }
}

function textContentState(
  value: unknown,
  label: "before" | "after"
): SpaceVersionTextContentState {
  if (!isObject(value)) {
    throw new Error(`Graft text diff ${label} content is invalid`)
  }
  if (value.state === "absent") {
    return { state: "absent" }
  }
  const size = nonNegativeInteger(value.size)
  const contentHash = stringValue(value.content_hash)
  if (size === null || !contentHash) {
    throw new Error(`Graft text diff ${label} metadata is invalid`)
  }
  if (value.state === "utf8") {
    if (typeof value.content !== "string") {
      throw new Error(`Graft text diff ${label} content is missing`)
    }
    return { state: "utf8", content: value.content, size, contentHash }
  }
  if (
    value.state === "too_large" ||
    value.state === "missing_payload" ||
    value.state === "invalid_utf8"
  ) {
    return { state: value.state, size, contentHash }
  }
  throw new Error(`Graft text diff ${label} state is invalid`)
}

function textContentDiff(value: unknown): SpaceVersionTextContentDiff | null {
  if (value === undefined || value === null) {
    return null
  }
  if (!isObject(value)) {
    throw new Error("Graft returned invalid text diff content")
  }
  if (value.kind !== "text_file") {
    throw new Error("Graft text diff content is not a text file")
  }
  return {
    path: requiredString(value.path, "path"),
    change: changeKind(value.change),
    kind: "text_file",
    storage: pathStorage(value.storage),
    before: textContentState(value.before, "before"),
    after: textContentState(value.after, "after"),
  }
}

function branchFromPayload(payload: JsonObject): string | null {
  const currentBranch = stringValue(payload.current_branch)
  if (currentBranch) {
    return currentBranch
  }

  const branch = stringValue(payload.branch)
  if (branch) {
    return branch
  }

  const head = isObject(payload.head) ? payload.head : null
  return head?.type === "branch" ? stringValue(head.name) : null
}

function headFromPayload(payload: JsonObject): string | null {
  const currentHead = stringValue(payload.current_head)
  if (currentHead) {
    return currentHead
  }

  const headValue = stringValue(payload.head)
  if (headValue) {
    return headValue
  }

  const headTarget = stringValue(payload.head_target)
  if (headTarget) {
    return headTarget
  }

  const head = isObject(payload.head) ? payload.head : null
  return head?.type === "detached" ? stringValue(head.commit) : null
}

interface MutableStatusPath {
  path: string
  kind: SpaceVersionPathKind
  storage: SpaceVersionPathStorage
  indexState: SpaceVersionPathState
  worktreeState: SpaceVersionPathState
  code: string | null
  staged: boolean
  conflicted: boolean
}

function emptyStatusPath(path: string): MutableStatusPath {
  return {
    path,
    kind: "unknown",
    storage: "unknown",
    indexState: "none",
    worktreeState: "none",
    code: null,
    staged: false,
    conflicted: false,
  }
}

function mergeStatusChange(
  entries: Map<string, MutableStatusPath>,
  raw: JsonObject,
  area: "unstaged" | "staged" | "conflicted"
): void {
  const changedPath = stringValue(raw.path)
  if (!changedPath) {
    return
  }

  const entry = entries.get(changedPath) ?? emptyStatusPath(changedPath)
  const kind = pathKind(raw.kind)
  const storage = pathStorage(raw.storage)
  if (kind !== "unknown") {
    entry.kind = kind
  }
  if (storage !== "unknown") {
    entry.storage = storage
  }

  if (area === "unstaged") {
    entry.worktreeState = pathState(raw.change)
  } else if (area === "staged") {
    entry.indexState = pathState(raw.change)
    entry.staged = true
  } else {
    entry.conflicted = true
  }
  entries.set(changedPath, entry)
}

function statusPaths(payload: JsonObject): SpaceVersionPathStatus[] {
  const entries = new Map<string, MutableStatusPath>()

  for (const raw of objectArray(payload.paths)) {
    const changedPath = stringValue(raw.path)
    if (!changedPath) {
      continue
    }
    const indexState = pathState(raw.index_status)
    const worktreeState = pathState(raw.worktree_status)
    const conflicted =
      raw.conflicted === true ||
      indexState === "conflicted" ||
      worktreeState === "conflicted"
    entries.set(changedPath, {
      path: changedPath,
      kind: pathKind(raw.kind),
      storage: pathStorage(raw.storage),
      indexState,
      worktreeState,
      code: stringValue(raw.code),
      staged:
        indexState !== "none" &&
        indexState !== "unknown" &&
        indexState !== "conflicted",
      conflicted,
    })
  }

  for (const raw of objectArray(payload.unstaged_changes)) {
    mergeStatusChange(entries, raw, "unstaged")
  }
  for (const raw of objectArray(payload.staged_changes)) {
    mergeStatusChange(entries, raw, "staged")
  }
  for (const raw of objectArray(payload.conflicted_changes)) {
    mergeStatusChange(entries, raw, "conflicted")
  }

  return [...entries.values()]
    .map((entry): SpaceVersionPathStatus => {
      const state: Exclude<SpaceVersionPathState, "none"> = entry.conflicted
        ? "conflicted"
        : entry.worktreeState !== "none" && entry.worktreeState !== "unknown"
          ? entry.worktreeState
          : entry.indexState !== "none" && entry.indexState !== "unknown"
            ? entry.indexState
            : "unknown"
      return { ...entry, state }
    })
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    )
}

function statusCounts(
  payload: JsonObject,
  paths: SpaceVersionPathStatus[]
): SpaceVersionStatusCounts {
  const rawCounts = isObject(payload.counts) ? payload.counts : {}
  return {
    unstaged:
      nonNegativeInteger(rawCounts.unstaged) ??
      paths.filter(
        (entry) =>
          entry.worktreeState !== "none" && entry.worktreeState !== "unknown"
      ).length,
    staged:
      nonNegativeInteger(rawCounts.staged) ??
      paths.filter((entry) => entry.staged).length,
    conflicted:
      nonNegativeInteger(rawCounts.conflicted) ??
      paths.filter((entry) => entry.conflicted).length,
  }
}

export function disabledSpaceVersionStatus(
  spaceId: string
): SpaceVersionStatus {
  return {
    spaceId,
    enabled: false,
    currentHead: null,
    currentBranch: null,
    repositoryFormatVersion: null,
    dirty: false,
    hasUnstagedChanges: false,
    hasStagedChanges: false,
    hasConflicts: false,
    counts: { unstaged: 0, staged: 0, conflicted: 0 },
    paths: [],
  }
}

export function parseGraftStatus(
  raw: unknown,
  spaceId: string
): SpaceVersionStatus {
  if (!isObject(raw)) {
    throw new Error("Graft returned an invalid status response")
  }

  const paths = statusPaths(raw)
  const counts = statusCounts(raw, paths)
  const hasUnstagedChanges =
    typeof raw.has_unstaged_changes === "boolean"
      ? raw.has_unstaged_changes
      : counts.unstaged > 0
  const hasStagedChanges =
    typeof raw.has_staged_changes === "boolean"
      ? raw.has_staged_changes
      : counts.staged > 0
  const hasConflicts =
    typeof raw.has_conflicts === "boolean"
      ? raw.has_conflicts
      : counts.conflicted > 0

  return {
    spaceId,
    enabled: true,
    currentHead: headFromPayload(raw),
    currentBranch: branchFromPayload(raw),
    repositoryFormatVersion: nonNegativeInteger(raw.repository_format_version),
    dirty:
      typeof raw.work_in_progress === "boolean"
        ? raw.work_in_progress
        : hasUnstagedChanges || hasStagedChanges || hasConflicts,
    hasUnstagedChanges,
    hasStagedChanges,
    hasConflicts,
    counts,
    paths,
  }
}

function rawPathChanges(value: unknown): SpaceVersionPathChange[] {
  const changes: SpaceVersionPathChange[] = []
  for (const raw of objectArray(value)) {
    const changedPath = stringValue(raw.path)
    if (!changedPath) {
      continue
    }
    changes.push({
      path: changedPath,
      change: changeKind(raw.change),
      kind: pathKind(raw.kind),
      storage: pathStorage(raw.storage),
    })
  }
  return changes
}

function objectPathChanges(
  value: unknown,
  defaultKind: SpaceVersionPathKind,
  defaultStorage: SpaceVersionPathStorage
): SpaceVersionPathChange[] {
  if (!isObject(value)) {
    return []
  }

  return Object.entries(value).map(([changedPath, details]) => {
    const raw = isObject(details) ? details : {}
    const type = stringValue(raw.type)
    return {
      path: changedPath,
      change: "unknown",
      kind: pathKind(raw.kind) === "unknown" ? defaultKind : pathKind(raw.kind),
      storage:
        type === "large_file"
          ? "external"
          : pathStorage(raw.storage) === "unknown"
            ? defaultStorage
            : pathStorage(raw.storage),
    }
  })
}

function pathChanges(
  payload: JsonObject,
  fallback?: JsonObject
): SpaceVersionPathChange[] {
  const direct = rawPathChanges(payload.changes)
  const wrapper = fallback ? rawPathChanges(fallback.paths) : []
  const candidates = direct.length > 0 ? direct : wrapper
  const derived = [
    ...objectPathChanges(payload.files, "sqlite_database", "sqlite_snapshot"),
    ...objectPathChanges(payload.artifacts, "unknown", "inline"),
  ]
  const source = candidates.length > 0 ? candidates : derived
  const unique = new Map<string, SpaceVersionPathChange>()
  for (const change of source) {
    unique.set(change.path, change)
  }
  return [...unique.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  )
}

export function parseGraftCommit(raw: unknown): SpaceVersionCommit {
  if (!isObject(raw)) {
    throw new Error("Graft returned an invalid commit response")
  }

  const commit = isObject(raw.commit) ? raw.commit : raw
  const id = stringValue(commit.id)
  if (!id) {
    throw new Error("Graft commit response is missing an id")
  }

  const listedParents = stringArray(commit.parents)
  const legacyParent = stringValue(commit.parent)
  const parents =
    listedParents.length > 0
      ? listedParents
      : legacyParent
        ? [legacyParent]
        : []
  const changes = pathChanges(commit, raw === commit ? undefined : raw)

  return {
    id,
    parent: legacyParent ?? parents[0] ?? null,
    parents,
    tree: stringValue(commit.tree),
    message: stringValue(commit.message) ?? "",
    timestampMs: nonNegativeInteger(commit.timestamp_ms),
    changes,
    changedPaths: changes.length,
  }
}

export function parseGraftRestoreSource(
  raw: unknown,
  repositoryPath: string
): ParsedGraftRestoreSource {
  if (!isObject(raw)) {
    throw new Error("Graft returned an invalid restore source response")
  }

  const revision = stringValue(raw.id)
  if (!revision) {
    throw new Error("Graft restore source response is missing an id")
  }
  const files = isObject(raw.files) ? raw.files : null
  const artifacts = isObject(raw.artifacts) ? raw.artifacts : null
  if (!files && !artifacts) {
    throw new Error("Graft restore source response is missing its file tree")
  }

  const changedPath = rawPathChanges(raw.changes).find(
    (entry) => entry.path === repositoryPath
  )
  if (!changedPath) {
    throw new Error("The selected version did not change this path")
  }

  const containsFile = files
    ? Object.prototype.hasOwnProperty.call(files, repositoryPath)
    : false
  const containsArtifact = artifacts
    ? Object.prototype.hasOwnProperty.call(artifacts, repositoryPath)
    : false
  if (containsFile && containsArtifact) {
    throw new Error("Graft restore source contains duplicate file data")
  }
  const containsPath = containsFile || containsArtifact
  const artifact = containsArtifact ? artifacts?.[repositoryPath] : undefined
  const artifactDetails = isObject(artifact) ? artifact : {}
  const artifactType = stringValue(artifactDetails.type)
  const artifactKind = pathKind(artifactDetails.kind)
  const artifactStorage =
    artifactType === "large_file"
      ? "external"
      : pathStorage(artifactDetails.storage)

  return {
    revision,
    path: repositoryPath,
    change: changedPath.change,
    kind: containsFile
      ? "sqlite_database"
      : artifactKind === "unknown"
        ? changedPath.kind
        : artifactKind,
    storage: containsFile
      ? "sqlite_snapshot"
      : artifactStorage === "unknown"
        ? changedPath.storage
        : artifactStorage,
    containsPath,
  }
}

export function parseGraftCommitResult(raw: unknown): SpaceVersionCommitResult {
  if (!isObject(raw)) {
    throw new Error("Graft returned an invalid commit response")
  }

  const commit = parseGraftCommit(raw)
  return {
    currentHead: headFromPayload(raw) ?? commit.id,
    currentBranch: branchFromPayload(raw),
    commit,
  }
}

export function parseGraftLog(raw: unknown): ParsedGraftLog {
  if (Array.isArray(raw)) {
    return {
      currentHead: null,
      currentBranch: null,
      commits: raw.map(parseGraftCommit),
    }
  }
  if (!isObject(raw)) {
    throw new Error("Graft returned an invalid history response")
  }

  return {
    currentHead: headFromPayload(raw),
    currentBranch: branchFromPayload(raw),
    commits: Array.isArray(raw.commits)
      ? raw.commits.map(parseGraftCommit)
      : [],
  }
}

export function parseGraftDiff(
  raw: unknown,
  fallbackFrom: string,
  fallbackTo: string
): SpaceVersionDiff {
  if (!isObject(raw)) {
    throw new Error("Graft returned an invalid diff response")
  }

  let paths = rawPathChanges(raw.paths)
  if (paths.length === 0) {
    paths = [...rawPathChanges(raw.files), ...rawPathChanges(raw.artifacts)]
  }

  const unique = new Map<string, SpaceVersionPathChange>()
  for (const change of paths) {
    unique.set(change.path, change)
  }

  const content = textContentDiff(raw.content)
  if (content && !unique.has(content.path)) {
    throw new Error("Graft text diff path is missing from the comparison")
  }

  return {
    currentHead: headFromPayload(raw),
    currentBranch: branchFromPayload(raw),
    from: stringValue(raw.from) ?? fallbackFrom,
    to: stringValue(raw.to) ?? fallbackTo,
    paths: [...unique.values()].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    ),
    content,
  }
}
