import { randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import type {
  EidosSystemMergeDomainConflict,
  FileEntry,
} from "@eidos.space/eidos-file"

import type {
  EidosFileIssue,
  EidosSyncMergeApplyRequest,
  EidosSyncMergeChoice,
  EidosSyncMergeConflictPage,
  EidosSyncMergeContent,
  EidosSyncMergePathFilter,
  EidosSyncMergePathPage,
  EidosSyncMergePlan,
  EidosSyncMergeSqliteDiff,
  EidosSyncMergeSqliteVersion,
  EidosSyncMergeStatus,
  EidosSyncOutcome,
  EidosSyncPhase,
  EidosSyncPreflight,
  EidosSyncPreflightApproval,
  GraftTrackedIgnoredPaths,
  GraftSpaceStatus,
  OpenEidosFileResult,
  RuntimeCalls,
  RuntimeMethod,
  SpaceSyncHistoryStatus,
  SpaceSnapshot,
  SpacePathMutationResult,
  SpacePathSearchHit,
  SpaceVersionDiff,
  SpaceVersionHistory,
  SpaceVersionPathChange,
  SpaceVersionTextContentDiff,
  SpaceWorkingChangesDiscardRequest,
  SpaceWorkingChangesDiscardResult,
  SpaceTreeEntry,
  TextFilePreviewResult,
  TextFileSaveRequest,
  TextFileSaveResult,
} from "../../shared/contracts"
import type { GraftTransferProgress } from "../../shared/graft-sdk-contracts"
import {
  EIDOS_LITE_VERSION_TEXT_DIFF_BYTES_MAX,
  RUNTIME_MUTATION_METHODS,
} from "../../shared/contracts"
import { eidosLiteNewFileKind } from "../../shared/new-file"
import type {
  GraftClient,
  GraftIgnoreInspection,
  GraftRepositoryStatus,
} from "../graft/graft-client"
import type { GraftMergePolicy } from "../../shared/graft-merge-contracts"
import {
  normalizeEidosTableDiff,
  readEidosPhysicalSchema,
} from "../graft/eidos-schema-diff"
import {
  classifyEidosFileIssue,
  EidosFileRuntimeError,
} from "../runtime/eidos-file-issue"
import { RuntimePool } from "../runtime/runtime-pool"
import {
  assertSyncPreflightApproval,
  createSyncPreflight,
} from "../sync/sync-preflight"
import { SpaceOperationGate } from "./operation-gate"
import { SpaceOperationJournal } from "./operation-journal"
import {
  eidosFileAssetDirectory,
  importEidosFileAttachmentData,
  importEidosFileAttachments,
  resolveEidosFileAttachment,
  type EidosFileAttachmentDataSource,
  type ImportedEidosFileAssets,
  type ResolvedEidosFileAsset,
} from "./eidos-file-attachments"
import {
  acquireEidosFileRemoteAsset,
  resolveEidosFileRemoteAsset,
  resolveEidosFileUrlImage,
  type ResolvedEidosFileUrlImage,
} from "./eidos-file-url-images"
import { SpaceRepositoryCoordinator } from "./repository-coordinator"
import {
  canonicalizeSpaceRoot,
  flattenSpaceTree,
  joinSpaceRelativePath,
  listSpaceDirectory,
  listSpaceTree,
  normalizeMutableRelativePath,
  normalizeSpaceEntryName,
  resolveSpaceDirectory,
  resolveSpacePath,
  type CanonicalSpace,
} from "./space-paths"
import { SpacePathIndex } from "./path-search"
import { SpaceWatcher } from "./space-watcher"
import { StableCheckpointScheduler } from "./stable-checkpoint-scheduler"
import { type SpaceSyncState, SpaceSyncStateStore } from "./sync-state"
import { readTextFilePreview, saveTextFile } from "./text-file-preview"
import { readWorkingTextContent } from "./working-text-reader"

const mutationMethods = new Set<RuntimeMethod>(RUNTIME_MUTATION_METHODS)
const csvOperationControlMethods = new Set<RuntimeMethod>([
  "getCsvOperationProgress",
  "cancelCsvOperation",
])
const versionReadKeys = [
  "version-changes",
  "version-history",
  "version-diff",
  "version-path-diff",
  "version-tracked-ignored",
  "version-text-diff",
] as const
type VersionReadKey = (typeof versionReadKeys)[number]
type SyncProgressReporter = (phase: EidosSyncPhase, detail: string) => void
type SyncTransferProgressReporter = (progress: GraftTransferProgress) => void
const BACKGROUND_GRAFT_STATUS_DELAY_MS =
  process.env.VITEST || process.env.EIDOS_LITE_SMOKE_RESULT ? 0 : 3_000
const BACKGROUND_GRAFT_IGNORE_DELAY_MS =
  process.env.VITEST || process.env.EIDOS_LITE_SMOKE_RESULT
    ? 0
    : BACKGROUND_GRAFT_STATUS_DELAY_MS + 250
const PENDING_EIDOS_FILE_ASSETS_PER_SESSION_MAX = 10_000
const EIDOS_FILE_METADATA_TABLES = [
  "eidos__features",
  "eidos__fields",
  "eidos__formula_fields",
  "eidos__lookup_fields",
  "eidos__meta",
  "eidos__relation_fields",
  "eidos__tables",
  "eidos__views",
] as const
const EIDOS_SYSTEM_MERGE_PROVIDER = "eidos.system-merge-1.0"
const DEFAULT_HOSTED_MERGE_MESSAGE = "Merge Hosted changes"
const EIDOS_SYSTEM_MERGE_CONFLICT_CODES = new Set([
  "identity-collision",
  "name-collision",
  "delete-update",
  "table-rename-conflict",
  "field-rename-conflict",
  "field-conversion-conflict",
  "option-catalog-conflict",
  "dependency-conflict",
  "feature-conflict",
  "unsupported-schema-change",
  "validation-failed",
])
const EIDOS_SYSTEM_MERGE_OBJECT_KINDS = new Set([
  "file",
  "table",
  "field",
  "view",
  "feature",
  "dependency",
])
const EIDOS_SYSTEM_MERGE_RESOLUTION_SCOPES = new Set([
  "object",
  "group",
  "schema",
  "dependency",
])

class AutomaticCheckpointSkipped extends Error {}

function semanticDomainConflict(
  value: unknown
): EidosSystemMergeDomainConflict | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const conflict = value as Record<string, unknown>
  const summary = (candidate: unknown) =>
    Boolean(
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      ["absent", "present"].includes(
        String((candidate as Record<string, unknown>).state)
      )
    )
  if (
    typeof conflict.code !== "string" ||
    !EIDOS_SYSTEM_MERGE_CONFLICT_CODES.has(conflict.code) ||
    typeof conflict.objectKind !== "string" ||
    !EIDOS_SYSTEM_MERGE_OBJECT_KINDS.has(conflict.objectKind) ||
    typeof conflict.objectId !== "string" ||
    typeof conflict.group !== "string" ||
    typeof conflict.message !== "string" ||
    typeof conflict.resolutionScope !== "string" ||
    !EIDOS_SYSTEM_MERGE_RESOLUTION_SCOPES.has(conflict.resolutionScope) ||
    !summary(conflict.base) ||
    !summary(conflict.ours) ||
    !summary(conflict.theirs)
  ) {
    return null
  }
  return conflict as unknown as EidosSystemMergeDomainConflict
}

function repositorySyncState(relation: {
  ahead: number
  behind: number
  sync?: SpaceSyncHistoryStatus
}): SpaceSyncHistoryStatus["state"] {
  if (relation.sync) return relation.sync.state
  if (relation.ahead > 0 && relation.behind > 0) return "diverged"
  if (relation.ahead > 0) return "ahead"
  if (relation.behind > 0) return "behind"
  return "unknown"
}

function pathMatchesWorkingChangeTarget(
  relativePath: string,
  request: SpaceWorkingChangesDiscardRequest
): boolean {
  if (request.target.kind === "file") {
    return relativePath === request.target.path
  }
  return relativePath.startsWith(`${request.target.path}/`)
}

function workingChangeMatchesTarget(
  change: SpaceVersionPathChange,
  request: SpaceWorkingChangesDiscardRequest
): boolean {
  return (
    pathMatchesWorkingChangeTarget(change.path, request) ||
    (change.previousPath
      ? pathMatchesWorkingChangeTarget(change.previousPath, request)
      : false)
  )
}

function isAddedWorkingChange(change: SpaceVersionPathChange): boolean {
  return ["added", "created", "new", "untracked"].includes(
    change.change.toLowerCase()
  )
}

interface CompletedCheckpoint {
  currentHead: string
  previousStatus: GraftSpaceStatus
}

export class SpaceSession {
  readonly runtimePool: RuntimePool
  readonly gate: SpaceOperationGate
  private readonly watcher: SpaceWatcher
  private readonly pathIndex: SpacePathIndex
  private readonly repository: SpaceRepositoryCoordinator
  private readonly checkpointScheduler: StableCheckpointScheduler
  private readonly syncState: SpaceSyncStateStore
  private readonly changeListeners = new Set<
    (snapshot: SpaceSnapshot) => void
  >()
  private readonly automaticCheckpointListeners = new Set<
    (snapshot: SpaceSnapshot) => void
  >()
  private readonly fileIssuesByPath = new Map<string, EidosFileIssue>()
  private readonly ignoreInspectionCache = new Map<
    string,
    GraftIgnoreInspection
  >()
  private readonly ignoreReconciliationTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >()
  private readonly backgroundIgnoreKeys = new Set<string>()
  private readonly directoryEntriesCache = new Map<string, SpaceTreeEntry[]>()
  private readonly pendingEidosFileAssets = new Map<
    string,
    Map<string, FileEntry>
  >()
  private graftStatusCache: GraftSpaceStatus | null = null
  private lastKnownGraftStatus: GraftSpaceStatus | null = null
  private syncHistoryState: SpaceSyncState | null = null
  private graftStatusEpoch = 0
  private graftStatusRefresh: {
    epoch: number
    authoritative: boolean
    promise: Promise<GraftSpaceStatus>
  } | null = null
  private graftStatusTimer: NodeJS.Timeout | null = null
  private refreshInFlight: Promise<SpaceSnapshot> | null = null
  private closeInFlight: Promise<void> | null = null
  private versioningEnabled = false
  private automaticCheckpointsEnabled: boolean
  private closed = false

  private constructor(
    readonly canonical: CanonicalSpace,
    private readonly graft: GraftClient,
    stateDirectory: string,
    workerPath?: string,
    automaticCheckpointsEnabled = false
  ) {
    this.automaticCheckpointsEnabled = automaticCheckpointsEnabled
    this.runtimePool = new RuntimePool(canonical.root, workerPath)
    this.pathIndex = new SpacePathIndex(canonical.root)
    this.repository = new SpaceRepositoryCoordinator()
    this.syncState = new SpaceSyncStateStore(
      stateDirectory,
      graft.syncRemoteOrigin
    )
    this.gate = new SpaceOperationGate(
      new SpaceOperationJournal(stateDirectory),
      {
        closeRuntimes: () => this.runtimePool.closeHandles(),
        validateWorktree: (relativePaths) =>
          this.validateMaterializedWorktree(relativePaths),
        reopenRuntimes: () => this.runtimePool.reopenHandles(),
      },
      this.repository
    )
    this.checkpointScheduler = new StableCheckpointScheduler({
      run: () => this.createAutomaticCheckpoint(),
      onError: (error) =>
        console.warn("Could not create an automatic Space checkpoint", error),
      ...(process.env.EIDOS_LITE_SMOKE_RESULT ? { quietMs: 5_000 } : {}),
    })
    this.watcher = new SpaceWatcher(
      canonical.root,
      (relativePaths) => {
        void this.pathIndex.applyChanges(relativePaths).catch(() => undefined)
        const directoriesToRefresh =
          this.invalidateDirectoryCaches(relativePaths)
        this.invalidateGraftStatusCache()
        if (this.versioningEnabled && this.automaticCheckpointsEnabled) {
          this.checkpointScheduler.notifyStableChange()
        }
        void this.refreshAndEmit(true, directoriesToRefresh)
      },
      150,
      async (relativePaths) => {
        if (this.gate.hasActiveMutations()) return new Set()
        const ignored = await this.inspectIgnores(relativePaths, "background")
        return new Set(
          [...ignored.entries()]
            .filter(([, inspection]) => this.shouldPruneIgnored(inspection))
            .map(([relativePath]) => relativePath)
        )
      }
    )
    this.gate.subscribe(() => {
      this.emitCachedOperationSnapshot()
    })
  }

  static async create(
    root: string,
    userDataDirectory: string,
    options: {
      graft: GraftClient
      workerPath?: string
      automaticCheckpointsEnabled?: boolean
    }
  ): Promise<SpaceSession> {
    const canonical = await canonicalizeSpaceRoot(root)
    return this.createCanonical(canonical, userDataDirectory, options)
  }

  static async createCanonical(
    canonical: CanonicalSpace,
    userDataDirectory: string,
    options: {
      graft: GraftClient
      workerPath?: string
      automaticCheckpointsEnabled?: boolean
    }
  ): Promise<SpaceSession> {
    const session = new SpaceSession(
      canonical,
      options.graft,
      path.join(userDataDirectory, "spaces", canonical.id),
      options.workerPath,
      options.automaticCheckpointsEnabled
    )
    try {
      await session.gate.recoverInterruptedOperation()
      session.versioningEnabled = await fs
        .stat(path.join(canonical.root, ".graft"))
        .then((stats) => stats.isDirectory())
        .catch(() => false)
      session.syncHistoryState = await session.syncState
        .read()
        .catch(() => null)
      session.watcher.start()
      void session.pathIndex.ensureScanned().catch(() => undefined)
      return session
    } catch (error) {
      await session.close().catch(() => undefined)
      throw error
    }
  }

