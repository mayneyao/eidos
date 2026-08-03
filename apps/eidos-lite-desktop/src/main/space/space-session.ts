import { randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"

import type {
  EidosFileIssue,
  EidosSyncOutcome,
  EidosSyncPhase,
  EidosSyncPreflight,
  EidosSyncPreflightApproval,
  GraftTrackedIgnoredPaths,
  GraftSpaceStatus,
  OpenEidosFileResult,
  RuntimeCalls,
  RuntimeMethod,
  SpaceSnapshot,
  SpacePathMutationResult,
  SpaceVersionDiff,
  SpaceVersionHistory,
  SpaceVersionTextContentDiff,
  SpaceTreeEntry,
  TextFilePreviewResult,
} from "../../shared/contracts"
import {
  EIDOS_LITE_VERSION_TEXT_DIFF_BYTES_MAX,
  RUNTIME_MUTATION_METHODS,
} from "../../shared/contracts"
import type { GraftClient, GraftIgnoreInspection } from "../graft/graft-client"
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
import { SpaceWatcher } from "./space-watcher"
import { StableCheckpointScheduler } from "./stable-checkpoint-scheduler"
import { type SpaceSyncState, SpaceSyncStateStore } from "./sync-state"
import { readTextFilePreview } from "./text-file-preview"
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
const BACKGROUND_GRAFT_STATUS_DELAY_MS =
  process.env.VITEST || process.env.EIDOS_LITE_SMOKE_RESULT ? 0 : 3_000
const BACKGROUND_GRAFT_IGNORE_DELAY_MS =
  process.env.VITEST || process.env.EIDOS_LITE_SMOKE_RESULT
    ? 0
    : BACKGROUND_GRAFT_STATUS_DELAY_MS + 250

class AutomaticCheckpointSkipped extends Error {}

interface CompletedCheckpoint {
  currentHead: string
  previousStatus: GraftSpaceStatus
}

export class SpaceSession {
  readonly runtimePool: RuntimePool
  readonly gate: SpaceOperationGate
  private readonly watcher: SpaceWatcher
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
    this.repository = new SpaceRepositoryCoordinator()
    this.syncState = new SpaceSyncStateStore(
      stateDirectory,
      graft.syncRemoteOrigin
    )
    this.gate = new SpaceOperationGate(
      new SpaceOperationJournal(stateDirectory),
      {
        closeRuntimes: () => this.runtimePool.closeHandles(),
        validateWorktree: async () => {
          const entries = flattenSpaceTree(await listSpaceTree(canonical.root))
          await this.runtimePool.validatePaths(
            entries
              .filter((entry) => entry.kind === "eidos")
              .map((entry) => entry.relativePath)
          )
        },
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
    approval: EidosSyncPreflightApproval
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
        await this.graft.push(this.canonical.root, accessToken)
        this.syncHistoryState = await this.syncState.markFirstPush(remoteUrl)
      }
    )
    return this.freshSnapshotAndEmit(true)
  }

  async syncHostedRemote(
    accessToken: string,
    access: "read_only" | "read_write",
    reportProgress: SyncProgressReporter = () => undefined
  ): Promise<EidosSyncOutcome> {
    const remoteUrl = await this.officialSyncRemoteUrl()
    if (!remoteUrl) throw new Error("This Space is not connected to Eidos Sync")
    await this.gate.withRepositoryOperation(
      "Authenticating Eidos Sync",
      async () => {
        await this.graft.configureOfficialRemote(
          this.canonical.root,
          remoteUrl,
          accessToken
        )
      }
    )

    reportProgress("fetch", "Fetching Hosted Space history")
    let relation = await this.gate.withRepositoryOperation(
      "Fetching Eidos Sync",
      async () => {
        const before = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions()
        )
        if (before.dirty) {
          throw new Error("Create a checkpoint for local changes before Sync")
        }
        await this.graft.fetch(this.canonical.root)
        await this.recordSyncHistoryCheck()
        return this.graft.status(this.canonical.root, this.graftStatusOptions())
      }
    )
    reportProgress("analyze", "Comparing Local and Hosted checkpoints")
    if (relation.hasConflicts || (relation.ahead > 0 && relation.behind > 0)) {
      return this.syncResult(
        "conflict",
        "Local and Hosted history have diverged. No files were replaced. Review History before choosing a recovery path.",
        false,
        false,
        relation
      )
    }

    let pulled = false
    if (relation.behind > 0) {
      if (
        !(await this.repository.runForeground(() =>
          this.graft.operationMaterializesWorktree("pull")
        ))
      ) {
        throw new Error("Graft pull materialization contract is unavailable")
      }
      let shouldPull = true
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
          beforeClose: async () => {
            const current = await this.graft.status(
              this.canonical.root,
              this.graftStatusOptions()
            )
            if (current.dirty) {
              throw new Error(
                "Space changed after fetch. Create a checkpoint and Sync again."
              )
            }
            if (
              current.hasConflicts ||
              (current.ahead > 0 && current.behind > 0)
            ) {
              throw new Error(
                "Local and Hosted history diverged after fetch. No pull was started."
              )
            }
            shouldPull = current.behind > 0
          },
          materialize: async () => {
            if (!shouldPull) return false
            await this.graft.pull(this.canonical.root)
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
    if (relation.ahead > 0) {
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
        async () => {
          const current = await this.graft.status(
            this.canonical.root,
            this.graftStatusOptions()
          )
          if (current.dirty) {
            throw new Error(
              "Space changed before push. Create a checkpoint and Sync again."
            )
          }
          if (current.behind > 0 || current.hasConflicts) {
            throw new Error(
              "Hosted history changed before push. Sync again to re-fetch it."
            )
          }
          await this.graft.push(this.canonical.root, accessToken)
        }
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
      async () => {
        await this.graft.configureOfficialRemote(
          this.canonical.root,
          remoteUrl,
          accessToken
        )
        const before = await this.graft.status(
          this.canonical.root,
          this.graftStatusOptions()
        )
        if (before.dirty) {
          throw new Error(
            "Create a checkpoint for local changes before conflict recovery"
          )
        }
        await this.graft.fetch(this.canonical.root)
        await this.recordSyncHistoryCheck()
        return this.graft.status(this.canonical.root, this.graftStatusOptions())
      }
    )
    if (!relation.hasConflicts && (relation.ahead < 1 || relation.behind < 1)) {
      throw new Error(
        "Local and Hosted history are no longer in the recoverable ahead+behind state. Run Sync Now again."
      )
    }
    return { ahead: relation.ahead, behind: relation.behind }
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
      (signal) =>
        this.graft.sqlitePathDiff(this.canonical.root, normalizedPath, {
          signal,
          ...(tableName ? { table: tableName } : {}),
          ...(rowAfter ? { rowAfter } : {}),
          rowLimit: 100,
          ...(commitId && parentId
            ? { from: parentId, to: commitId }
            : commitId
              ? { root: commitId }
              : {}),
        })
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
    relativePath: string
  ): Promise<SpaceVersionTextContentDiff> {
    await this.requireInitializedVersioning()
    this.assertRevisionId(commitId)
    if (parentId) this.assertRevisionId(parentId)
    const safePath = normalizeMutableRelativePath(relativePath)
    return this.withVersionRead(
      "version-text-diff",
      "Reading checkpoint text",
      () =>
        this.graft.revisionTextDiff(
          this.canonical.root,
          commitId,
          parentId,
          safePath,
          EIDOS_LITE_VERSION_TEXT_DIFF_BYTES_MAX
        )
    )
  }

  async getWorkingTextDiff(
    expectedHead: string | null,
    relativePath: string
  ): Promise<SpaceVersionTextContentDiff> {
    await this.requireInitializedVersioning()
    if (expectedHead) this.assertRevisionId(expectedHead)
    const safePath = normalizeMutableRelativePath(relativePath)
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
                safePath,
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
    const { comparison, restoreMaterializes } =
      await this.repository.runForeground(async () => ({
        comparison: await this.graft.compareRevisions(
          this.canonical.root,
          commitId,
          expectedHead
        ),
        restoreMaterializes:
          await this.graft.operationMaterializesWorktree("restore"),
      }))
    const paths = [...new Set(comparison.paths.map((change) => change.path))]
      .filter(Boolean)
      .sort()
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
          ...(repositorySync?.remoteHead
            ? { remoteHead: repositorySync.remoteHead }
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
    }
  ): Promise<EidosSyncOutcome> {
    return {
      state,
      message,
      pulled,
      pushed,
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
