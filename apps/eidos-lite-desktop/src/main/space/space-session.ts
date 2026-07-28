import { randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"

import type {
  EidosSyncOutcome,
  EidosSyncPhase,
  OpenEidosFileResult,
  RuntimeCalls,
  RuntimeMethod,
  SpaceSnapshot,
  SpacePathMutationResult,
  SpaceVersionDiff,
  SpaceVersionHistory,
} from "../../shared/contracts"
import { RUNTIME_MUTATION_METHODS } from "../../shared/contracts"
import { GraftClient } from "../graft/graft-client"
import { RuntimePool } from "../runtime/runtime-pool"
import { SpaceOperationGate } from "./operation-gate"
import { SpaceOperationJournal } from "./operation-journal"
import {
  canonicalizeSpaceRoot,
  flattenSpaceTree,
  joinSpaceRelativePath,
  listSpaceTree,
  normalizeMutableRelativePath,
  normalizeSpaceEntryName,
  resolveSpaceDirectory,
  resolveSpacePath,
  type CanonicalSpace,
} from "./space-paths"
import { SpaceWatcher } from "./space-watcher"
import { SpaceSyncStateStore } from "./sync-state"

const mutationMethods = new Set<RuntimeMethod>(RUNTIME_MUTATION_METHODS)
type SyncProgressReporter = (phase: EidosSyncPhase, detail: string) => void

export class SpaceSession {
  readonly runtimePool: RuntimePool
  readonly gate: SpaceOperationGate
  private readonly watcher: SpaceWatcher
  private readonly syncState: SpaceSyncStateStore
  private readonly changeListeners = new Set<
    (snapshot: SpaceSnapshot) => void
  >()
  private refreshInFlight: Promise<SpaceSnapshot> | null = null
  private closed = false

  private constructor(
    readonly canonical: CanonicalSpace,
    private readonly graft: GraftClient,
    stateDirectory: string,
    workerPath?: string
  ) {
    this.runtimePool = new RuntimePool(canonical.root, workerPath)
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
      }
    )
    this.watcher = new SpaceWatcher(canonical.root, () => {
      void this.refreshAndEmit()
    })
    this.gate.subscribe(() => {
      void this.refreshAndEmit()
    })
  }

  static async create(
    root: string,
    userDataDirectory: string,
    options: { graft?: GraftClient; workerPath?: string } = {}
  ): Promise<SpaceSession> {
    const canonical = await canonicalizeSpaceRoot(root)
    const session = new SpaceSession(
      canonical,
      options.graft ?? new GraftClient(),
      path.join(userDataDirectory, "spaces", canonical.id),
      options.workerPath
    )
    try {
      await session.graft.open(canonical.root)
      await session.gate.recoverInterruptedOperation()
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

  snapshot(): Promise<SpaceSnapshot> {
    if (this.closed) return Promise.reject(new Error("Space is closed"))
    if (this.refreshInFlight) return this.refreshInFlight
    this.refreshInFlight = this.readSnapshot().finally(() => {
      this.refreshInFlight = null
    })
    return this.refreshInFlight
  }

  async openEidosFile(relativePath: string): Promise<OpenEidosFileResult> {
    this.assertRuntimeAvailable()
    return this.runtimePool.open(relativePath)
  }

  async createEidosFile(
    parentRelativePath: string | null,
    requestedName: string
  ): Promise<SpacePathMutationResult> {
    const safeName = normalizeSpaceEntryName(requestedName)
    const name = safeName.toLowerCase().endsWith(".eidos")
      ? safeName
      : `${safeName}.eidos`
    const relativePath = joinSpaceRelativePath(parentRelativePath, name)
    await resolveSpaceDirectory(this.canonical.root, parentRelativePath)
    await this.requireMissingPath(relativePath)
    await this.gate.withMaterialization({
      kind: "create-eidos-file",
      detail: `Creating ${relativePath}`,
      materialize: async () => {
        await this.runtimePool.create(
          relativePath,
          path.basename(name, ".eidos")
        )
      },
    })
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
    const name = normalizeSpaceEntryName(requestedName)
    const relativePath = joinSpaceRelativePath(parentRelativePath, name)
    await resolveSpaceDirectory(this.canonical.root, parentRelativePath)
    await this.requireMissingPath(relativePath)
    await this.gate.withMaterialization({
      kind: "create-folder",
      detail: `Creating ${relativePath}`,
      materialize: () => fs.mkdir(this.resolveUserPath(relativePath)),
    })
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
    await this.gate.withMaterialization({
      kind: "rename-space-path",
      detail: `Renaming ${source}`,
      materialize: async () => {
        invalidatedSessionIds =
          await this.runtimePool.closeSessionsForPath(source)
        await fs.rename(
          this.resolveUserPath(source),
          this.resolveUserPath(target)
        )
      },
    })
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
    await this.gate.withMaterialization({
      kind: "move-space-path",
      detail: `Moving ${source}`,
      materialize: async () => {
        invalidatedSessionIds =
          await this.runtimePool.closeSessionsForPath(source)
        await fs.rename(
          this.resolveUserPath(source),
          this.resolveUserPath(target)
        )
      },
    })
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
    await this.gate.withMaterialization({
      kind: "copy-space-path",
      detail: `Copying ${source}`,
      materialize: () =>
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
        }),
    })
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
    const source = normalizeMutableRelativePath(relativePath)
    await fs.lstat(this.resolveUserPath(source))
    let invalidatedSessionIds: string[] = []
    await this.gate.withMaterialization({
      kind: "delete-space-path",
      detail: `Moving ${source} to Trash`,
      materialize: async () => {
        invalidatedSessionIds =
          await this.runtimePool.closeSessionsForPath(source)
        await trash(this.resolveUserPath(source))
      },
    })
    return {
      snapshot: await this.freshSnapshotAndEmit(),
      invalidatedSessionIds,
    }
  }

  async importFiles(
    sourcePaths: readonly string[],
    targetDirectory: string | null
  ): Promise<SpacePathMutationResult> {
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
    await this.gate.withMaterialization({
      kind: "import-space-files",
      detail: `Importing ${sources.length} file${sources.length === 1 ? "" : "s"}`,
      materialize: async () => {
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
      },
    })
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
    this.assertRuntimeAvailable()
    if (!mutationMethods.has(method)) {
      return this.runtimePool.call(sessionId, method, args)
    }
    const result = await this.gate.withMutation(() =>
      this.runtimePool.call(sessionId, method, args)
    )
    void this.refreshAndEmit()
    return result
  }

  async enableVersioning(): Promise<SpaceSnapshot> {
    const status = await this.graft.inspectSpace(this.canonical.root)
    if (!status.available) {
      throw new Error(
        status.error ?? "The bundled Graft runtime is unavailable"
      )
    }
    if (status.initialized) return this.freshSnapshotAndEmit()
    await this.gate.withMaterialization({
      kind: "enable-versioning",
      detail: "Enabling local Space versioning",
      materialize: async () => {
        await this.graft.initialize(this.canonical.root)
        await this.graft.stageAll(this.canonical.root)
        await this.graft.commit(
          this.canonical.root,
          "Enable Eidos Lite Space versioning"
        )
      },
    })
    return this.freshSnapshotAndEmit()
  }

  async createCheckpoint(message?: string): Promise<SpaceSnapshot> {
    const normalizedMessage = message?.trim() || "Eidos Lite local checkpoint"
    if (normalizedMessage.length > 200) {
      throw new Error("Checkpoint message must be 200 characters or fewer")
    }
    const status = await this.graft.inspectSpace(this.canonical.root)
    if (!status.available) {
      throw new Error(
        status.error ?? "The bundled Graft runtime is unavailable"
      )
    }
    if (!status.initialized) {
      throw new Error(
        "Enable local Space versioning before creating a checkpoint"
      )
    }
    if (status.clean)
      throw new Error("There are no local changes to checkpoint")
    await this.gate.withMaterialization({
      kind: "create-checkpoint",
      detail: "Creating a local Space checkpoint",
      materialize: async () => {
        await this.graft.stageAll(this.canonical.root)
        await this.graft.commit(this.canonical.root, normalizedMessage)
      },
    })
    return this.freshSnapshotAndEmit()
  }

  async officialSyncRemoteUrl(): Promise<string | null> {
    const state = await this.syncState.read()
    if (!state) return null
    const configured = await this.graft.remoteUrl(this.canonical.root)
    if (configured !== state.remoteUrl) {
      throw new Error(
        "The configured Graft Remote does not match this Space's verified Sync state."
      )
    }
    return state.remoteUrl
  }

  async enableHostedSync(
    remoteUrl: string,
    accessToken: string
  ): Promise<SpaceSnapshot> {
    const existing = await this.syncState.read()
    if (existing) {
      if (existing.remoteUrl !== remoteUrl) {
        throw new Error("This Space is already connected to another Remote")
      }
      return this.freshSnapshotAndEmit()
    }
    const status = await this.graft.inspectSpace(this.canonical.root)
    if (!status.available || !status.initialized) {
      throw new Error("Enable Local versioning before Eidos Sync")
    }
    if (status.clean !== true) {
      throw new Error("Create a checkpoint for local changes before Eidos Sync")
    }
    await this.gate.withMaterialization({
      kind: "enable-hosted-sync",
      detail: "Connecting the whole Space to Eidos Sync",
      materialize: async () => {
        await this.graft.configureOfficialRemote(
          this.canonical.root,
          remoteUrl,
          accessToken
        )
        await this.graft.push(this.canonical.root, accessToken)
      },
      afterValidate: () => this.syncState.markFirstPush(remoteUrl),
    })
    return this.freshSnapshotAndEmit()
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
        const before = await this.graft.status(this.canonical.root)
        if (before.dirty) {
          throw new Error("Create a checkpoint for local changes before Sync")
        }
        await this.graft.fetch(this.canonical.root)
        return this.graft.status(this.canonical.root)
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
      if (!(await this.graft.operationMaterializesWorktree("pull"))) {
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
            const current = await this.graft.status(this.canonical.root)
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
      relation = await this.graft.status(this.canonical.root)
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
          const current = await this.graft.status(this.canonical.root)
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
      relation = await this.graft.status(this.canonical.root)
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
        const before = await this.graft.status(this.canonical.root)
        if (before.dirty) {
          throw new Error(
            "Create a checkpoint for local changes before conflict recovery"
          )
        }
        await this.graft.fetch(this.canonical.root)
        return this.graft.status(this.canonical.root)
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
    const status = await this.graft.status(this.canonical.root)
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
    const status = await this.graft.inspectSpace(this.canonical.root)
    if (!status.available || !status.initialized) {
      throw new Error("Enable Local versioning before Eidos Sync")
    }
    if (status.clean !== true) {
      throw new Error("Create a checkpoint for local changes before Eidos Sync")
    }
  }

  async getVersionChanges(): Promise<SpaceVersionDiff> {
    await this.requireInitializedVersioning()
    return this.gate.withRepositoryOperation("Reading local changes", () =>
      this.graft.workingDiff(this.canonical.root)
    )
  }

  async getVersionHistory(limit = 50): Promise<SpaceVersionHistory> {
    await this.requireInitializedVersioning()
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(Math.trunc(limit), 100))
      : 50
    return this.gate.withRepositoryOperation("Reading Space history", () =>
      this.graft.history(this.canonical.root, safeLimit)
    )
  }

  async getVersionDiff(
    commitId: string,
    parentId?: string | null
  ): Promise<SpaceVersionDiff> {
    await this.requireInitializedVersioning()
    this.assertRevisionId(commitId)
    if (parentId) this.assertRevisionId(parentId)
    return this.gate.withRepositoryOperation("Reading checkpoint changes", () =>
      this.graft.revisionDiff(this.canonical.root, commitId, parentId)
    )
  }

  async restoreCheckpoint(
    commitId: string,
    expectedHead: string
  ): Promise<SpaceSnapshot> {
    await this.requireInitializedVersioning()
    this.assertRevisionId(commitId)
    this.assertRevisionId(expectedHead)
    const initialStatus = await this.graft.status(this.canonical.root)
    if (initialStatus.dirty) {
      throw new Error(
        "Create a checkpoint for local changes before restoring history"
      )
    }
    if (initialStatus.currentHead !== expectedHead) {
      throw new Error("Space history changed; refresh History before restoring")
    }
    const comparison = await this.graft.compareRevisions(
      this.canonical.root,
      commitId,
      expectedHead
    )
    const paths = [...new Set(comparison.paths.map((change) => change.path))]
      .filter(Boolean)
      .sort()
    if (paths.length === 0) {
      throw new Error("The Space already matches this checkpoint")
    }
    if (!(await this.graft.operationMaterializesWorktree("restore"))) {
      throw new Error("Graft restore materialization contract is unavailable")
    }

    await this.gate.withMaterialization({
      kind: "restore-checkpoint",
      detail: `Restoring Space checkpoint ${commitId.slice(0, 8)}`,
      materialize: async () => {
        const status = await this.graft.status(this.canonical.root)
        if (status.dirty || status.currentHead !== expectedHead) {
          throw new Error(
            "Space changed before restore started; refresh History and try again"
          )
        }
        for (const relativePath of paths) {
          await this.graft.restorePath(
            this.canonical.root,
            commitId,
            expectedHead,
            relativePath
          )
        }
        return paths
      },
      afterValidate: async (restoredPaths) => {
        await this.graft.stageAll(this.canonical.root)
        await this.graft.commit(
          this.canonical.root,
          `Restore checkpoint ${commitId.slice(0, 8)} (${restoredPaths.length} paths)`
        )
      },
    })
    return this.freshSnapshotAndEmit()
  }

  closeEidosFile(sessionId: string): Promise<void> {
    return this.runtimePool.closeSession(sessionId)
  }

  resolveUserPath(relativePath: string): string {
    return resolveSpacePath(this.canonical.root, relativePath)
  }

  clearHostedSyncCredentials(): Promise<void> {
    return this.graft.clearHttpCredentials(this.canonical.root)
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

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.watcher.close()
    await this.refreshInFlight?.catch(() => undefined)
    await this.gate.close()
    await this.runtimePool.destroy()
    await this.graft.close()
    this.changeListeners.clear()
  }

  private async readSnapshot(): Promise<SpaceSnapshot> {
    const invalidatedSessionIds = await this.runtimePool.reconcilePaths(() =>
      ["ready", "syncing"].includes(this.gate.current().phase)
    )
    const [entries, graft] = await Promise.all([
      listSpaceTree(this.canonical.root),
      this.graft.inspectSpace(this.canonical.root),
    ])
    return {
      id: this.canonical.id,
      name: this.canonical.name,
      displayPath: this.canonical.displayPath,
      entries,
      eidosFileCount: flattenSpaceTree(entries).filter(
        (entry) => entry.kind === "eidos"
      ).length,
      operation: this.gate.current(),
      graft,
      invalidatedSessionIds,
    }
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
      snapshot: await this.freshSnapshotAndEmit(),
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

  private async refreshAndEmit(): Promise<void> {
    if (this.closed) return
    try {
      const snapshot = await this.snapshot()
      for (const listener of this.changeListeners) listener(snapshot)
    } catch {
      // The next explicit renderer refresh surfaces the actionable filesystem error.
    }
  }

  private async freshSnapshotAndEmit(): Promise<SpaceSnapshot> {
    const snapshot = await this.readSnapshot()
    for (const listener of this.changeListeners) listener(snapshot)
    return snapshot
  }

  private assertRuntimeAvailable(): void {
    const phase = this.gate.current().phase
    if (!["ready", "syncing"].includes(phase)) {
      throw new Error(`Space runtime is unavailable while ${phase}`)
    }
  }

  private async requireInitializedVersioning(): Promise<void> {
    const status = await this.graft.inspectSpace(this.canonical.root)
    if (!status.available) {
      throw new Error(
        status.error ?? "The bundled Graft runtime is unavailable"
      )
    }
    if (!status.initialized) {
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