  onChanged(listener: (snapshot: SpaceSnapshot) => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  onAutomaticCheckpoint(
    listener: (snapshot: SpaceSnapshot) => void
  ): () => void {
    this.automaticCheckpointListeners.add(listener)
    return () => this.automaticCheckpointListeners.delete(listener)
  }

  setAutomaticCheckpointsEnabled(enabled: boolean): void {
    this.automaticCheckpointsEnabled = enabled
    if (!enabled) this.checkpointScheduler.cancelPending()
  }

  snapshot(): Promise<SpaceSnapshot> {
    if (this.closed) return Promise.reject(new Error("Space is closed"))
    if (this.refreshInFlight) return this.refreshInFlight
    this.refreshInFlight = this.readSnapshot(true).finally(() => {
      this.refreshInFlight = null
    })
    return this.refreshInFlight
  }

  async searchPaths(
    query: string,
    limit?: number
  ): Promise<SpacePathSearchHit[]> {
    if (this.closed) throw new Error("Space is closed")
    await this.pathIndex.ensureScanned()
    return this.pathIndex.search(query, limit)
  }

  async refresh(): Promise<SpaceSnapshot> {
    const loadedDirectories = [...this.directoryEntriesCache.keys()]
    this.invalidateSnapshotCaches()
    const authoritativeGraftStatus = await this.refreshGraftStatus(true)
    await this.reloadDirectoryEntries(loadedDirectories, true)
    return this.readSnapshot(false, authoritativeGraftStatus)
  }

  async refreshExplorer(): Promise<SpaceSnapshot> {
    this.prioritizeLocalWork()
    const loadedDirectories = [...this.directoryEntriesCache.keys()]
    this.directoryEntriesCache.clear()
    await this.reloadDirectoryEntries(loadedDirectories, false)
    const snapshot = await this.readSnapshot(true)
    for (const listener of this.changeListeners) listener(snapshot)
    return snapshot
  }

  async loadDirectory(relativePath: string): Promise<SpaceSnapshot> {
    this.prioritizeLocalWork()
    const normalized = normalizeMutableRelativePath(relativePath)
    // Explorer navigation is a local filesystem operation. Ignore filtering is
    // version metadata and must never put Graft on the navigation critical path.
    await this.loadDirectoryEntries(normalized, false)
    const snapshot = this.buildSnapshot(
      this.buildCachedTree(),
      this.graftStatusCache ?? this.pendingGraftStatus()
    )
    for (const listener of this.changeListeners) listener(snapshot)
    this.scheduleGraftStatusRefresh()
    return snapshot
  }

  async openEidosFile(relativePath: string): Promise<OpenEidosFileResult> {
    this.assertRuntimeAvailable()
    this.prioritizeLocalWork()
    try {
      await this.ensureAncestorDirectoriesLoaded(relativePath)
      const opened = await this.runtimePool.open(relativePath)
      this.fileIssuesByPath.delete(relativePath)
      this.invalidateGraftStatusCache()
      this.scheduleGraftStatusRefresh()
      return opened
    } catch (error) {
      const issue =
        error instanceof EidosFileRuntimeError
          ? error.issue
          : classifyEidosFileIssue(relativePath, error)
      this.fileIssuesByPath.set(relativePath, issue)
      this.scheduleGraftStatusRefresh()
      throw new EidosFileRuntimeError(issue)
    }
  }

  async previewTextFile(relativePath: string): Promise<TextFilePreviewResult> {
    this.prioritizeLocalWork()
    try {
      return await readTextFilePreview(this.canonical.root, relativePath)
    } finally {
      this.scheduleGraftStatusRefresh()
    }
  }

  async saveTextFile(
    request: TextFileSaveRequest
  ): Promise<TextFileSaveResult> {
    this.prioritizeLocalWork()
    const result = await this.gate.withMutation(() =>
      saveTextFile(this.canonical.root, request)
    )
    if (result.status === "saved") {
      this.noteLocalChange()
      await this.freshSnapshotAndEmit()
    } else {
      this.scheduleGraftStatusRefresh()
    }
    return result
  }

  async inspectEidosFileIssue(
    relativePath: string
  ): Promise<EidosFileIssue | null> {
    const remembered = this.fileIssuesByPath.get(relativePath)
    if (remembered) return remembered
    return this.runtimePool.inspectPath(relativePath)
  }

  async createEidosFile(
    parentRelativePath: string | null,
    requestedName: string
  ): Promise<SpacePathMutationResult> {
    this.prioritizeLocalWork()
    const safeName = normalizeSpaceEntryName(requestedName)
    const name = safeName.toLowerCase().endsWith(".eidos")
      ? safeName
      : `${safeName}.eidos`
    const relativePath = joinSpaceRelativePath(parentRelativePath, name)
    await resolveSpaceDirectory(this.canonical.root, parentRelativePath)
    await this.requireMissingPath(relativePath)
    await this.gate.withMutation(async () => {
      await this.runtimePool.create(relativePath, path.basename(name, ".eidos"))
    })
    this.noteLocalChange()
    return {
      snapshot: await this.freshSnapshotAndEmit(),
      relativePath,
      invalidatedSessionIds: [],
    }
  }

  async createTextFile(
    parentRelativePath: string | null,
    requestedName: string
  ): Promise<SpacePathMutationResult> {
    this.prioritizeLocalWork()
    const name = normalizeSpaceEntryName(requestedName)
    if (eidosLiteNewFileKind(name) !== "text") {
      throw new Error("New text files require a non-.eidos file extension")
    }
    const relativePath = joinSpaceRelativePath(parentRelativePath, name)
    await resolveSpaceDirectory(this.canonical.root, parentRelativePath)
    await this.requireMissingPath(relativePath)
    await this.gate.withMutation(() =>
      fs.writeFile(this.resolveUserPath(relativePath), "", {
        encoding: "utf8",
        flag: "wx",
      })
    )
    this.noteLocalChange()
    return {
      snapshot: await this.freshSnapshotAndEmit(),
      relativePath,
      invalidatedSessionIds: [],
    }
  }

  async createFolder(
    parentRelativePath: string | null,
    requestedName: string
  ): Promise<SpacePathMutationResult> {
    this.prioritizeLocalWork()
    const name = normalizeSpaceEntryName(requestedName)
    const relativePath = joinSpaceRelativePath(parentRelativePath, name)
    await resolveSpaceDirectory(this.canonical.root, parentRelativePath)
    await this.requireMissingPath(relativePath)
    await this.gate.withMutation(() =>
      fs.mkdir(this.resolveUserPath(relativePath))
    )
    this.noteLocalChange()
    return {
      snapshot: await this.freshSnapshotAndEmit(),
      relativePath,
      invalidatedSessionIds: [],
    }
  }

  async renamePath(
    relativePath: string,
    requestedName: string
  ): Promise<SpacePathMutationResult> {
    this.prioritizeLocalWork()
    const source = normalizeMutableRelativePath(relativePath)
    await fs.lstat(this.resolveUserPath(source))
    const name = normalizeSpaceEntryName(requestedName)
    if (
      path.extname(source).toLowerCase() === ".eidos" &&
      path.extname(name).toLowerCase() !== ".eidos"
    ) {
      throw new Error("An Eidos File must keep its .eidos extension")
    }
    const parent = path.posix.dirname(source)
    const target = joinSpaceRelativePath(parent === "." ? null : parent, name)
    if (target === source) {
      return {
        snapshot: await this.snapshot(),
        relativePath: source,
        invalidatedSessionIds: [],
      }
    }
    await resolveSpaceDirectory(
      this.canonical.root,
      parent === "." ? null : parent
    )
    await this.requireMissingPath(target)
    let invalidatedSessionIds: string[] = []
    await this.gate.withMutation(async () => {
      invalidatedSessionIds =
        await this.runtimePool.closeSessionsForPath(source)
      await fs.rename(
        this.resolveUserPath(source),
        this.resolveUserPath(target)
      )
    })
    this.noteLocalChange()
    this.recordPathMoveInBackground(source, target)
    return {
      snapshot: await this.freshSnapshotAndEmit(),
      relativePath: target,
      invalidatedSessionIds,
    }
  }

  async movePath(
    relativePath: string,
    targetDirectory: string | null
  ): Promise<SpacePathMutationResult> {
    this.prioritizeLocalWork()
    const source = normalizeMutableRelativePath(relativePath)
    await fs.lstat(this.resolveUserPath(source))
    await resolveSpaceDirectory(this.canonical.root, targetDirectory)
    const target = joinSpaceRelativePath(
      targetDirectory,
      path.posix.basename(source)
    )
    if (target === source) {
      return {
        snapshot: await this.snapshot(),
        relativePath: source,
        invalidatedSessionIds: [],
      }
    }
    if (target.startsWith(`${source}/`)) {
      throw new Error("A folder cannot be moved inside itself")
    }
    await this.requireMissingPath(target)
    let invalidatedSessionIds: string[] = []
    await this.gate.withMutation(async () => {
      invalidatedSessionIds =
        await this.runtimePool.closeSessionsForPath(source)
      await fs.rename(
        this.resolveUserPath(source),
        this.resolveUserPath(target)
      )
    })
    this.noteLocalChange()
    this.recordPathMoveInBackground(source, target)
    return {
      snapshot: await this.freshSnapshotAndEmit(),
      relativePath: target,
      invalidatedSessionIds,
    }
  }

  async copyPath(
    relativePath: string,
    targetDirectory: string | null
  ): Promise<SpacePathMutationResult> {
    this.prioritizeLocalWork()
    const source = normalizeMutableRelativePath(relativePath)
    const stats = await fs.lstat(this.resolveUserPath(source))
    if (stats.isSymbolicLink())
      throw new Error("Space symlinks cannot be copied")
    await this.assertCopyTreeIsPortable(this.resolveUserPath(source))
    await resolveSpaceDirectory(this.canonical.root, targetDirectory)
    const target = joinSpaceRelativePath(
      targetDirectory,
      path.posix.basename(source)
    )
    if (target === source) throw new Error("Choose another destination folder")
    if (target.startsWith(`${source}/`)) {
      throw new Error("A folder cannot be copied inside itself")
    }
    await this.requireMissingPath(target)
    await this.gate.withMutation(() =>
      fs.cp(this.resolveUserPath(source), this.resolveUserPath(target), {
        recursive: stats.isDirectory(),
        errorOnExist: true,
        force: false,
        filter: async (sourcePath) => {
          const sourceStats = await fs.lstat(sourcePath)
          if (sourceStats.isSymbolicLink()) {
            throw new Error("Space symlinks cannot be copied")
          }
          if (
            sourcePath !== this.resolveUserPath(source) &&
            path.basename(sourcePath).toLowerCase() === ".graft"
          ) {
            throw new Error("Nested .graft directories cannot be copied")
          }
          if (!sourceStats.isDirectory() && !sourceStats.isFile()) {
            throw new Error("Only ordinary files and folders can be copied")
          }
          return true
        },
      })
    )
    this.noteLocalChange()
    return {
      snapshot: await this.freshSnapshotAndEmit(),
      relativePath: target,
      invalidatedSessionIds: [],
    }
  }

  async deletePath(
    relativePath: string,
    trash: (absolutePath: string) => Promise<void>
  ): Promise<SpacePathMutationResult> {
    this.prioritizeLocalWork()
    const source = normalizeMutableRelativePath(relativePath)
    await fs.lstat(this.resolveUserPath(source))
    let invalidatedSessionIds: string[] = []
    await this.gate.withMutation(async () => {
      invalidatedSessionIds =
        await this.runtimePool.closeSessionsForPath(source)
      await trash(this.resolveUserPath(source))
    })
    this.noteLocalChange()
    return {
      snapshot: await this.freshSnapshotAndEmit(),
      invalidatedSessionIds,
    }
  }

  async importFiles(
    sourcePaths: readonly string[],
    targetDirectory: string | null
  ): Promise<SpacePathMutationResult> {
    this.prioritizeLocalWork()
    if (sourcePaths.length === 0) throw new Error("Choose at least one file")
    await resolveSpaceDirectory(this.canonical.root, targetDirectory)
    const sources = await Promise.all(
      sourcePaths.map(async (sourcePath) => {
        if (!path.isAbsolute(sourcePath))
          throw new Error("Import path is invalid")
        const stats = await fs.lstat(sourcePath)
        if (!stats.isFile() || stats.isSymbolicLink()) {
          throw new Error("Only ordinary files can be imported")
        }
        const name = normalizeSpaceEntryName(path.basename(sourcePath))
        const relativePath = joinSpaceRelativePath(targetDirectory, name)
        await this.requireMissingPath(relativePath)
        const eidos = path.extname(name).toLowerCase() === ".eidos"
        const temporaryName = `.${randomUUID()}${eidos ? ".eidos" : ".tmp"}`
        return {
          sourcePath,
          relativePath,
          temporaryPath: joinSpaceRelativePath(targetDirectory, temporaryName),
          eidos,
        }
      })
    )
    await this.gate.withMutation(async () => {
      const copied: string[] = []
      const published: string[] = []
      try {
        for (const source of sources) {
          await fs.copyFile(
            source.sourcePath,
            this.resolveUserPath(source.temporaryPath),
            fsConstants.COPYFILE_EXCL
          )
          copied.push(source.temporaryPath)
          if (source.eidos) {
            await this.runtimePool.validatePaths([source.temporaryPath])
          }
        }
        for (const source of sources) {
          await fs.rename(
            this.resolveUserPath(source.temporaryPath),
            this.resolveUserPath(source.relativePath)
          )
          published.push(source.relativePath)
        }
      } catch (error) {
        await Promise.all([
          ...copied.map((temporaryPath) =>
            fs.rm(this.resolveUserPath(temporaryPath), { force: true })
          ),
          ...published.map((relativePath) =>
            fs.rm(this.resolveUserPath(relativePath), { force: true })
          ),
        ])
        throw error
      }
    })
    this.noteLocalChange()
    return {
      snapshot: await this.freshSnapshotAndEmit(),
      relativePath: sources[0]?.relativePath,
      invalidatedSessionIds: [],
    }
  }

  async callRuntime<M extends RuntimeMethod>(
    sessionId: string,
    method: M,
    args: RuntimeCalls[M]["args"]
  ): Promise<RuntimeCalls[M]["result"]> {
    if (!csvOperationControlMethods.has(method)) this.assertRuntimeAvailable()
    if (mutationMethods.has(method)) this.prioritizeLocalWork()
    let result: RuntimeCalls[M]["result"]
    try {
      result = mutationMethods.has(method)
        ? await this.gate.withMutation(() =>
            this.runtimePool.call(sessionId, method, args)
          )
        : await this.runtimePool.call(sessionId, method, args)
    } catch (error) {
      if (error instanceof EidosFileRuntimeError) {
        this.fileIssuesByPath.set(error.issue.relativePath, error.issue)
      }
      throw error
    }
    if (mutationMethods.has(method)) {
      this.noteLocalChange()
      void this.refreshAndEmit()
    }
    return result
  }

  async importEidosFileAssets(
    sessionId: string,
    sourcePaths: readonly string[]
  ): Promise<FileEntry[]> {
    this.assertRuntimeAvailable()
    this.prioritizeLocalWork()
    const eidosRelativePath = this.runtimePool.relativePathForSession(sessionId)
    const imported = await this.gate.withMutation(() =>
      importEidosFileAttachments(
        this.canonical.root,
        eidosRelativePath,
        sourcePaths
      )
    )
    return this.trackImportedEidosFileAssets(sessionId, imported)
  }

  async importEidosFileAssetData(
    sessionId: string,
    sources: readonly EidosFileAttachmentDataSource[]
  ): Promise<FileEntry[]> {
    this.assertRuntimeAvailable()
    this.prioritizeLocalWork()
    const eidosRelativePath = this.runtimePool.relativePathForSession(sessionId)
    const imported = await this.gate.withMutation(() =>
      importEidosFileAttachmentData(
        this.canonical.root,
        eidosRelativePath,
        sources
      )
    )
    return this.trackImportedEidosFileAssets(sessionId, imported)
  }

  private trackImportedEidosFileAssets(
    sessionId: string,
    imported: ImportedEidosFileAssets
  ): FileEntry[] {
    this.trackPendingEidosFileAssets(sessionId, imported.entries)
    this.noteLocalChange()
    void this.refreshAndEmit()
    return imported.entries
  }

  private trackPendingEidosFileAssets(
    sessionId: string,
    entries: readonly FileEntry[]
  ): void {
    let pending = this.pendingEidosFileAssets.get(sessionId)
    if (!pending) {
      pending = new Map()
      this.pendingEidosFileAssets.set(sessionId, pending)
    }
    for (const entry of entries) {
      while (
        !pending.has(entry.id) &&
        pending.size >= PENDING_EIDOS_FILE_ASSETS_PER_SESSION_MAX
      ) {
        const oldestId = pending.keys().next().value
        if (typeof oldestId !== "string") break
        pending.delete(oldestId)
      }
      pending.set(entry.id, entry)
    }
  }

  async acquireRemoteEidosFileAsset(
    sessionId: string,
    uri: string,
    requestedName?: string
  ): Promise<FileEntry> {
    this.assertRuntimeAvailable()
    this.runtimePool.relativePathForSession(sessionId)
    const inspected = await acquireEidosFileRemoteAsset(uri, requestedName)
    const entry = await this.callRuntime(sessionId, "allocateFileEntry", [
      {
        name: inspected.name,
        mediaType: inspected.mediaType,
        size: String(inspected.size),
        uri: inspected.uri,
      },
    ])
    this.trackPendingEidosFileAssets(sessionId, [entry])
    return entry
  }

  eidosFileAssetsPath(sessionId: string): Promise<string> {
    this.assertRuntimeAvailable()
    return eidosFileAssetDirectory(
      this.canonical.root,
      this.runtimePool.relativePathForSession(sessionId)
    )
  }

  async resolveEidosFileAsset(
    sessionId: string,
    entryId: string,
    purpose: "thumbnail" | "preview" | "download"
  ): Promise<{ entry: FileEntry; resolved: ResolvedEidosFileAsset }> {
    this.assertRuntimeAvailable()
    const eidosRelativePath = this.runtimePool.relativePathForSession(sessionId)
    const persisted = await this.callRuntime(sessionId, "findFileEntry", [
      entryId,
    ])
    const pending = this.pendingEidosFileAssets.get(sessionId)
    const imported = pending?.get(entryId) ?? null
    if (
      persisted &&
      imported &&
      (persisted.uri !== imported.uri ||
        persisted.name !== imported.name ||
        persisted.mediaType !== imported.mediaType ||
        persisted.size !== imported.size)
    ) {
      throw new Error("Persisted File entry conflicts with its imported asset")
    }
    const entry = persisted ?? imported
    if (!entry) throw new Error("File entry is unavailable")
    if (persisted && pending) {
      pending.delete(entryId)
      if (pending.size === 0) this.pendingEidosFileAssets.delete(sessionId)
    }
    if (/^https:/iu.test(entry.uri)) {
      const resolved = await resolveEidosFileRemoteAsset(
        entry.uri,
        entry.name,
        purpose
      )
      if (resolved.mediaType !== entry.mediaType.toLowerCase()) {
        throw new Error(
          "Network attachment bytes do not match the File media type"
        )
      }
      if (String(resolved.size) !== entry.size) {
        throw new Error(
          "Network attachment size no longer matches its File metadata"
        )
      }
      return {
        entry,
        resolved: { kind: "network", bytes: resolved.bytes },
      }
    }
    return {
      entry,
      resolved: await resolveEidosFileAttachment(
        this.canonical.root,
        eidosRelativePath,
        entry,
        purpose
      ),
    }
  }

  async resolveEidosFileUrlImage(
    sessionId: string,
    uri: string,
    purpose: "thumbnail" | "preview"
  ): Promise<ResolvedEidosFileUrlImage> {
    this.assertRuntimeAvailable()
    this.runtimePool.relativePathForSession(sessionId)
    return resolveEidosFileUrlImage(uri, purpose)
  }

  async enableVersioning(): Promise<SpaceSnapshot> {
    const status = await this.repository.runForeground((signal) =>
      this.graft.inspectSpace(
        this.canonical.root,
        this.graftStatusOptions(signal)
      )
    )
    if (!status.available) {
      throw new Error(
        status.error ?? "The bundled Graft runtime is unavailable"
      )
    }
    if (status.initialized) {
      this.versioningEnabled = true
      return this.freshSnapshotAndEmit(true)
    }
    await this.gate.withRepositoryOperation(
      "Enabling local Space versioning",
      async () => {
        await this.graft.initialize(this.canonical.root)
        await this.graft.stageAll(
          this.canonical.root,
          this.graftStatusOptions()
        )
        await this.graft.commit(
          this.canonical.root,
          "Enable Eidos Lite Space versioning"
        )
      }
    )
    this.versioningEnabled = true
    return this.freshSnapshotAndEmit(true)
  }

  async createCheckpoint(message?: string): Promise<SpaceSnapshot> {
    const normalizedMessage = message?.trim() || "Eidos Lite local checkpoint"
    if (normalizedMessage.length > 200) {
      throw new Error("Checkpoint message must be 200 characters or fewer")
    }
    const checkpoint = await this.commitCheckpoint(normalizedMessage, false)
    if (!checkpoint) throw new Error("There are no local changes to checkpoint")
    this.versioningEnabled = true
    return this.checkpointSnapshotAndEmit(checkpoint)
  }

  async officialSyncRemoteUrl(): Promise<string | null> {
    const state = await this.syncState.read()
    if (!state) return null
    const configured = await this.repository.runForeground(() =>
      this.graft.remoteUrl(this.canonical.root)
    )
    if (configured !== state.remoteUrl) {
      throw new Error(
        "The configured Graft Remote does not match this Space's verified Sync state."
      )
    }
    return state.remoteUrl
  }

  syncPreflight(): Promise<EidosSyncPreflight> {
    return createSyncPreflight(this.canonical.root, {
      inspectIgnores: (relativePaths) => this.inspectIgnores(relativePaths),
    })
  }

  async assertSyncPreflight(
    approval: EidosSyncPreflightApproval
  ): Promise<EidosSyncPreflight> {
    const preflight = await this.syncPreflight()
    assertSyncPreflightApproval(preflight, approval)
    return preflight
  }

  async enableHostedSync(
    remoteUrl: string,
    accessToken: string,
    approval: EidosSyncPreflightApproval,
    reportTransfer: SyncTransferProgressReporter = () => undefined
  ): Promise<SpaceSnapshot> {
    const existing = await this.syncState.read()
    if (existing) {
      if (existing.remoteUrl !== remoteUrl) {
        throw new Error("This Space is already connected to another Remote")
      }
      return this.freshSnapshotAndEmit(true)
    }
    const status = await this.repository.runForeground((signal) =>
      this.graft.inspectSpace(
        this.canonical.root,
        this.graftStatusOptions(signal)
      )
    )
    if (!status.available || !status.initialized) {
      throw new Error("Enable Local versioning before Eidos Sync")
    }
    if (status.clean !== true) {
      throw new Error("Create a checkpoint for local changes before Eidos Sync")
    }
    await this.gate.withRepositoryOperation(
      "Connecting the whole Space to Eidos Sync",
      async () => {
        await this.assertSyncPreflight(approval)
        const current = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions()
        )
        if (current.dirty) {
          throw new Error(
            "Space changed during Sync review; create a checkpoint and review again"
          )
        }
        await this.graft.configureOfficialRemote(
          this.canonical.root,
          remoteUrl,
          accessToken
        )
        await this.graft.push(this.canonical.root, accessToken, {
          onProgress: reportTransfer,
        })
        this.syncHistoryState = await this.syncState.markFirstPush(remoteUrl)
      }
    )
    return this.freshSnapshotAndEmit(true)
  }

