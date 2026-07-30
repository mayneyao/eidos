import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { parse as parseToml, stringify as stringifyToml } from "smol-toml"

import type {
  GraftSpaceStatus,
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionFileDiff,
  SpaceVersionHistory,
  SpaceVersionPathChange,
  SpaceVersionRowChange,
  SpaceVersionTableDiff,
  SpaceVersionTableSummary,
  SpaceVersionTextContentDiff,
} from "../../shared/contracts"
import { resolveEidosLiteServiceEnvironment } from "../../shared/service-environment"
import type { GraftSdkTransport } from "./graft-sdk-transport"

const SDK_DIFF_PAGE_SIZE = 100
const SDK_PATH_BATCH_SIZE = 1_000
export const GRAFT_SDK_VERSION = "0.3.1"

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
  statusCacheHit?: boolean
  persistentSnapshotHit?: boolean
  persistentSnapshotSaved?: boolean
  stabilityRetries?: number
  verifiedPaths?: string[]
}

interface GraftStatusOptions {
  signal?: AbortSignal
  verifyPaths?: readonly string[]
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : []
}

function pathChange(value: unknown): SpaceVersionPathChange {
  const item = record(value)
  return {
    path: stringValue(item.path) ?? "",
    change: stringValue(item.change) ?? "modified",
    ...(stringValue(item.kind) ? { kind: stringValue(item.kind) } : {}),
    ...(stringValue(item.storage)
      ? { storage: stringValue(item.storage) }
      : {}),
  }
}

function rowChange(value: unknown): SpaceVersionRowChange {
  const item = record(value)
  return {
    op: stringValue(item.op) ?? "change",
    key: record(item.key),
    ...(Array.isArray(item.values) ? { values: item.values } : {}),
    ...(Array.isArray(item.old_values) ? { oldValues: item.old_values } : {}),
  }
}

function tableDiff(value: unknown): SpaceVersionTableDiff {
  const item = record(value)
  return {
    name: stringValue(item.name) ?? "Unknown table",
    columns: stringArray(item.columns),
    primaryKeyColumns: stringArray(item.primary_key_columns),
    changes: Array.isArray(item.changes) ? item.changes.map(rowChange) : [],
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
    tables: Array.isArray(item.tables) ? item.tables.map(tableDiff) : [],
  }
}

function versionDiff(value: unknown): SpaceVersionDiff {
  const item = record(value)
  return {
    currentHead: stringValue(item.current_head) ?? null,
    currentBranch: stringValue(item.current_branch) ?? null,
    from: stringValue(item.from) ?? null,
    to: stringValue(item.to) ?? null,
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
    parent: stringValue(item.parent) ?? parents[0] ?? null,
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
    return GRAFT_SDK_VERSION
  }

  hasOpenSession(): boolean {
    return this.openedRoot !== null
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
        ...(status.generation === undefined
          ? {}
          : { generation: status.generation }),
        ...(status.changeToken ? { changeToken: status.changeToken } : {}),
        ...(status.statusCacheHit === undefined
          ? {}
          : { statusCacheHit: status.statusCacheHit }),
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

  commit(root: string, message: string): Promise<unknown> {
    return this.runSdk(root, "commit", [message])
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
          change:
            stringValue(entry.change) ??
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
    const telemetry = record(response.telemetry)
    const status: GraftRepositoryStatus = {
      dirty: value.dirty === true,
      currentHead:
        stringValue(value.current_head) ??
        stringValue(value.head_target) ??
        null,
      currentBranch:
        stringValue(value.current_branch) ?? stringValue(head.name) ?? null,
      ahead: Math.max(
        0,
        Math.trunc(numberValue(value.ahead ?? upstream.ahead))
      ),
      behind: Math.max(
        0,
        Math.trunc(numberValue(value.behind ?? upstream.behind))
      ),
      hasConflicts:
        value.has_conflicts === true || numberValue(value.conflicted) > 0,
      changedPaths: changed.length,
      paths: changed,
      changes,
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
      from?: string | null
      to?: string | null
      root?: string | null
      signal?: AbortSignal
    } = {}
  ): Promise<SpaceVersionDiff> {
    return this.diffExplicitPaths(root, [relativePath], {
      rows: options.rows ?? true,
      signal: options.signal,
      ...(options.from ? { from: options.from } : {}),
      ...(options.to ? { to: options.to } : {}),
      ...(options.root ? { root: options.root } : {}),
    })
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
    maxBytes: number
  ): Promise<SpaceVersionTextContentDiff> {
    await this.open(root)
    return this.requireSdkTransport().revisionTextDiff({
      commitId,
      parentId,
      path: relativePath,
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
    return versionHistory({
      current_head: stringValue(metadata.current_head) ?? null,
      current_branch: stringValue(metadata.current_branch) ?? null,
      ...page,
    })
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
    options: { signal?: AbortSignal } = {}
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

  async remoteUrl(root: string, name = "origin"): Promise<string | null> {
    const value = record(await this.runSdk(root, "listRemotes"))
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

  push(root: string, token?: string): Promise<unknown> {
    return this.setHttpCredential(root, "origin", token).then(() =>
      this.runSdk(root, "push", [{ remote: "origin", branch: "main" }])
    )
  }

  fetch(root: string): Promise<unknown> {
    return this.runSdk(root, "fetch", [{ remote: "origin", branch: "main" }])
  }

  pull(root: string): Promise<unknown> {
    return this.runSdk(root, "pull", [{ remote: "origin", branch: "main" }])
  }

  clone(
    targetDirectory: string,
    remoteUrl: string,
    token?: string
  ): Promise<unknown> {
    return this.requireSdkTransport().clone(
      path.resolve(targetDirectory),
      remoteUrl,
      token
    )
  }

  async configureOfficialRemote(
    root: string,
    remoteUrl: string,
    token: string
  ): Promise<void> {
    if (!isOfficialRemoteUrl(remoteUrl, this.syncRemoteOrigin)) {
      throw new Error("Eidos Lite accepts only the official Eidos Sync Remote")
    }
    if (!token) throw new Error("An Eidos Sync access token is required")
    const existing = await this.remoteUrl(root)
    if (existing === null) {
      await this.runSdk(root, "configureRemote", [
        {
          name: "origin",
          url: remoteUrl,
          bearerToken: token,
          upstreamBranch: "main",
        },
      ])
    } else if (canonicalRemoteUrl(existing) !== canonicalRemoteUrl(remoteUrl)) {
      throw new Error(
        "This Space already has a different origin Remote. Eidos Lite will not overwrite it."
      )
    } else {
      await this.setHttpCredential(root, "origin", token)
    }
  }

  async clearHttpCredentials(root: string, name = "origin"): Promise<void> {
    await this.runSdk(root, "clearHttpBearerToken", [name])
  }

  async operationMaterializesWorktree(operation: string): Promise<boolean> {
    const root = this.openedRoot
    if (!root) throw new Error("Graft repository session is closed")
    const result = await this.runSdk(root, "operationMaterializesWorktree", [
      operation,
    ])
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
    options: { signal?: AbortSignal } = {}
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
            const relativePath = stringValue(item.path)
            if (relativePath) paths.add(relativePath)
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
    token?: string
  ): Promise<void> {
    if (!token) return
    await this.runSdk(root, "setHttpBearerToken", [name, token])
  }

  private requireSdkTransport(): GraftSdkTransport {
    if (!this.sdkTransport) {
      throw new Error("The Graft SDK session transport is unavailable")
    }
    return this.sdkTransport
  }
}