  async syncHostedRemote(
    accessToken: string,
    access: "read_only" | "read_write",
    reportProgress: SyncProgressReporter = () => undefined,
    reportTransfer: SyncTransferProgressReporter = () => undefined
  ): Promise<EidosSyncOutcome> {
    const remoteUrl = await this.officialSyncRemoteUrl()
    if (!remoteUrl) throw new Error("This Space is not connected to Eidos Sync")
    await this.gate.withRepositoryOperation(
      "Authenticating Eidos Sync",
      async (signal) => {
        await this.graft.configureOfficialRemote(
          this.canonical.root,
          remoteUrl,
          accessToken,
          { signal }
        )
      },
      { preemptible: true }
    )

    let activeMerge = await this.gate.withRepositoryOperation(
      "Checking for an interrupted merge",
      (signal) =>
        typeof this.graft.getMergeStatusIfAvailable === "function"
          ? this.graft.getMergeStatusIfAvailable(this.canonical.root, {
              signal,
            })
          : Promise.resolve({ state: "none" as const }),
      { preemptible: true }
    )
    activeMerge = await this.completeResolvedMerge(activeMerge)
    if (activeMerge.state === "merging") {
      const relation = await this.repository.runForeground((signal) =>
        this.graft.status(this.canonical.root, this.graftStatusOptions(signal))
      )
      return this.syncResult(
        "conflict",
        "A reviewed merge is already in progress. Reopen the conflict workspace to continue or abort it.",
        false,
        false,
        relation
      )
    }

    reportProgress("fetch", "Fetching Hosted Space history")
    let relation = await this.gate.withRepositoryOperation(
      "Fetching Eidos Sync",
      async (signal) => {
        const before = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions(signal)
        )
        this.assertGraftPathsSafeForMerge(before)
        if (before.dirty) {
          throw new Error("Create a checkpoint for local changes before Sync")
        }
        await this.graft.fetch(this.canonical.root, {
          signal,
          onProgress: reportTransfer,
        })
        await this.recordSyncHistoryCheck()
        return this.graft.status(
          this.canonical.root,
          this.graftStatusOptions(signal)
        )
      },
      { preemptible: true }
    )
    reportProgress("analyze", "Comparing Local and Hosted checkpoints")
    if (relation.hasConflicts || repositorySyncState(relation) === "diverged") {
      return this.syncResult(
        "conflict",
        "Local and Hosted history have diverged. No files were replaced. Review History before choosing a recovery path.",
        false,
        false,
        relation
      )
    }

    let pulled = false
    if (repositorySyncState(relation) === "behind") {
      if (
        !(await this.repository.runForeground(() =>
          this.graft.operationMaterializesWorktree("applyMerge")
        ))
      ) {
        throw new Error(
          "Graft fast-forward materialization contract is unavailable"
        )
      }
      let shouldApplyFastForward = true
      let fastForwardPlan: EidosSyncMergePlan | null = null
      let materializedPaths: string[] | null = null
      const stopProgress = this.gate.subscribe((state) => {
        if (state.phase === "quiescing") {
          reportProgress(
            "drain",
            "Draining writes and closing Eidos File handles"
          )
        } else if (state.phase === "materializing") {
          reportProgress("pull", "Materializing Hosted Space files")
        } else if (state.phase === "validating") {
          reportProgress("validate", "Validating the complete Space")
        } else if (state.phase === "reopening") {
          reportProgress("reopen", "Reopening Eidos File handles")
        }
      })
      try {
        reportProgress(
          "drain",
          "Draining writes and closing Eidos File handles"
        )
        pulled = await this.gate.withMaterialization({
          kind: "pull-hosted-sync",
          detail: "Updating Space from Eidos Sync",
          beforeClose: async (signal) => {
            const current = await this.graft.status(
              this.canonical.root,
              this.graftStatusOptions(signal)
            )
            if (current.dirty) {
              throw new Error(
                "Space changed after fetch. Create a checkpoint and Sync again."
              )
            }
            if (
              current.hasConflicts ||
              repositorySyncState(current) === "diverged"
            ) {
              throw new Error(
                "Local and Hosted history diverged after fetch. No pull was started."
              )
            }
            shouldApplyFastForward = repositorySyncState(current) === "behind"
            if (!shouldApplyFastForward) return
            fastForwardPlan = await this.graft.planMerge(
              this.canonical.root,
              "origin/main",
              current.currentHead ?? null,
              { signal }
            )
            if (fastForwardPlan.kind !== "fast_forward") {
              throw new Error(
                "Hosted history changed after fetch. Sync again to review it safely."
              )
            }
          },
          validationPaths: () =>
            shouldApplyFastForward ? (materializedPaths ?? undefined) : [],
          materialize: async (signal) => {
            if (!shouldApplyFastForward) return false
            if (!fastForwardPlan) {
              throw new Error("The fetched fast-forward plan is unavailable")
            }
            const applied = await this.graft.applyMerge(
              this.canonical.root,
              "origin/main",
              fastForwardPlan.expectedHead,
              fastForwardPlan.planToken,
              {
                signal,
                onProgress: reportTransfer,
                onWorktreePaths: (paths) => {
                  materializedPaths = paths
                },
              }
            )
            if (applied.state !== "none") {
              throw new Error(
                "Graft started an unexpected merge for a fast-forward plan"
              )
            }
            return true
          },
        })
      } finally {
        stopProgress()
      }
      relation = await this.repository.runForeground((signal) =>
        this.graft.status(this.canonical.root, this.graftStatusOptions(signal))
      )
    }

    let pushed = false
    if (repositorySyncState(relation) === "ahead") {
      if (access === "read_only") {
        return this.syncResult(
          "read-only",
          "Hosted updates are applied, but this subscription cannot push local checkpoints.",
          pulled,
          false,
          relation
        )
      }
      reportProgress("push", "Pushing Local checkpoints to Hosted Space")
      await this.gate.withRepositoryOperation(
        "Pushing Space to Eidos Sync",
        async (signal) => {
          const current = await this.graft.status(
            this.canonical.root,
            this.graftStatusOptions(signal)
          )
          if (current.dirty) {
            throw new Error(
              "Space changed before push. Create a checkpoint and Sync again."
            )
          }
          const currentState = repositorySyncState(current)
          if (
            currentState === "behind" ||
            currentState === "diverged" ||
            current.hasConflicts
          ) {
            throw new Error(
              "Hosted history changed before push. Sync again to re-fetch it."
            )
          }
          await this.graft.push(this.canonical.root, accessToken, {
            signal,
            onProgress: reportTransfer,
          })
        },
        { preemptible: true }
      )
      pushed = true
      relation = await this.repository.runForeground((signal) =>
        this.graft.status(this.canonical.root, this.graftStatusOptions(signal))
      )
    }

    return this.syncResult(
      access === "read_only" ? "read-only" : "synced",
      access === "read_only"
        ? "This Space is up to date in read-only mode."
        : "Local and Hosted Space history are up to date.",
      pulled,
      pushed,
      relation
    )
  }

  async assertHostedDivergence(accessToken: string): Promise<{
    ahead: number
    behind: number
  }> {
    const remoteUrl = await this.officialSyncRemoteUrl()
    if (!remoteUrl) throw new Error("This Space is not connected to Eidos Sync")
    const relation = await this.gate.withRepositoryOperation(
      "Refreshing conflict state",
      async (signal) => {
        await this.graft.configureOfficialRemote(
          this.canonical.root,
          remoteUrl,
          accessToken,
          { signal }
        )
        const before = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions(signal)
        )
        if (before.dirty) {
          throw new Error(
            "Create a checkpoint for local changes before conflict recovery"
          )
        }
        await this.graft.fetch(this.canonical.root, { signal })
        await this.recordSyncHistoryCheck()
        return this.graft.status(
          this.canonical.root,
          this.graftStatusOptions(signal)
        )
      }
    )
    if (
      !relation.hasConflicts &&
      repositorySyncState(relation) !== "diverged"
    ) {
      throw new Error(
        "Local and Hosted history are no longer in the recoverable ahead+behind state. Run Sync Now again."
      )
    }
    return { ahead: relation.ahead, behind: relation.behind }
  }

  async getSyncMergeStatus(): Promise<EidosSyncMergeStatus> {
    const merge = await this.gate.withRepositoryOperation(
      "Reading merge recovery state",
      (signal) => this.graft.getMergeStatus(this.canonical.root, { signal }),
      { preemptible: true }
    )
    return this.completeResolvedMerge(merge)
  }

  async planHostedMerge(accessToken: string): Promise<EidosSyncMergePlan> {
    const remoteUrl = await this.officialSyncRemoteUrl()
    if (!remoteUrl) throw new Error("This Space is not connected to Eidos Sync")
    return this.gate.withRepositoryOperation(
      "Analyzing Local and Hosted merge",
      async (signal) => {
        await this.graft.configureOfficialRemote(
          this.canonical.root,
          remoteUrl,
          accessToken,
          { signal }
        )
        const before = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions(signal)
        )
        if (before.dirty) {
          throw new Error(
            "Create a checkpoint for local changes before analyzing a merge"
          )
        }
        await this.graft.fetch(this.canonical.root, { signal })
        await this.recordSyncHistoryCheck()
        const status = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions(signal)
        )
        this.assertGraftPathsSafeForMerge(status)
        if (status.dirty) {
          throw new Error(
            "Space changed while fetching Hosted history. Create a checkpoint and analyze again."
          )
        }
        await this.ensureEidosMergePolicy(signal)
        // The guarded plan is authoritative. The relationship may have
        // changed since the inspector last rendered (for example after an
        // abort or another device push), so return an up-to-date or
        // fast-forward plan instead of trapping the UI in a stale divergence.
        return this.graft.planMerge(
          this.canonical.root,
          "origin/main",
          status.currentHead,
          { signal }
        )
      },
      { preemptible: true }
    )
  }

  async applyHostedMerge(
    request: EidosSyncMergeApplyRequest
  ): Promise<EidosSyncMergeStatus> {
    const merge = await this.materializeMergeOperation(
      "applyMerge",
      "apply-hosted-merge",
      "Starting reviewed Local and Hosted merge",
      null,
      async (signal, onWorktreePaths) => {
        // Graft applies the reviewed plan under HEAD, plan-token, and clean-worktree guards.
        // Avoid a second full Space status scan here; large SQLite files make that duplicate
        // probe visible, while the SDK check remains the atomic authority at mutation time.
        const materializedPaths = new Set<string>()
        const capturePaths = (paths: string[] | null) => {
          for (const relativePath of paths ?? [])
            materializedPaths.add(relativePath)
        }
        let merge = await this.graft.applyMerge(
          this.canonical.root,
          "origin/main",
          request.expectedHead,
          request.planToken,
          { signal, onWorktreePaths: capturePaths }
        )
        if (merge.state === "merging") {
          merge = await this.resolveEidosSystemMetadataMerges(
            merge,
            signal,
            capturePaths
          )
        }
        onWorktreePaths([...materializedPaths])
        return merge
      }
    )
    return this.completeResolvedMerge(merge)
  }

  listSyncMergePaths(
    stateToken: string,
    filter: EidosSyncMergePathFilter = "all",
    limit = 100,
    after?: string
  ): Promise<EidosSyncMergePathPage> {
    return this.gate.withRepositoryOperation(
      "Reading merge paths",
      (signal) =>
        this.graft.listMergePaths(this.canonical.root, stateToken, {
          filter,
          limit,
          after,
          signal,
        }),
      { preemptible: true }
    )
  }

  listSyncMergeConflicts(
    stateToken: string,
    relativePath: string,
    limit = 100,
    after?: string
  ): Promise<EidosSyncMergeConflictPage> {
    const normalized = normalizeMutableRelativePath(relativePath)
    return this.gate.withRepositoryOperation(
      "Reading merge conflicts",
      async (signal) => {
        const page = await this.graft.listMergeConflicts(
          this.canonical.root,
          normalized,
          stateToken,
          { limit, after, signal }
        )
        if (!normalized.toLowerCase().endsWith(".eidos")) return page
        try {
          const workspace = await this.graft.prepareSemanticMerge(
            this.canonical.root,
            normalized,
            EIDOS_SYSTEM_MERGE_PROVIDER,
            EIDOS_FILE_METADATA_TABLES,
            stateToken,
            { signal }
          )
          if (workspace.record.state === "conflict") {
            const domainConflicts = workspace.record.conflicts
              .map(semanticDomainConflict)
              .filter(
                (conflict): conflict is EidosSystemMergeDomainConflict =>
                  conflict !== null
              )
            if (domainConflicts.length !== workspace.record.conflicts.length) {
              return page
            }
            return {
              ...page,
              items: domainConflicts.map((domain, index) => {
                return {
                  id: `semantic:${domain.objectKind}:${domain.objectId}:${domain.group}:${index}`,
                  path: normalized,
                  pathKind: "sqlite_database" as const,
                  storage: "sqlite_snapshot" as const,
                  kind: "domain",
                  reason: domain.code,
                  status: "unresolved" as const,
                  name: domain.objectId,
                  owner: domain.objectKind,
                  change: domain.group,
                  message: domain.message,
                }
              }),
              nextCursor: null,
            }
          }
          const opened = await this.runtimePool.open(normalized)
          const tableColumns = new Map<string, string[]>()
          for (const table of opened.snapshot.tables) {
            const columns = table.fields.flatMap((field) =>
              field.physicalName ? [field.physicalName] : []
            )
            if (columns.length === 0) continue
            for (const name of [
              table.table.name,
              table.table.physicalName,
              table.table.rawTableName,
            ]) {
              if (name) tableColumns.set(name, columns)
            }
          }
          return {
            ...page,
            items: page.items.map((conflict) => {
              if (conflict.kind !== "row" || !conflict.table) return conflict
              const rowColumns = tableColumns.get(conflict.table)
              const rowLength = Math.max(
                conflict.baseRow?.length ?? 0,
                conflict.oursRow?.length ?? 0,
                conflict.theirsRow?.length ?? 0
              )
              return rowColumns?.length === rowLength
                ? { ...conflict, rowColumns }
                : conflict
            }),
          }
        } catch {
          // A structurally conflicted candidate may not open yet. Preserve
          // Graft's conflict data so whole-table/file recovery remains usable.
          return page
        }
      },
      { preemptible: true }
    )
  }

  readSyncMergeVersion(
    stateToken: string,
    relativePath: string,
    version: EidosSyncMergeContent["version"]
  ): Promise<EidosSyncMergeContent> {
    return this.gate.withRepositoryOperation(
      `Reading ${version} merge version`,
      (signal) =>
        this.graft.readMergeVersion(
          this.canonical.root,
          normalizeMutableRelativePath(relativePath),
          version,
          stateToken,
          { signal }
        ),
      { preemptible: true }
    )
  }

  diffSyncMergeSqlite(
    stateToken: string,
    relativePath: string,
    from: EidosSyncMergeSqliteVersion,
    to: EidosSyncMergeSqliteVersion,
    options:
      | { mode?: "summary" }
      | {
          mode: "rows"
          table: string
          rowLimit?: number
          rowAfter?: string
        } = {}
  ): Promise<EidosSyncMergeSqliteDiff> {
    return this.gate.withRepositoryOperation(
      `Reading ${from} to ${to} SQLite merge differences`,
      (signal) =>
        this.graft.diffMergeSqlite(
          this.canonical.root,
          normalizeMutableRelativePath(relativePath),
          from,
          to,
          stateToken,
          { ...options, signal }
        ),
      { preemptible: true }
    )
  }

  resolveSyncMergePath(
    stateToken: string,
    relativePath: string,
    result: EidosSyncMergeChoice
  ): Promise<EidosSyncMergeStatus> {
    const normalized = normalizeMutableRelativePath(relativePath)
    return this.materializeMergeOperation(
      "setMergePathResult",
      "resolve-merge-path",
      `Resolving ${normalized}`,
      stateToken,
      (signal, onWorktreePaths) =>
        this.graft.setMergePathResult(
          this.canonical.root,
          normalized,
          result,
          stateToken,
          { signal, onWorktreePaths }
        ),
      [normalized]
    )
  }

  resolveSyncMergeRow(
    stateToken: string,
    relativePath: string,
    table: string,
    identity: number | Record<string, unknown>,
    result: EidosSyncMergeChoice
  ): Promise<EidosSyncMergeStatus> {
    const normalized = normalizeMutableRelativePath(relativePath)
    return this.materializeMergeOperation(
      "resolveMergeRow",
      "resolve-merge-row",
      `Resolving a row in ${normalized}`,
      stateToken,
      (signal, onWorktreePaths) =>
        this.graft.resolveMergeRow(
          this.canonical.root,
          normalized,
          table,
          identity,
          result,
          stateToken,
          { signal, onWorktreePaths }
        ),
      [normalized]
    )
  }

  resolveSyncMergeCell(
    stateToken: string,
    relativePath: string,
    table: string,
    identity: number | Record<string, unknown>,
    column: string,
    result: EidosSyncMergeChoice
  ): Promise<EidosSyncMergeStatus> {
    const normalized = normalizeMutableRelativePath(relativePath)
    if (!column) throw new Error("Merge column is required")
    return this.materializeMergeOperation(
      "resolveMergeCell",
      "resolve-merge-cell",
      `Resolving ${column} in ${table}`,
      stateToken,
      (signal, onWorktreePaths) =>
        this.graft.resolveMergeCell(
          this.canonical.root,
          normalized,
          table,
          identity,
          column,
          result,
          stateToken,
          { signal, onWorktreePaths }
        ),
      [normalized]
    )
  }

  resolveSyncMergeTable(
    stateToken: string,
    relativePath: string,
    table: string,
    result: EidosSyncMergeChoice
  ): Promise<EidosSyncMergeStatus> {
    const normalized = normalizeMutableRelativePath(relativePath)
    return this.materializeMergeOperation(
      "resolveMergeTable",
      "resolve-merge-table",
      `Resolving ${table} in ${normalized}`,
      stateToken,
      (signal, onWorktreePaths) =>
        this.graft.resolveMergeTable(
          this.canonical.root,
          normalized,
          table,
          result,
          stateToken,
          { signal, onWorktreePaths }
        ),
      [normalized]
    )
  }

  unresolveSyncMergePath(
    stateToken: string,
    relativePath: string
  ): Promise<EidosSyncMergeStatus> {
    const normalized = normalizeMutableRelativePath(relativePath)
    return this.materializeMergeOperation(
      "unresolveMergePath",
      "unresolve-merge-path",
      `Restoring conflicts in ${normalized}`,
      stateToken,
      (signal, onWorktreePaths) =>
        this.graft.unresolveMergePath(
          this.canonical.root,
          normalized,
          stateToken,
          { signal, onWorktreePaths }
        ),
      [normalized]
    )
  }

  stageSyncMergeSqliteResult(
    stateToken: string,
    relativePath: string
  ): Promise<EidosSyncMergeStatus> {
    const normalized = normalizeMutableRelativePath(relativePath)
    if (!normalized.toLowerCase().endsWith(".eidos")) {
      throw new Error("Only Eidos Files can be staged as SQLite merge results")
    }
    return this.gate
      .withMaterialization({
        kind: "stage-merge-sqlite-result",
        detail: `Validating and staging ${normalized}`,
        // The candidate is validated immediately before this explicitly
        // non-materializing Graft operation, so no second validation is needed.
        validationPaths: [],
        beforeClose: async (signal) => {
          const materializes = await this.graft.operationMaterializesWorktree(
            "stageMergeSqliteResult",
            { signal }
          )
          if (materializes) {
            throw new Error(
              "Graft unexpectedly declared stageMergeSqliteResult as a worktree materialization"
            )
          }
          const merge = await this.graft.getMergeStatus(this.canonical.root, {
            signal,
          })
          if (merge.state !== "merging" || merge.stateToken !== stateToken) {
            throw Object.assign(
              new Error("The merge changed; reload it first"),
              { code: "GRAFT_SDK_REPOSITORY_STALE" }
            )
          }
        },
        materialize: async (signal) => {
          // Application-owned recompute must already be present in the
          // candidate. Validate Eidos semantics before Graft captures it.
          await this.validateMaterializedWorktree([normalized])
          return this.graft.stageMergeSqliteResult(
            this.canonical.root,
            normalized,
            stateToken,
            { signal }
          )
        },
      })
      .then(async (result) => {
        this.invalidateGraftStatusCache()
        await this.freshSnapshotAndEmit(true)
        return result
      })
  }

  writeSyncMergeText(
    stateToken: string,
    relativePath: string,
    content: string
  ): Promise<EidosSyncMergeStatus> {
    const normalized = normalizeMutableRelativePath(relativePath)
    return this.materializeMergeOperation(
      "writeAndStageTextResult",
      "write-merge-text",
      `Saving merged text for ${normalized}`,
      stateToken,
      (signal, onWorktreePaths) =>
        this.graft.writeAndStageTextResult(
          this.canonical.root,
          normalized,
          content,
          stateToken,
          { signal, onWorktreePaths }
        ),
      [normalized]
    )
  }

  continueSyncMerge(
    stateToken: string,
    message: string
  ): Promise<EidosSyncMergeStatus> {
    const normalizedMessage = message.trim()
    if (!normalizedMessage || normalizedMessage.length > 200) {
      throw new Error("Merge checkpoint message must be 1–200 characters")
    }
    let fallbackMaterializedPaths: string[] | undefined
    return this.materializeMergeOperation(
      "continueMerge",
      "continue-hosted-merge",
      "Validating and completing the merge checkpoint",
      stateToken,
      async (signal, onWorktreePaths) => {
        // The SDK requires the exact state token whose Eidos File worktree was
        // semantically validated. Handles are already closed at this point.
        await this.validateMaterializedWorktree()
        if (!this.graft.hasExactMergeWorktreePaths?.()) {
          fallbackMaterializedPaths = []
          let after: string | undefined
          do {
            const page = await this.graft.listMergePaths(
              this.canonical.root,
              stateToken,
              {
                filter: "all",
                limit: 100,
                ...(after ? { after } : {}),
                signal,
              }
            )
            fallbackMaterializedPaths.push(
              ...page.items.map((item) => item.path)
            )
            after = page.nextCursor ?? undefined
          } while (after)
        }
        return this.graft.continueMerge(
          this.canonical.root,
          normalizedMessage,
          stateToken,
          { signal, onWorktreePaths }
        )
      },
      // continueMerge can materialize only paths in the active merge. The
      // entire candidate is checked before the commit; revalidate those paths
      // afterward instead of reopening every unchanged Eidos File again.
      () => fallbackMaterializedPaths
    )
  }

  private completeResolvedMerge(
    merge: EidosSyncMergeStatus
  ): Promise<EidosSyncMergeStatus> {
    if (merge.state !== "merging" || merge.unmergedCount > 0) {
      return Promise.resolve(merge)
    }
    return this.continueSyncMerge(
      merge.stateToken,
      DEFAULT_HOSTED_MERGE_MESSAGE
    )
  }

  abortSyncMerge(stateToken: string): Promise<EidosSyncMergeStatus> {
    return this.materializeMergeOperation(
      "abortMerge",
      "abort-hosted-merge",
      "Restoring the pre-merge Local Space",
      stateToken,
      (signal, onWorktreePaths) =>
        this.graft.abortMerge(this.canonical.root, stateToken, {
          signal,
          onWorktreePaths,
        })
    )
  }

  async createLocalRecovery(
    copy: (sourceRoot: string) => Promise<string>
  ): Promise<string> {
    const status = await this.repository.runForeground((signal) =>
      this.graft.status(this.canonical.root, this.graftStatusOptions(signal))
    )
    if (status.dirty) {
      throw new Error(
        "Create a checkpoint for local changes before copying a Recovery Space"
      )
    }
    return this.gate.withMaterialization({
      kind: "copy-local-recovery",
      detail: "Copying Local Space into a Recovery Space",
      materialize: () => copy(this.canonical.root),
    })
  }

  async assertHostedSyncReady(): Promise<void> {
    if (await this.syncState.read()) return
    const status = await this.repository.runForeground((signal) =>
      this.graft.inspectSpace(
        this.canonical.root,
        this.graftStatusOptions(signal)
      )
    )
    if (!status.available || !status.initialized) {
      throw new Error("Enable Local versioning before Eidos Sync")
    }
    if (status.clean !== true) {
      throw new Error("Create a checkpoint for local changes before Eidos Sync")
    }
  }

  async getVersionChanges(
    limit = 100,
    after?: string
  ): Promise<SpaceVersionDiff> {
    await this.requireInitializedVersioning()
    return this.withVersionRead(
      "version-changes",
      "Reading local changes",
      (signal) =>
        this.graft.workingChanges(this.canonical.root, {
          limit: this.safeVersionPageSize(limit),
          after,
          signal,
          verifyPaths: this.runtimePool.openRelativePaths(),
        })
    )
  }

  async getVersionHistory(
    limit = 50,
    after?: string
  ): Promise<SpaceVersionHistory> {
    await this.requireInitializedVersioning()
    return this.withVersionRead(
      "version-history",
      "Reading Space history",
      (signal) =>
        this.graft.history(
          this.canonical.root,
          this.safeVersionPageSize(limit),
          {
            after,
            signal,
          }
        )
    )
  }

  async getVersionDiff(
    commitId: string,
    parentId?: string | null,
    limit = 100,
    after?: string
  ): Promise<SpaceVersionDiff> {
    await this.requireInitializedVersioning()
    this.assertRevisionId(commitId)
    if (parentId) this.assertRevisionId(parentId)
    return this.withVersionRead(
      "version-diff",
      "Reading checkpoint changes",
      (signal) =>
        this.graft.revisionChanges(this.canonical.root, commitId, parentId, {
          limit: this.safeVersionPageSize(limit),
          after,
          signal,
        })
    )
  }

  async getVersionPathDiff(
    relativePath: string,
    commitId?: string | null,
    parentId?: string | null,
    tableName?: string,
    rowAfter?: string
  ): Promise<SpaceVersionDiff> {
    await this.requireInitializedVersioning()
    const normalizedPath = normalizeMutableRelativePath(relativePath)
    if (commitId) this.assertRevisionId(commitId)
    if (parentId) this.assertRevisionId(parentId)
    if (tableName !== undefined && !tableName.trim()) {
      throw new Error("Invalid diff table")
    }
    if (rowAfter !== undefined && (!tableName || !rowAfter.trim())) {
      throw new Error("Invalid row-diff cursor")
    }
    return this.withVersionRead(
      "version-path-diff",
      "Reading file changes",
      async (signal) => {
        const options = {
          signal,
          ...(tableName ? { table: tableName } : {}),
          ...(rowAfter ? { rowAfter } : {}),
          rowLimit: 100,
          ...(!commitId ? { stagedFallback: true } : {}),
          ...(commitId && parentId
            ? { from: parentId, to: commitId }
            : commitId
              ? { root: commitId }
              : {}),
        }
        const diff = await this.graft.sqlitePathDiff(
          this.canonical.root,
          normalizedPath,
          options
        )
        if (!tableName || tableName.startsWith("eidos__")) {
          return diff
        }
        try {
          const fieldsDiff = await this.graft.sqlitePathDiff(
            this.canonical.root,
            normalizedPath,
            {
              signal,
              table: "eidos__fields",
              rowLimit: 1_000,
              ...(!commitId ? { stagedFallback: true } : {}),
              ...(commitId && parentId
                ? { from: parentId, to: commitId }
                : commitId
                  ? { root: commitId }
                  : {}),
            }
          )
          return normalizeEidosTableDiff(
            diff,
            fieldsDiff,
            readEidosPhysicalSchema(
              resolveSpacePath(this.canonical.root, normalizedPath)
            ),
            tableName
          )
        } catch (error) {
          if (signal.aborted) throw error
          return diff
        }
      }
    )
  }

  async getTrackedIgnoredPaths(
    limit = 100,
    after?: string
  ): Promise<GraftTrackedIgnoredPaths> {
    await this.requireInitializedVersioning()
    return this.withVersionRead(
      "version-tracked-ignored",
      "Reading ignored tracked files",
      (signal) =>
        this.graft.trackedIgnored(this.canonical.root, {
          limit: Number.isFinite(limit)
            ? Math.max(1, Math.min(Math.trunc(limit), 1_000))
            : 100,
          after,
          signal,
        })
    )
  }

  async untrackIgnoredPaths(expectedHead: string): Promise<SpaceSnapshot> {
    await this.requireInitializedVersioning()
    this.assertRevisionId(expectedHead)
    await this.gate.withRepositoryOperation(
      "Stopping tracking for ignored files",
      async () => {
        const status = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions()
        )
        if (status.dirty || status.currentHead !== expectedHead) {
          throw new Error(
            "Space changed before ignored files were updated; refresh and try again"
          )
        }
        const paths: string[] = []
        let after: string | undefined
        do {
          const page = await this.graft.trackedIgnored(this.canonical.root, {
            limit: 1_000,
            after,
          })
          paths.push(...page.paths)
          after = page.hasMore ? (page.nextCursor ?? undefined) : undefined
        } while (after)
        if (paths.length === 0) {
          throw new Error("No tracked files match the current ignore rules")
        }
        await this.graft.untrackPaths(this.canonical.root, paths, expectedHead)
        await this.graft.commit(
          this.canonical.root,
          `Stop tracking ${paths.length} ignored ${paths.length === 1 ? "path" : "paths"}`
        )
      }
    )
    this.versioningEnabled = true
    return this.freshSnapshotAndEmit(true)
  }

  async getVersionTextDiff(
    commitId: string,
    parentId: string | null,
    relativePath: string,
    previousRelativePath?: string
  ): Promise<SpaceVersionTextContentDiff> {
    await this.requireInitializedVersioning()
    this.assertRevisionId(commitId)
    if (parentId) this.assertRevisionId(parentId)
    const safePath = normalizeMutableRelativePath(relativePath)
    const safePreviousPath = previousRelativePath
      ? normalizeMutableRelativePath(previousRelativePath)
      : undefined
    return this.withVersionRead(
      "version-text-diff",
      "Reading checkpoint text",
      () =>
        this.graft.revisionTextDiff(
          this.canonical.root,
          commitId,
          parentId,
          safePath,
          EIDOS_LITE_VERSION_TEXT_DIFF_BYTES_MAX,
          safePreviousPath
        )
    )
  }

  async getWorkingTextDiff(
    expectedHead: string | null,
    relativePath: string,
    previousRelativePath?: string
  ): Promise<SpaceVersionTextContentDiff> {
    await this.requireInitializedVersioning()
    if (expectedHead) this.assertRevisionId(expectedHead)
    const safePath = normalizeMutableRelativePath(relativePath)
    const safePreviousPath = previousRelativePath
      ? normalizeMutableRelativePath(previousRelativePath)
      : safePath
    return this.withVersionRead(
      "version-text-diff",
      "Reading local text changes",
      async (signal) => {
        const status = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions(signal)
        )
        if (status.currentHead !== expectedHead) {
          throw new Error(
            "Space history changed; refresh Changes and try again"
          )
        }
        const before = expectedHead
          ? (
              await this.graft.revisionTextDiff(
                this.canonical.root,
                expectedHead,
                null,
                safePreviousPath,
                EIDOS_LITE_VERSION_TEXT_DIFF_BYTES_MAX
              )
            ).after
          : ({ state: "absent" } as const)
        const after = await readWorkingTextContent(
          this.canonical.root,
          safePath,
          EIDOS_LITE_VERSION_TEXT_DIFF_BYTES_MAX
        )
        return { path: safePath, before, after }
      }
    )
  }

  async discardWorkingChanges(
    request: SpaceWorkingChangesDiscardRequest
  ): Promise<SpaceWorkingChangesDiscardResult> {
    await this.requireInitializedVersioning()
    this.assertRevisionId(request.expectedHead)
    if (!request.expectedChangeToken.trim()) {
      throw new Error("Refresh Changes before discarding local edits")
    }
    const targetPath = normalizeMutableRelativePath(request.target.path)
    const normalizedRequest: SpaceWorkingChangesDiscardRequest = {
      ...request,
      target: { ...request.target, path: targetPath },
    }
    const restoreMaterializes = await this.repository.runForeground(() =>
      this.graft.operationMaterializesWorktree("restorePaths")
    )
    if (!restoreMaterializes) {
      throw new Error("Graft discard materialization contract is unavailable")
    }

    this.cancelVersionReads()
    const materializedPaths = await this.gate.withMaterialization({
      kind: "discard-working-changes",
      detail:
        request.target.kind === "folder"
          ? `Discarding local changes in ${targetPath}`
          : `Discarding local changes to ${targetPath}`,
      materialize: async () => {
        const status = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions()
        )
        if (
          status.currentHead !== request.expectedHead ||
          status.changeToken !== request.expectedChangeToken
        ) {
          throw new Error(
            "Local changes changed before discard started; refresh Changes and try again"
          )
        }
        const selectedChanges = status.changes.filter((change) =>
          workingChangeMatchesTarget(change, normalizedRequest)
        )
        if (selectedChanges.length === 0) {
          throw new Error("The selected file or folder has no local changes")
        }
        const addedPaths = selectedChanges
          .filter(isAddedWorkingChange)
          .map((change) => normalizeMutableRelativePath(change.path))
        for (const relativePath of addedPaths) {
          try {
            const stats = await fs.lstat(
              resolveSpacePath(this.canonical.root, relativePath)
            )
            if (stats.isDirectory()) {
              throw new Error(
                `Discard only supports files; ${relativePath} is a directory`
              )
            }
          } catch (error) {
            if (
              !(
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
              )
            ) {
              throw error
            }
          }
        }
        const trackedChanges = selectedChanges.filter(
          (change) => !isAddedWorkingChange(change)
        )
        const trackedPaths = [
          ...new Set(
            trackedChanges.flatMap((change) =>
              [change.path, change.previousPath].filter(
                (candidate): candidate is string => Boolean(candidate)
              )
            )
          ),
        ]
          .map(normalizeMutableRelativePath)
          .sort()
        if (trackedPaths.length > 0) {
          await this.graft.restorePaths(
            this.canonical.root,
            request.expectedHead,
            request.expectedHead,
            trackedPaths,
            { requireClean: false }
          )
        }
        for (const change of trackedChanges) {
          if (
            !change.previousPath ||
            change.change.toLowerCase() !== "renamed"
          ) {
            continue
          }
          await this.graft.recordPathMove(
            this.canonical.root,
            normalizeMutableRelativePath(change.path),
            normalizeMutableRelativePath(change.previousPath)
          )
        }
        await Promise.all(
          addedPaths.map((relativePath) =>
            fs.rm(resolveSpacePath(this.canonical.root, relativePath), {
              force: true,
            })
          )
        )
        return [...new Set([...trackedPaths, ...addedPaths])].sort()
      },
    })
    return {
      snapshot: await this.freshSnapshotAndEmit(true),
      paths: materializedPaths,
    }
  }

  async restoreCheckpoint(
    commitId: string,
    expectedHead: string
  ): Promise<SpaceSnapshot> {
    await this.requireInitializedVersioning()
    this.assertRevisionId(commitId)
    this.assertRevisionId(expectedHead)
    const initialStatus = await this.repository.runForeground((signal) =>
      this.graft.status(this.canonical.root, this.graftStatusOptions(signal))
    )
    if (initialStatus.dirty) {
      throw new Error(
        "Create a checkpoint for local changes before restoring history"
      )
    }
    if (initialStatus.currentHead !== expectedHead) {
      throw new Error("Space history changed; refresh History before restoring")
    }
    const { paths, restoreMaterializes } = await this.repository.runForeground(
      async () => ({
        paths: await this.graft.materializationPathsBetweenRevisions(
          this.canonical.root,
          commitId,
          expectedHead
        ),
        restoreMaterializes:
          await this.graft.operationMaterializesWorktree("restore"),
      })
    )
    if (paths.length === 0) {
      throw new Error("The Space already matches this checkpoint")
    }
    if (!restoreMaterializes) {
      throw new Error("Graft restore materialization contract is unavailable")
    }

    await this.gate.withMaterialization({
      kind: "restore-checkpoint",
      detail: `Restoring Space checkpoint ${commitId.slice(0, 8)}`,
      materialize: async () => {
        const status = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions()
        )
        if (status.dirty || status.currentHead !== expectedHead) {
          throw new Error(
            "Space changed before restore started; refresh History and try again"
          )
        }
        await this.graft.restorePaths(
          this.canonical.root,
          commitId,
          expectedHead,
          paths
        )
        return paths
      },
      afterValidate: async (restoredPaths) => {
        await this.graft.stageAll(
          this.canonical.root,
          this.graftStatusOptions()
        )
        await this.graft.commit(
          this.canonical.root,
          `Restore checkpoint ${commitId.slice(0, 8)} (${restoredPaths.length} paths)`
        )
      },
    })
    return this.freshSnapshotAndEmit(true)
  }

  closeEidosFile(sessionId: string): Promise<void> {
    this.pendingEidosFileAssets.delete(sessionId)
    return this.runtimePool.closeSession(sessionId)
  }

  resolveUserPath(relativePath: string): string {
    return resolveSpacePath(this.canonical.root, relativePath)
  }

  clearHostedSyncCredentials(): Promise<void> {
    return this.repository.runForeground(() =>
      this.graft.clearHttpCredentials(this.canonical.root)
    )
  }

  verifyGraftCrashRecoveryForTesting(): Promise<boolean> {
    if (!process.env.EIDOS_LITE_SMOKE_RESULT) {
      throw new Error("Graft crash recovery probe is available only to smoke")
    }
    return this.gate.withRepositoryOperation(
      "Testing Graft utility recovery",
      () => this.graft.verifyCrashRecoveryForTesting(this.canonical.root)
    )
  }

  verifyRuntimeCrashRecoveryForTesting(sessionId: string): Promise<boolean> {
    return this.runtimePool.verifyCrashRecoveryForTesting(sessionId)
  }

  close(): Promise<void> {
    this.closeInFlight ??= this.closeInternal()
    return this.closeInFlight
  }

  private async closeInternal(): Promise<void> {
    this.watcher.close()
    this.cancelVersionReads()
    for (const timer of this.ignoreReconciliationTimers.values()) {
      clearTimeout(timer)
    }
    this.ignoreReconciliationTimers.clear()
    for (const key of this.backgroundIgnoreKeys) this.repository.cancel(key)
    this.backgroundIgnoreKeys.clear()
    const backgroundStatus = this.graftStatusRefresh?.promise
    this.cancelGraftStatusRefresh(true)
    await backgroundStatus?.catch(() => undefined)
    await this.checkpointScheduler
      .close(this.automaticCheckpointsEnabled)
      .catch((error) => {
        console.warn("Could not flush the automatic Space checkpoint", error)
      })
    this.closed = true
    await this.refreshInFlight?.catch(() => undefined)
    await this.gate.close()
    await this.runtimePool.destroy()
    await this.graft.close()
    this.changeListeners.clear()
    this.automaticCheckpointListeners.clear()
    this.pendingEidosFileAssets.clear()
    this.fileIssuesByPath.clear()
    this.ignoreInspectionCache.clear()
    this.directoryEntriesCache.clear()
    this.graftStatusCache = null
    this.cancelGraftStatusRefresh(true)
  }

  private async createAutomaticCheckpoint(): Promise<void> {
    if (!this.automaticCheckpointsEnabled || this.gate.hasActiveMutations()) {
      return
    }
    const checkpoint = await this.commitCheckpoint(
      "Eidos Lite automatic checkpoint",
      true
    )
    if (!checkpoint) return
    const snapshot = await this.checkpointSnapshotAndEmit(checkpoint)
    for (const listener of this.automaticCheckpointListeners) listener(snapshot)
  }

  private async commitCheckpoint(
    message: string,
    automatic: boolean
  ): Promise<CompletedCheckpoint | null> {
    let completed: CompletedCheckpoint | null = null
    try {
      const detail = automatic
        ? "Creating an automatic Space checkpoint"
        : "Creating a local Space checkpoint"
      // A checkpoint only reads the worktree and advances Graft's index/history; it never
      // materializes files back into the Space. SQLite staging uses a consistent online backup,
      // so edits that arrive while the checkpoint is being created safely remain as newer local
      // changes instead of freezing the editor for the duration of a large diff.
      await this.gate.withRepositoryOperation(detail, async () => {
        const status = await this.graft.inspectSpace(
          this.canonical.root,
          this.graftStatusOptions()
        )
        if (!status.available) {
          if (automatic) throw new AutomaticCheckpointSkipped()
          throw new Error(
            status.error ?? "The bundled Graft runtime is unavailable"
          )
        }
        if (!status.initialized) {
          if (automatic) throw new AutomaticCheckpointSkipped()
          throw new Error(
            "Enable local Space versioning before creating a checkpoint"
          )
        }
        if (status.clean) {
          if (automatic) throw new AutomaticCheckpointSkipped()
          throw new Error("There are no local changes to checkpoint")
        }
        await this.graft.stageAll(
          this.canonical.root,
          this.graftStatusOptions()
        )
        const commit = await this.graft.commit(this.canonical.root, message)
        completed = {
          currentHead: commit.id,
          previousStatus: status,
        }
      })
      return completed
    } catch (error) {
      if (error instanceof AutomaticCheckpointSkipped) return null
      throw error
    }
  }

  private async checkpointSnapshotAndEmit(
    checkpoint: CompletedCheckpoint
  ): Promise<SpaceSnapshot> {
    this.invalidateGraftStatusCache()
    const previousSync = checkpoint.previousStatus.sync
    const ahead = previousSync ? previousSync.ahead + 1 : 1
    const behind = previousSync?.behind ?? 0
    const sync =
      previousSync || this.syncHistoryState
        ? {
            state:
              ahead > 0 && behind > 0
                ? ("diverged" as const)
                : ahead > 0
                  ? ("ahead" as const)
                  : behind > 0
                    ? ("behind" as const)
                    : ("up_to_date" as const),
            ...(previousSync?.remoteHead
              ? { remoteHead: previousSync.remoteHead }
              : {}),
            ahead,
            behind,
          }
        : undefined
    // Stage + commit already established the new history boundary. Do not make
    // Save version wait for another whole-worktree classification: Graft
    // invalidates its status cache after a commit, and rebuilding it can reread a
    // very large SQLite file even though the version is already durable. Publish
    // the new HEAD immediately and serialize the authoritative dirty check in the
    // background so edits made during the checkpoint remain safe.
    const pendingStatus: GraftSpaceStatus = {
      available: true,
      backend: this.graft.backend,
      version:
        checkpoint.previousStatus.version ?? this.graft.expectedVersion(),
      expectedVersion: this.graft.expectedVersion(),
      initialized: true,
      currentHead: checkpoint.currentHead,
      checking: true,
      ...(checkpoint.previousStatus.generation === undefined
        ? {}
        : { generation: checkpoint.previousStatus.generation + 1 }),
      changeToken: `checkpoint:${checkpoint.currentHead}`,
      ...(sync ? { sync } : {}),
    }
    this.lastKnownGraftStatus = pendingStatus
    const snapshot = await this.readSnapshot(false, pendingStatus)
    for (const listener of this.changeListeners) listener(snapshot)
    this.scheduleGraftStatusRefresh()
    return snapshot
  }

  private async readSnapshot(
    scheduleGraftStatus: boolean,
    authoritativeGraftStatus?: GraftSpaceStatus
  ): Promise<SpaceSnapshot> {
    const reconciledFileIssues = await this.runtimePool.reconcilePaths(() =>
      ["ready", "syncing"].includes(this.gate.current().phase)
    )
    for (const issue of reconciledFileIssues) {
      this.fileIssuesByPath.set(issue.relativePath, issue)
    }
    // A Space snapshot is the local browsing boundary. Version state is filled in
    // progressively and must not delay the first usable tree.
    await this.loadDirectoryEntries("", false)
    const entries = this.buildCachedTree()
    const graft =
      authoritativeGraftStatus ??
      this.graftStatusCache ??
      this.pendingGraftStatus()
    if (
      !authoritativeGraftStatus &&
      !this.graftStatusCache &&
      scheduleGraftStatus
    ) {
      this.scheduleGraftStatusRefresh()
    }
    return this.buildSnapshot(entries, graft)
  }

  private pendingGraftStatus(): GraftSpaceStatus {
    if (this.lastKnownGraftStatus) {
      return {
        ...this.lastKnownGraftStatus,
        checking: true,
      }
    }
    return {
      available: true,
      backend: this.graft.backend,
      version: this.graft.expectedVersion(),
      expectedVersion: this.graft.expectedVersion(),
      initialized: this.versioningEnabled,
      checking: true,
    }
  }

  private graftStatusOptions(signal?: AbortSignal): {
    signal?: AbortSignal
    verifyPaths: string[]
  } {
    return {
      ...(signal ? { signal } : {}),
      verifyPaths: this.runtimePool.openRelativePaths(),
    }
  }

  private async refreshGraftStatus(
    authoritative = false
  ): Promise<GraftSpaceStatus> {
    const epoch = this.graftStatusEpoch
    const activeRefresh = this.graftStatusRefresh
    if (activeRefresh) {
      if (activeRefresh.epoch === epoch) {
        if (authoritative) activeRefresh.authoritative = true
        return activeRefresh.promise
      }
      // An invalidation does not abort a repository read that is already useful.
      // Let it settle, discard the stale generation, then perform exactly one
      // follow-up read for the latest generation.
      await activeRefresh.promise.catch(() => undefined)
      if (this.closed) throw new Error("Space is closed")
      return this.refreshGraftStatus(authoritative)
    }
    const readStatus = (signal: AbortSignal) =>
      this.graft.inspectSpace(
        this.canonical.root,
        this.graftStatusOptions(signal)
      )
    const promise = authoritative
      ? this.repository.runForeground(readStatus, {
          key: "graft-status",
          preemptible: true,
        })
      : this.repository.runBackground("graft-status", readStatus, {
          preemptible: true,
        })
    this.graftStatusRefresh = { epoch, authoritative, promise }
    let status: GraftSpaceStatus
    try {
      status = await promise
    } finally {
      if (this.graftStatusRefresh?.promise === promise) {
        this.graftStatusRefresh = null
      }
    }
    if (!this.closed && this.graftStatusEpoch !== epoch) {
      return this.refreshGraftStatus(authoritative)
    }
    if (!this.closed) {
      this.graftStatusCache = status
      this.lastKnownGraftStatus = status
    }
    return status
  }

  private scheduleGraftStatusRefresh(): void {
    if (
      this.closed ||
      this.gate.hasActiveMutations() ||
      this.graftStatusCache ||
      this.graftStatusRefresh ||
      this.graftStatusTimer
    ) {
      return
    }
    this.graftStatusTimer = setTimeout(() => {
      this.graftStatusTimer = null
      void this.refreshGraftStatus()
        .then(() => this.emitCachedOperationSnapshot())
        .catch(() => undefined)
    }, BACKGROUND_GRAFT_STATUS_DELAY_MS)
  }

  private prioritizeLocalWork(): void {
    if (this.graftStatusTimer) {
      clearTimeout(this.graftStatusTimer)
      this.graftStatusTimer = null
    }
    for (const timer of this.ignoreReconciliationTimers.values()) {
      clearTimeout(timer)
    }
    this.ignoreReconciliationTimers.clear()
    for (const key of this.backgroundIgnoreKeys) this.repository.cancel(key)
    this.backgroundIgnoreKeys.clear()
    if (this.graftStatusRefresh && !this.graftStatusRefresh.authoritative) {
      // Local data is the latency-critical path and must not wait or compete with
      // an optional repository refresh. Cancellation is best-effort if Graft has
      // already entered a non-interruptible cold open; the delayed reschedule keeps
      // that case away from normal click-to-open and edit paths.
      this.cancelGraftStatusRefresh()
    }
  }

  private async loadDirectoryEntries(
    relativePath: string,
    respectIgnores = this.graftSessionOpen()
  ): Promise<void> {
    const key = relativePath === "." ? "" : relativePath
    if (this.directoryEntriesCache.has(key)) return
    const entries = await listSpaceDirectory(
      this.canonical.root,
      key || null,
      respectIgnores
        ? {
            ignoredPaths: async (relativePaths) => {
              const ignored = await this.inspectIgnores(relativePaths)
              return new Set(
                [...ignored.entries()]
                  .filter(([, inspection]) =>
                    this.shouldPruneIgnored(inspection)
                  )
                  .map(([ignoredPath]) => ignoredPath)
              )
            },
          }
        : {}
    )
    this.directoryEntriesCache.set(key, entries)
    if (!respectIgnores)
      this.reconcileDirectoryIgnoresInBackground(key, entries)
  }

  private reconcileDirectoryIgnoresInBackground(
    relativePath: string,
    entries: readonly SpaceTreeEntry[]
  ): void {
    if (!this.versioningEnabled || entries.length === 0 || this.closed) return
    const existingTimer = this.ignoreReconciliationTimers.get(relativePath)
    if (existingTimer) clearTimeout(existingTimer)
    const timer = setTimeout(() => {
      this.ignoreReconciliationTimers.delete(relativePath)
      if (this.closed) return
      const candidatePaths = entries.map((entry) => entry.relativePath)
      void this.inspectIgnores(candidatePaths, "background")
        .then((inspections) => {
          if (this.closed) return
          const current = this.directoryEntriesCache.get(relativePath)
          if (!current) return
          const filtered = current.filter((entry) => {
            const inspection = inspections.get(entry.relativePath)
            return !inspection || !this.shouldPruneIgnored(inspection)
          })
          if (filtered.length === current.length) return
          this.directoryEntriesCache.set(relativePath, filtered)
          this.emitCachedOperationSnapshot()
        })
        .catch(() => undefined)
    }, BACKGROUND_GRAFT_IGNORE_DELAY_MS)
    this.ignoreReconciliationTimers.set(relativePath, timer)
  }

  private async reloadDirectoryEntries(
    relativePaths: readonly string[],
    respectIgnores: boolean
  ): Promise<void> {
    const sorted = [...new Set(["", ...relativePaths])].sort(
      (left, right) => left.split("/").length - right.split("/").length
    )
    for (const relativePath of sorted) {
      try {
        await this.loadDirectoryEntries(relativePath, respectIgnores)
      } catch (error) {
        if (
          relativePath &&
          error instanceof Error &&
          "code" in error &&
          ["ENOENT", "ENOTDIR"].includes(String(error.code))
        ) {
          continue
        }
        throw error
      }
    }
  }

  private buildCachedTree(relativePath = ""): SpaceTreeEntry[] {
    return (this.directoryEntriesCache.get(relativePath) ?? []).map((entry) => {
      if (entry.kind !== "directory") return entry
      const children = this.directoryEntriesCache.get(entry.relativePath)
      return {
        ...entry,
        children: children ? this.buildCachedTree(entry.relativePath) : [],
        childrenLoaded: children !== undefined,
      }
    })
  }

  private graftSessionOpen(): boolean {
    return typeof this.graft.hasOpenSession === "function"
      ? this.graft.hasOpenSession()
      : false
  }

  private async ensureAncestorDirectoriesLoaded(
    relativePath: string
  ): Promise<void> {
    const normalized = normalizeMutableRelativePath(relativePath)
    const segments = normalized.split("/").slice(0, -1)
    if (segments.length === 0) return
    let current = ""
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment
      // Navigation to a known local file must not wait for repository ignore
      // inspection. Versioning can reconcile Explorer filtering afterwards.
      await this.loadDirectoryEntries(current, false)
    }
    this.emitCachedOperationSnapshot()
  }

  private buildSnapshot(
    entries: SpaceTreeEntry[],
    graft: GraftSpaceStatus
  ): SpaceSnapshot {
    const fileIssues = [...this.fileIssuesByPath.values()]
    const { sync: repositorySync, ...graftStatus } = graft
    const checkedAtMs = this.syncHistoryState
      ? Date.parse(this.syncHistoryState.lastCheckedAt)
      : Number.NaN
    const sync = this.syncHistoryState
      ? {
          state: repositorySync?.state ?? ("unknown" as const),
          ...(repositorySync?.localHead
            ? { localHead: repositorySync.localHead }
            : {}),
          ...(repositorySync?.remoteHead
            ? { remoteHead: repositorySync.remoteHead }
            : {}),
          ...(repositorySync?.commonAncestor
            ? { commonAncestor: repositorySync.commonAncestor }
            : {}),
          ahead: repositorySync?.ahead ?? 0,
          behind: repositorySync?.behind ?? 0,
          ...(Number.isFinite(checkedAtMs) ? { checkedAtMs } : {}),
        }
      : undefined
    return {
      id: this.canonical.id,
      name: this.canonical.name,
      displayPath: this.canonical.displayPath,
      entries,
      eidosFileCount: flattenSpaceTree(entries).filter(
        (entry) => entry.kind === "eidos"
      ).length,
      operation: this.gate.current(),
      graft: {
        ...graftStatus,
        initialized: this.versioningEnabled && graft.initialized,
        ...(sync ? { sync } : {}),
      },
      invalidatedSessionIds: fileIssues.flatMap((issue) =>
        issue.sessionId ? [issue.sessionId] : []
      ),
      fileIssues,
    }
  }

  private async recordSyncHistoryCheck(): Promise<void> {
    try {
      this.syncHistoryState = await this.syncState.markChecked()
    } catch (error) {
      console.warn("Could not cache the latest Space Sync check", error)
    }
  }

  private async inspectIgnores(
    relativePaths: readonly string[],
    priority: "foreground" | "background" = "foreground"
  ): Promise<Map<string, GraftIgnoreInspection>> {
    const normalized = [
      ...new Set(
        relativePaths.map((relativePath) => relativePath.split("\\").join("/"))
      ),
    ]
    if (!this.versioningEnabled) {
      return new Map(
        normalized.map((relativePath) => [
          relativePath,
          {
            path: relativePath,
            isIgnored: false,
            isTracked: false,
            isDirectory: false,
            hasTrackedDescendants: false,
          },
        ])
      )
    }
    const missing = normalized.filter(
      (relativePath) => !this.ignoreInspectionCache.has(relativePath)
    )
    if (missing.length > 0) {
      const inspect = (signal: AbortSignal) =>
        this.graft.inspectIgnores(this.canonical.root, missing, { signal })
      let inspections: GraftIgnoreInspection[]
      if (priority === "background") {
        const key = `ignore:${missing.join("\u0000")}`
        this.backgroundIgnoreKeys.add(key)
        try {
          inspections = await this.repository.runBackground(key, inspect, {
            preemptible: true,
          })
        } finally {
          this.backgroundIgnoreKeys.delete(key)
        }
      } else {
        inspections = await this.repository.runForeground(inspect)
      }
      for (const inspection of inspections) {
        this.ignoreInspectionCache.set(inspection.path, inspection)
      }
    }
    return new Map(
      normalized.flatMap((relativePath) => {
        const inspection = this.ignoreInspectionCache.get(relativePath)
        return inspection ? [[relativePath, inspection]] : []
      })
    )
  }

  private shouldPruneIgnored(inspection: GraftIgnoreInspection): boolean {
    return (
      inspection.isIgnored &&
      !inspection.isTracked &&
      !(inspection.isDirectory && inspection.hasTrackedDescendants)
    )
  }

  private async syncResult(
    state: EidosSyncOutcome["state"],
    message: string,
    pulled: boolean,
    pushed: boolean,
    relation: {
      ahead: number
      behind: number
      currentHead?: string | null
      sync?: SpaceSyncHistoryStatus
    }
  ): Promise<EidosSyncOutcome> {
    return {
      state,
      message,
      pulled,
      pushed,
      ...(relation.sync?.localHead || relation.currentHead
        ? {
            localHead:
              relation.sync?.localHead ?? relation.currentHead ?? undefined,
          }
        : {}),
      ...(relation.sync?.remoteHead
        ? { remoteHead: relation.sync.remoteHead }
        : {}),
      ...(relation.sync?.commonAncestor
        ? { commonAncestor: relation.sync.commonAncestor }
        : {}),
      ahead: relation.ahead,
      behind: relation.behind,
      snapshot: await this.freshSnapshotAndEmit(true),
    }
  }

  private async assertCopyTreeIsPortable(sourcePath: string): Promise<void> {
    const pending = [sourcePath]
    while (pending.length > 0) {
      const current = pending.pop()
      if (!current) continue
      const stats = await fs.lstat(current)
      if (stats.isSymbolicLink()) {
        throw new Error("Space symlinks cannot be copied")
      }
      if (!stats.isDirectory()) {
        if (!stats.isFile()) {
          throw new Error("Only ordinary files and folders can be copied")
        }
        continue
      }
      const children = await fs.readdir(current)
      for (const child of children) {
        if (child.toLowerCase() === ".graft") {
          throw new Error("Nested .graft directories cannot be copied")
        }
        pending.push(path.join(current, child))
      }
    }
  }

  private async refreshAndEmit(
    scheduleGraftStatus = true,
    directoriesToRefresh: readonly string[] = []
  ): Promise<void> {
    if (this.closed) return
    try {
      await Promise.all(
        directoriesToRefresh.map((relativePath) =>
          this.loadDirectoryEntries(relativePath, false)
        )
      )
      const snapshot = await this.readSnapshot(scheduleGraftStatus)
      for (const listener of this.changeListeners) listener(snapshot)
    } catch {
      // The next explicit renderer refresh surfaces the actionable filesystem error.
    }
  }

  private async freshSnapshotAndEmit(
    authoritativeGraft = false
  ): Promise<SpaceSnapshot> {
    const loadedDirectories = [...this.directoryEntriesCache.keys()]
    this.invalidateSnapshotCaches()
    const authoritativeGraftStatus = authoritativeGraft
      ? await this.refreshGraftStatus(true)
      : undefined
    await this.reloadDirectoryEntries(loadedDirectories, authoritativeGraft)
    const snapshot = await this.readSnapshot(
      !authoritativeGraft,
      authoritativeGraftStatus
    )
    for (const listener of this.changeListeners) listener(snapshot)
    return snapshot
  }

  private emitCachedOperationSnapshot(): void {
    if (this.closed || !this.directoryEntriesCache.has("")) return
    const snapshot = this.buildSnapshot(
      this.buildCachedTree(),
      this.graftStatusCache ?? this.pendingGraftStatus()
    )
    for (const listener of this.changeListeners) listener(snapshot)
  }

  private invalidateSnapshotCaches(): void {
    this.invalidateGraftStatusCache()
    this.directoryEntriesCache.clear()
    this.ignoreInspectionCache.clear()
  }

  private invalidateDirectoryCaches(
    relativePaths: readonly string[]
  ): string[] {
    if (relativePaths.length === 0) {
      const loaded = [...this.directoryEntriesCache.keys()]
      this.directoryEntriesCache.clear()
      this.ignoreInspectionCache.clear()
      return loaded
    }
    const directoriesToRefresh = new Set<string>()
    for (const rawPath of relativePaths) {
      if (!rawPath) {
        for (const key of this.directoryEntriesCache.keys()) {
          directoriesToRefresh.add(key)
        }
        this.directoryEntriesCache.clear()
        continue
      }
      const relativePath = rawPath.split("\\").join("/")
      const parent = path.posix.dirname(relativePath)
      const parentKey = parent === "." ? "" : parent
      if (this.directoryEntriesCache.has(parentKey)) {
        directoriesToRefresh.add(parentKey)
      }
      this.directoryEntriesCache.delete(parentKey)
      for (const key of this.directoryEntriesCache.keys()) {
        if (key === relativePath || key.startsWith(`${relativePath}/`)) {
          this.directoryEntriesCache.delete(key)
        }
      }
      this.ignoreInspectionCache.delete(relativePath)
    }
    return [...directoriesToRefresh]
  }

  private invalidateGraftStatusCache(): void {
    this.graftStatusEpoch += 1
    this.graftStatusCache = null
  }

  private cancelGraftStatusRefresh(force = false): void {
    if (this.graftStatusTimer) clearTimeout(this.graftStatusTimer)
    this.graftStatusTimer = null
    if (this.graftStatusRefresh?.authoritative && !force) return
    this.graftStatusEpoch += 1
    this.repository.cancel("graft-status")
    this.graftStatusRefresh = null
  }

  cancelVersionReads(): void {
    for (const key of versionReadKeys) this.repository.cancel(key)
  }

  private async withVersionRead<T>(
    key: VersionReadKey,
    detail: string,
    read: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    try {
      return await this.gate.withRepositoryOperation(detail, read, {
        key,
        replace: true,
        preemptible: true,
      })
    } finally {
      if (!this.graftStatusCache) this.scheduleGraftStatusRefresh()
    }
  }

  private async validateMaterializedWorktree(
    relativePaths?: readonly string[]
  ): Promise<void> {
    const requestedEidosPaths = relativePaths
      ? new Set(
          relativePaths
            .map(normalizeMutableRelativePath)
            .filter((relativePath) =>
              relativePath.toLowerCase().endsWith(".eidos")
            )
        )
      : null
    if (requestedEidosPaths?.size === 0) return
    const entries = flattenSpaceTree(await listSpaceTree(this.canonical.root))
    await this.runtimePool.validatePaths(
      entries
        .filter(
          (entry) =>
            entry.kind === "eidos" &&
            (!requestedEidosPaths ||
              requestedEidosPaths.has(entry.relativePath))
        )
        .map((entry) => entry.relativePath)
    )
  }

  private assertGraftPathsSafeForMerge(status: GraftRepositoryStatus): void {
    const diagnostic = status.pathDiagnostics?.[0]
    if (!diagnostic) return
    const state = diagnostic.status.replaceAll("_", " ")
    const protection = diagnostic.protectedByIndex
      ? "The last indexed version remains protected."
      : "The current worktree bytes are not protected by the index."
    throw new Error(
      `Graft reported ${state} while analyzing ${diagnostic.path}. ${protection} Repair or recover that file before analyzing the merge again.`
    )
  }

  private async ensureEidosMergePolicy(signal: AbortSignal): Promise<void> {
    const current = await this.graft.getMergePolicy(this.canonical.root, {
      signal,
    })
    if (current.active_merge) return

    const entries = flattenSpaceTree(await listSpaceTree(this.canonical.root))
    const tableNames = new Set<string>(EIDOS_FILE_METADATA_TABLES)
    for (const entry of entries) {
      if (entry.kind !== "eidos") continue
      const opened = await this.runtimePool.open(entry.relativePath)
      for (const table of opened.snapshot.tables) {
        tableNames.add(
          table.table.physicalName ??
            table.table.rawTableName ??
            table.table.name
        )
      }
    }

    const columnResolvers: NonNullable<GraftMergePolicy["column_resolvers"]> = {
      ...(current.policy.column_resolvers ?? {}),
    }
    for (const tableName of tableNames) {
      const existing = columnResolvers[tableName] ?? {}
      columnResolvers[tableName] = {
        ...existing,
        [tableName.startsWith("eidos__") ? "updated_at" : "_updated_at"]:
          "max_timestamp",
      }
    }

    const desired: GraftMergePolicy = {
      ...current.policy,
      version: 1,
      same_row_merge: true,
      default_semantic_keys: [
        "_id",
        ...(current.policy.default_semantic_keys ?? []).filter(
          (key) => key !== "_id"
        ),
      ],
      column_resolvers: columnResolvers,
    }
    if (JSON.stringify(desired) === JSON.stringify(current.policy)) return

    const validation = await this.graft.validateMergePolicy(
      this.canonical.root,
      desired,
      { signal }
    )
    if (!validation.valid) {
      const detail = validation.errors
        .map((issue) => `${issue.key}: ${issue.message}`)
        .join("; ")
      throw new Error(
        `Eidos merge policy is invalid${detail ? `: ${detail}` : ""}`
      )
    }
    await this.graft.setMergePolicy(
      this.canonical.root,
      desired,
      current.policy_token,
      { signal }
    )
  }

  private async resolveEidosSystemMetadataMerges(
    initial: EidosSyncMergeStatus & { state: "merging" },
    signal: AbortSignal,
    onWorktreePaths: (paths: string[] | null) => void
  ): Promise<EidosSyncMergeStatus> {
    let merge: EidosSyncMergeStatus = initial
    const eidosPaths: string[] = []
    let after: string | undefined
    do {
      const page = await this.graft.listMergePaths(
        this.canonical.root,
        initial.stateToken,
        {
          filter: "unmerged",
          limit: 100,
          ...(after ? { after } : {}),
          signal,
        }
      )
      eidosPaths.push(
        ...page.items
          .filter(
            (item) =>
              item.kind === "sqlite_database" &&
              item.path.toLowerCase().endsWith(".eidos")
          )
          .map((item) => item.path)
      )
      after = page.nextCursor ?? undefined
    } while (after)

    for (const relativePath of eidosPaths) {
      if (merge.state !== "merging") break
      try {
        const workspace = await this.graft.prepareSemanticMerge(
          this.canonical.root,
          relativePath,
          EIDOS_SYSTEM_MERGE_PROVIDER,
          EIDOS_FILE_METADATA_TABLES,
          merge.stateToken,
          { signal }
        )
        const inputPath = (version: "base" | "ours" | "theirs") => {
          const filePath = workspace.inputs.find(
            (input) => input.version === version
          )?.file_path
          if (!filePath) {
            throw new Error(
              `Eidos system merge requires a ${version} SQLite snapshot`
            )
          }
          return filePath
        }
        const outcome = await this.runtimePool.mergeSystemMetadata({
          basePath: inputPath("base"),
          oursPath: inputPath("ours"),
          theirsPath: inputPath("theirs"),
          resultPath: workspace.result_path,
          oursKey: workspace.orig_head,
          theirsKey: workspace.merge_head,
          operationInstant: new Date(
            workspace.prepared_at_unix_ms
          ).toISOString(),
        })
        if (outcome.outcome === "conflict") {
          await this.graft.recordSemanticMergeConflicts(
            this.canonical.root,
            workspace.provider_token,
            outcome.conflicts,
            outcome.automaticResolutions,
            merge.stateToken,
            { signal }
          )
          continue
        }
        if (outcome.outcome !== "merged") {
          console.warn(
            `Could not automatically merge Eidos system metadata for ${relativePath}`,
            outcome
          )
          continue
        }
        const materializes = await this.graft.operationMaterializesWorktree(
          "acceptSemanticMergeResult",
          { signal }
        )
        if (!materializes) {
          throw new Error(
            "Graft did not declare acceptSemanticMergeResult as a worktree materialization"
          )
        }
        merge = await this.graft.acceptSemanticMergeResult(
          this.canonical.root,
          workspace.provider_token,
          outcome.validation,
          outcome.automaticResolutions,
          merge.stateToken,
          { signal, onWorktreePaths }
        )
      } catch (error) {
        console.warn(
          `Eidos system metadata merge is not available for ${relativePath}`,
          error
        )
      }
    }
    return merge
  }

  private async materializeMergeOperation(
    operationName:
      | "applyMerge"
      | "setMergePathResult"
      | "resolveMergeRow"
      | "resolveMergeCell"
      | "resolveMergeTable"
      | "unresolveMergePath"
      | "writeAndStageTextResult"
      | "continueMerge"
      | "abortMerge",
    kind: string,
    detail: string,
    expectedStateToken: string | null,
    operation: (
      signal: AbortSignal,
      onWorktreePaths: (paths: string[] | null) => void
    ) => Promise<EidosSyncMergeStatus>,
    validationPaths?: readonly string[] | (() => readonly string[] | undefined)
  ): Promise<EidosSyncMergeStatus> {
    const worktreeEffect: { paths: string[] | null } = { paths: null }
    const result = await this.gate.withMaterialization({
      kind,
      detail,
      validationPaths: () =>
        worktreeEffect.paths ??
        (typeof validationPaths === "function"
          ? validationPaths()
          : validationPaths),
      beforeClose: async (signal) => {
        const materializes = await this.graft.operationMaterializesWorktree(
          operationName,
          { signal }
        )
        if (!materializes) {
          throw new Error(
            `Graft did not declare ${operationName} as a worktree materialization`
          )
        }
        if (!expectedStateToken) return
        const merge = await this.graft.getMergeStatus(this.canonical.root, {
          signal,
        })
        if (
          merge.state !== "merging" ||
          merge.stateToken !== expectedStateToken
        ) {
          throw Object.assign(new Error("The merge changed; reload it first"), {
            code: "GRAFT_SDK_REPOSITORY_STALE",
          })
        }
      },
      materialize: (signal) =>
        operation(signal, (paths) => {
          worktreeEffect.paths = paths
        }),
    })
    this.invalidateGraftStatusCache()
    if (worktreeEffect.paths?.length === 0) {
      // An index-only conflict choice changed durable merge metadata but did
      // not change any directory entry or application database. Return the
      // authoritative merge status immediately and refresh general version
      // chrome in the background instead of rescanning the Space.
      this.scheduleGraftStatusRefresh()
      return result
    }
    await this.freshSnapshotAndEmit(true)
    return result
  }

  private safeVersionPageSize(value: number): number {
    if (!Number.isFinite(value)) return 100
    return Math.max(1, Math.min(Math.trunc(value), 100))
  }

  private noteLocalChange(): void {
    this.invalidateGraftStatusCache()
    if (this.versioningEnabled && this.automaticCheckpointsEnabled) {
      this.checkpointScheduler.notifyStableChange()
    }
  }

  private recordPathMoveInBackground(previousPath: string, path: string): void {
    if (!this.versioningEnabled) return
    const key = `graft-path-move:${previousPath}:${path}`
    void this.repository
      .runBackground(
        key,
        (signal) =>
          this.graft.recordPathMove(this.canonical.root, previousPath, path, {
            signal,
          }),
        { preemptible: false }
      )
      .then(() => this.invalidateGraftStatusCache())
      .catch((error) =>
        console.warn(
          `Could not record Space path move ${previousPath} -> ${path}`,
          error
        )
      )
  }

  private assertRuntimeAvailable(): void {
    const phase = this.gate.current().phase
    if (!["ready", "syncing"].includes(phase)) {
      throw new Error(`Space runtime is unavailable while ${phase}`)
    }
  }

  private async requireInitializedVersioning(): Promise<void> {
    if (!this.versioningEnabled) {
      throw new Error("Enable local Space versioning first")
    }
  }

  private assertRevisionId(value: string): void {
    if (!/^[0-9a-f]{64}$/i.test(value)) {
      throw new Error("Invalid Space checkpoint")
    }
  }

  private async requireMissingPath(relativePath: string): Promise<void> {
    try {
      await fs.lstat(this.resolveUserPath(relativePath))
      throw new Error(`A file or folder already exists at ${relativePath}`)
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return
      }
      throw error
    }
  }
}
