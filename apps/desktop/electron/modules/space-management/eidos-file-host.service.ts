import { createHash, randomUUID } from "node:crypto"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import {
  assertEidosFileValues,
  eidosFileUriClass,
  normalizeEidosFileAttachmentPath,
  type AdapterCommitReceipt,
  type AssetLease,
  type FileEntry,
  type HostCapabilities,
  type HostError,
  type HostLimits,
  type HostServiceCapabilities,
  type HostSessionState,
  type RequestContext,
  type RuntimeClient,
  type RuntimeSnapshot,
} from "@eidos.space/eidos-file"
import { SpaceFiles, SpaceFilesError } from "@eidos.space/file-space"

import { Inject, IpcInjectable } from "../../common/di"
import { EidosFileAssetLeaseStore } from "./eidos-file-asset-leases"
import { EidosFileRuntimeWorkerClient } from "./eidos-file-runtime-worker-client"
import { SpaceRegistry } from "./space-registry"
import { SpaceResourceLifecycle } from "./space-resource-lifecycle"

const SOURCE_BYTES_MAX = 268_435_456
const ASSET_PREVIEW_BYTES_MAX = 67_108_864
const ASSET_LEASE_SECONDS = 300
const SAFE_RASTER_MEDIA_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/x-icon",
])
const MUTATION_OPERATIONS = new Set<DesktopEidosFileRuntimeOperation>([
  "mutateRows",
  "revertMutation",
  "mutateView",
  "mutateSchema",
  "importCsv",
])
const RUNTIME_OPERATIONS = new Set<DesktopEidosFileRuntimeOperation>([
  "negotiate",
  "getSnapshot",
  "getSchemaPage",
  "queryRows",
  "getRowsById",
  "aggregate",
  "groupRows",
  "queryGroupRows",
  "previewFormula",
  "mutateRows",
  "revertMutation",
  "mutateView",
  "preflightSchema",
  "getSchemaPlanDependencies",
  "mutateSchema",
  "validate",
  "exportCsv",
  "importCsv",
])

const SERVICE_CAPABILITIES: HostServiceCapabilities = Object.freeze({
  canOpenSource: true,
  canCreateSource: true,
  canRequestPermission: false,
  canSaveCopy: false,
  canReconcileCommit: true,
  canResolveConflict: true,
  canRecover: false,
  canUseAssets: true,
})

const SERVICE_LIMITS: HostLimits = Object.freeze({
  sourceBytesMax: String(SOURCE_BYTES_MAX),
  candidateBytesMax: String(SOURCE_BYTES_MAX),
  recoveryBytesMax: "0",
  recoveryEntriesMax: 0,
  recoveryRetentionSecondsMax: 0,
  assetBytesMax: String(SOURCE_BYTES_MAX),
  assetPreviewBytesMax: String(ASSET_PREVIEW_BYTES_MAX),
  concurrentAssetLeasesMax: 16,
  concurrentSessionsMax: 16,
})

const DESKTOP_CAPABILITIES: HostCapabilities = Object.freeze({
  canWriteCurrent: true,
  canSaveCopy: false,
  canRequestPermission: false,
  hasRecovery: false,
  assetReadSchemes: ["relative", "data"],
  assetWriteSchemes: ["relative"],
  casGuarantee: "cooperative",
  atomicReplace: true,
  durability: "best-effort",
})

export type DesktopEidosFileRuntimeOperation = Exclude<
  keyof RuntimeClient,
  "cancel" | "close" | "subscribe"
>

export interface DesktopEidosFileRequestContext {
  requestId: string
  deadlineMilliseconds?: number
}

interface SourceGrant {
  token: string
  spaceId: string
  spacePath: string
  relativePath: string
  files: SpaceFiles
}

type DestinationGrant = SourceGrant

interface AssetSourceGrant {
  token: string
  sessionId: string
  relativePath: string
}

interface SourceVersion {
  mtimeMs: number
  size: number
  digest: string
}

interface DesktopHostSession {
  id: string
  workingId: string
  workingDirectory: string
  workingPath: string
  source: SourceGrant
  access: "read" | "readwrite"
  worker: EidosFileRuntimeWorkerClient
  runtime: RuntimeClient
  state: HostSessionState
  sourceVersion: SourceVersion
  listeners: Set<(state: HostSessionState) => void>
  pending: number
  pendingWaiters: Set<() => void>
  receipt: AdapterCommitReceipt | null
}

/**
 * Electron IPC binding for EA-Host-1.0. Paths are resolved only while issuing
 * opaque grants; renderer code receives session/token identifiers and invokes
 * the Runtime 1.0 surface. SQLite lives exclusively in the dedicated Worker.
 */
@IpcInjectable("eidos-file-host")
export class DesktopEidosFileHostService extends IpcServiceBase {
  private readonly files = new Map<string, SpaceFiles>()
  private readonly sources = new Map<string, SourceGrant>()
  private readonly destinations = new Map<string, DestinationGrant>()
  private readonly assetSources = new Map<string, AssetSourceGrant>()
  private readonly sessions = new Map<string, DesktopHostSession>()
  private readonly writers = new Map<string, string>()

  constructor(
    @Inject(SpaceRegistry) private readonly registry: SpaceRegistry,
    @Inject(SpaceResourceLifecycle)
    resourceLifecycle: SpaceResourceLifecycle,
    @Inject(EidosFileAssetLeaseStore)
    private readonly assetLeases: EidosFileAssetLeaseStore
  ) {
    super()
    resourceLifecycle.register(
      "eidos-file-runtime-host",
      (spacePath) => this.closeSpace(spacePath),
      () => this.closeAll()
    )
  }

  negotiate(
    request: { protocol: "eidos-host"; versions: ["1.0"] },
    context: DesktopEidosFileRequestContext
  ) {
    checkpoint(context)
    if (
      request.protocol !== "eidos-host" ||
      request.versions.length !== 1 ||
      request.versions[0] !== "1.0"
    ) {
      throw hostFailure("unsupported", "Eidos Host 1.0 is required")
    }
    return {
      version: "1.0" as const,
      serviceCapabilities: { ...SERVICE_CAPABILITIES },
      limits: { ...SERVICE_LIMITS },
    }
  }

  async registerSource(
    spaceId: string,
    relativePath: string
  ): Promise<{ sourceToken: string }> {
    if (path.posix.extname(relativePath).toLowerCase() !== ".eidos") {
      throw hostFailure("invalid-source", "Eidos File path must end in .eidos")
    }
    const files = this.getFiles(spaceId)
    const sourceSystemPath = await files.getSystemPath(relativePath)
    const expectedSystemPath = path.resolve(
      files.root,
      ...relativePath.split("/")
    )
    if (sourceSystemPath !== expectedSystemPath) {
      throw hostFailure(
        "invalid-source",
        "Eidos File source symlinks cannot define an asset root"
      )
    }
    const token = `source-${randomUUID()}`
    this.sources.set(token, {
      token,
      spaceId,
      spacePath: files.root,
      relativePath,
      files,
    })
    return { sourceToken: token }
  }

  revokeSource(sourceToken: string): void {
    this.sources.delete(sourceToken)
    this.destinations.delete(sourceToken)
  }

  async registerDestination(
    spaceId: string,
    relativePath: string
  ): Promise<{ destinationToken: string }> {
    if (path.posix.extname(relativePath).toLowerCase() !== ".eidos") {
      throw hostFailure("invalid-request", "Eidos File path must end in .eidos")
    }
    const files = this.getFiles(spaceId)
    const token = `destination-${randomUUID()}`
    this.destinations.set(token, {
      token,
      spaceId,
      spacePath: files.root,
      relativePath,
      files,
    })
    return { destinationToken: token }
  }

  async openSource(
    request: { sourceToken: string; access: "read" | "readwrite" },
    context: DesktopEidosFileRequestContext
  ): Promise<{ sessionId: string; state: HostSessionState }> {
    checkpoint(context)
    if (request.access !== "read" && request.access !== "readwrite") {
      throw hostFailure("invalid-request", "Source access mode is invalid")
    }
    const source = this.sources.get(request.sourceToken)
    if (!source) throw hostFailure("invalid-request", "Source token is invalid")
    if (this.sessions.size >= SERVICE_LIMITS.concurrentSessionsMax) {
      throw hostFailure(
        "resource-limit",
        "Concurrent Host session limit reached"
      )
    }
    const writerKey = this.writerKey(source)
    const reservation =
      request.access === "readwrite" ? this.reserveWriter(writerKey) : undefined
    try {
      const opened = await this.openWorkingCopy(source, request.access)
      checkpoint(context)
      const id = `session-${randomUUID()}`
      const session = {
        id,
        workingId: opened.workingId,
        workingDirectory: opened.workingDirectory,
        workingPath: opened.workingPath,
        source,
        access: request.access,
        worker: opened.worker,
        runtime: opened.runtime,
        sourceVersion: opened.sourceVersion,
        listeners: new Set(),
        pending: 0,
        pendingWaiters: new Set(),
        receipt: null,
        state: {} as HostSessionState,
      } satisfies DesktopHostSession
      session.state = this.state(
        session,
        opened.snapshot,
        request.access === "read" ? "ready-readonly" : "ready-clean"
      )
      opened.receiptTarget.current = session
      this.sessions.set(id, session)
      if (reservation) this.writers.set(writerKey, id)
      return { sessionId: id, state: session.state }
    } catch (error) {
      if (reservation && this.writers.get(writerKey) === reservation) {
        this.writers.delete(writerKey)
      }
      throw error
    }
  }

  async createSource(
    request: { destinationToken: string; title: string },
    context: DesktopEidosFileRequestContext
  ): Promise<{ sessionId: string; state: HostSessionState }> {
    checkpoint(context)
    const destination = this.destinations.get(request.destinationToken)
    if (!destination) {
      throw hostFailure("invalid-request", "Destination token is invalid")
    }
    if (!request.title.trim()) {
      throw hostFailure("invalid-request", "Eidos File title is required")
    }
    if (this.sessions.size >= SERVICE_LIMITS.concurrentSessionsMax) {
      throw hostFailure(
        "resource-limit",
        "Concurrent Host session limit reached"
      )
    }
    const writerKey = this.writerKey(destination)
    const reservation = this.reserveWriter(writerKey)
    let workingDirectory: string | undefined
    let worker: EidosFileRuntimeWorkerClient | undefined
    try {
      workingDirectory = await mkdtemp(
        path.join(tmpdir(), "eidos-file-desktop-")
      )
      await chmod(workingDirectory, 0o700)
      const workingPath = path.join(workingDirectory, "working.eidos")
      await writeFile(workingPath, new Uint8Array(), { mode: 0o600 })
      const workingId = `working-${randomUUID()}`
      const receiptTarget: { current?: DesktopHostSession } = {}
      worker = new EidosFileRuntimeWorkerClient(
        {
          workingPath,
          workingId,
          access: "readwrite",
          create: { title: request.title.trim() },
        },
        {
          retainReceipt: (receipt) => {
            if (receiptTarget.current) receiptTarget.current.receipt = receipt
          },
          settleReceipt: (receipt) => {
            if (
              receiptTarget.current?.receipt?.receiptID === receipt.receiptID
            ) {
              receiptTarget.current.receipt = null
            }
          },
        }
      )
      const opened = await worker.open()
      const candidate = await worker.export(SERVICE_LIMITS.candidateBytesMax)
      const published = await destination.files.createBinary(
        destination.relativePath,
        candidate
      )
      const id = `session-${randomUUID()}`
      const source: SourceGrant = {
        ...destination,
        token: `source-${randomUUID()}`,
      }
      this.sources.set(source.token, source)
      const session = {
        id,
        workingId,
        workingDirectory,
        workingPath,
        source,
        access: "readwrite" as const,
        worker,
        runtime: opened.runtime,
        sourceVersion: {
          size: published.size,
          mtimeMs: published.mtimeMs,
          digest: digest(candidate),
        },
        listeners: new Set(),
        pending: 0,
        pendingWaiters: new Set(),
        receipt: null,
        state: {} as HostSessionState,
      } satisfies DesktopHostSession
      session.state = this.state(session, opened.snapshot, "ready-clean")
      receiptTarget.current = session
      this.sessions.set(id, session)
      this.writers.set(writerKey, id)
      this.destinations.delete(request.destinationToken)
      return { sessionId: id, state: session.state }
    } catch (error) {
      if (this.writers.get(writerKey) === reservation) {
        this.writers.delete(writerKey)
      }
      await worker?.terminate()
      if (workingDirectory) {
        await rm(workingDirectory, { recursive: true, force: true })
      }
      throw normalizeHostError(error, "publication-failed")
    }
  }

  getSessionState(sessionId: string): HostSessionState {
    return this.session(sessionId).state
  }

  async invokeRuntime(
    sessionId: string,
    operation: DesktopEidosFileRuntimeOperation,
    request: unknown,
    context: DesktopEidosFileRequestContext
  ): Promise<unknown> {
    checkpoint(context)
    const session = this.session(sessionId)
    if (session.state.phase === "publishing") {
      throw runtimeFailure("busy", "Host publication is active", true)
    }
    if (session.state.phase === "commit-unknown") {
      throw runtimeFailure(
        "unknown-commit",
        "Commit outcome must be reconciled before continuing"
      )
    }
    if (!RUNTIME_OPERATIONS.has(operation)) {
      throw runtimeFailure(
        "invalid-request",
        `Runtime operation is invalid: ${String(operation)}`
      )
    }
    const method = session.runtime[operation] as unknown
    if (typeof method !== "function") {
      throw runtimeFailure(
        "unsupported",
        `Runtime operation is unavailable: ${operation}`
      )
    }
    session.pending += 1
    try {
      const result = await (
        method as (
          input: unknown,
          runtimeContext: RequestContext
        ) => Promise<unknown>
      ).call(session.runtime, request, context)
      if (
        MUTATION_OPERATIONS.has(operation) &&
        isRecord(result) &&
        result.changed === true &&
        typeof result.revision === "string"
      ) {
        session.state = {
          ...session.state,
          phase: "ready-dirty",
          revision: result.revision,
          error: undefined,
        }
        this.emit(session)
      }
      return result
    } catch (error) {
      if (
        isRecord(error) &&
        error.code === "unknown-commit" &&
        session.receipt
      ) {
        session.state = {
          ...session.state,
          phase: "commit-unknown",
          revision: undefined,
          error: hostFailure(
            "unknown-commit",
            "Mutation commit outcome is unknown"
          ),
        }
        this.emit(session)
      }
      throw error
    } finally {
      session.pending -= 1
      if (session.pending === 0) {
        for (const resolve of session.pendingWaiters) resolve()
        session.pendingWaiters.clear()
      }
    }
  }

  cancelRuntime(sessionId: string, requestId: string): Promise<void> {
    return this.session(sessionId).runtime.cancel({ requestId })
  }

  async save(
    request: { sessionId: string },
    context: DesktopEidosFileRequestContext
  ): Promise<{ state: HostSessionState }> {
    checkpoint(context)
    const session = this.session(request.sessionId)
    if (!session.state.capabilities.canWriteCurrent) {
      throw hostFailure("permission-denied", "Current source is read-only")
    }
    if (session.state.phase === "ready-clean") return { state: session.state }
    if (session.state.phase !== "ready-dirty") {
      throw hostFailure("invalid-request", "Host session is not saveable")
    }
    await this.waitForRuntime(session)
    checkpoint(context)
    this.transition(session, "publishing")
    try {
      const candidate = await session.worker.export(
        session.state.limits.candidateBytesMax
      )
      checkpoint(context)
      const saved = await session.source.files.writeBinary(
        session.source.relativePath,
        candidate,
        session.sourceVersion.mtimeMs,
        session.sourceVersion.digest
      )
      session.sourceVersion = {
        size: saved.size,
        mtimeMs: saved.mtimeMs,
        digest: digest(candidate),
      }
      this.transition(session, "ready-clean")
      return { state: session.state }
    } catch (error) {
      if (error instanceof SpaceFilesError && error.code === "file-changed") {
        session.state = {
          ...session.state,
          phase: "conflict",
          revision: undefined,
          conflictToken: `conflict-${randomUUID()}`,
          error: hostFailure(
            "conflict",
            "Source changed since it was opened",
            true
          ),
        }
        this.emit(session)
        throw toError(session.state.error)
      }
      this.transition(session, "ready-dirty")
      throw normalizeHostError(error, "publication-failed")
    }
  }

  async reconcileCommit(
    request: { sessionId: string },
    context: DesktopEidosFileRequestContext
  ): Promise<{
    state: HostSessionState
    outcome: "committed" | "rolled-back" | "conflict"
    runtimeReplaced?: true
    reconciliation?: AdapterCommitReceipt["reconciliation"]
  }> {
    checkpoint(context)
    const session = this.session(request.sessionId)
    const receipt = session.receipt
    if (session.state.phase !== "commit-unknown" || !receipt) {
      throw hostFailure("invalid-request", "Session has no unknown commit")
    }
    this.assetLeases.releaseSession(session.id)
    await session.worker.terminate()
    const replacement = await this.openExistingWorkingCopy(session)
    session.worker = replacement.worker
    session.runtime = replacement.runtime
    session.receipt = null
    const revision = replacement.snapshot.revision
    if (revision === receipt.commitRevision) {
      session.state = this.state(session, replacement.snapshot, "ready-dirty")
      this.emit(session)
      return {
        state: session.state,
        outcome: "committed",
        runtimeReplaced: true,
        reconciliation: receipt.reconciliation,
      }
    }
    if (revision === receipt.baseRevision) {
      session.state = this.state(session, replacement.snapshot, "ready-dirty")
      this.emit(session)
      return {
        state: session.state,
        outcome: "rolled-back",
        runtimeReplaced: true,
      }
    }
    session.state = {
      ...session.state,
      phase: "conflict",
      revision: undefined,
      conflictToken: `conflict-${randomUUID()}`,
    }
    this.emit(session)
    return { state: session.state, outcome: "conflict" }
  }

  async resolveConflict(
    request: {
      sessionId: string
      strategy: "reload" | "save-copy" | "merge"
      conflictToken: string
    },
    context: DesktopEidosFileRequestContext
  ): Promise<{ state: HostSessionState; runtimeReplaced?: true }> {
    checkpoint(context)
    const session = this.session(request.sessionId)
    if (
      session.state.phase !== "conflict" ||
      request.conflictToken !== session.state.conflictToken
    ) {
      throw hostFailure("invalid-request", "Conflict token is invalid")
    }
    if (request.strategy !== "reload") {
      throw hostFailure(
        "unsupported",
        "Only reload conflict resolution is available"
      )
    }
    await this.replaceFromSource(session)
    return { state: session.state, runtimeReplaced: true }
  }

  listRecovery(
    _request: { sessionId: string },
    context: DesktopEidosFileRequestContext
  ): { items: [] } {
    checkpoint(context)
    return { items: [] }
  }

  async registerAssetSource(
    sessionId: string,
    relativePath: string
  ): Promise<{ sourceToken: string }> {
    const session = this.session(sessionId)
    if (!session.state.capabilities.assetWriteSchemes.includes("relative")) {
      throw hostFailure("unsupported", "Relative asset import is unavailable")
    }
    await this.assertRelativeAssetPath(session, relativePath)
    const token = `asset-source-${randomUUID()}`
    this.assetSources.set(token, { token, sessionId, relativePath })
    return { sourceToken: token }
  }

  async acquireAsset(
    request: { sessionId: string; sourceToken: string },
    context: DesktopEidosFileRequestContext
  ): Promise<{ entry: FileEntry }> {
    checkpoint(context)
    const session = this.session(request.sessionId)
    const source = this.assetSources.get(request.sourceToken)
    if (!source || source.sessionId !== session.id) {
      throw hostFailure("invalid-request", "Asset source token is invalid")
    }
    this.assetSources.delete(source.token)
    const relativeToRoot = await this.assertRelativeAssetPath(
      session,
      source.relativePath
    )
    const file = await session.source.files.readBinary(source.relativePath)
    if (file.size > SOURCE_BYTES_MAX) {
      throw hostFailure("resource-limit", "Asset exceeds assetBytesMax")
    }
    const uri = normalizeEidosFileAttachmentPath(relativeToRoot)
    if (!uri || eidosFileUriClass(uri) !== "relative") {
      throw hostFailure("invalid-request", "Asset URI is invalid")
    }
    let entry: FileEntry
    try {
      entry = await session.worker.allocateFileEntry({
        name: path.posix.basename(source.relativePath),
        mediaType: detectAssetMediaType(file.content, source.relativePath),
        size: String(file.size),
        uri,
      })
    } catch (error) {
      throw assetHostFailure(error, "invalid-request")
    }
    return { entry }
  }

  async resolveAsset(
    request: {
      sessionId: string
      entryId: string
      purpose: "thumbnail" | "preview" | "download"
    },
    context: DesktopEidosFileRequestContext
  ): Promise<AssetLease> {
    checkpoint(context)
    const session = this.session(request.sessionId)
    if (
      this.assetLeases.countSession(session.id) >=
      SERVICE_LIMITS.concurrentAssetLeasesMax
    ) {
      throw hostFailure(
        "resource-limit",
        "Concurrent asset lease limit reached"
      )
    }
    let entry: FileEntry
    try {
      entry = assertEidosFileValues([
        await session.worker.findFileEntry(request.entryId),
      ])[0] as FileEntry
    } catch (error) {
      throw assetHostFailure(error, "asset-unavailable")
    }
    const uriClass = eidosFileUriClass(entry.uri)
    if (
      !uriClass ||
      !session.state.capabilities.assetReadSchemes.includes(uriClass)
    ) {
      throw hostFailure("asset-unavailable", "Asset URI scheme is unavailable")
    }
    const maximum =
      request.purpose === "download"
        ? SOURCE_BYTES_MAX
        : ASSET_PREVIEW_BYTES_MAX
    const declaredSize = Number(entry.size)
    if (!Number.isSafeInteger(declaredSize) || declaredSize > maximum) {
      throw hostFailure("resource-limit", "Asset exceeds the purpose limit")
    }
    let bytes: Uint8Array
    try {
      bytes = await this.readAssetBytes(session, entry, uriClass)
    } catch (error) {
      throw assetHostFailure(error, "asset-unavailable")
    }
    if (bytes.byteLength !== declaredSize) {
      throw hostFailure(
        "asset-unavailable",
        "Asset size does not match File metadata"
      )
    }
    if (request.purpose === "thumbnail") {
      if (!SAFE_RASTER_MEDIA_TYPES.has(entry.mediaType)) {
        throw hostFailure(
          "asset-unavailable",
          "Asset is not a safe raster image"
        )
      }
      const detected = detectRasterMediaType(bytes)
      if (detected !== entry.mediaType) {
        throw hostFailure(
          "asset-unavailable",
          "Image bytes do not match File media type"
        )
      }
    }
    const leaseId = `asset-lease-${randomUUID()}`
    const expiresAtMilliseconds = Date.now() + ASSET_LEASE_SECONDS * 1_000
    return this.assetLeases.issue({
      sessionId: session.id,
      spaceId: session.source.spaceId,
      bytes,
      expiresAtMilliseconds,
      lease: {
        leaseId,
        entryId: entry.id,
        purpose: request.purpose,
        mediaType: entry.mediaType,
        name: entry.name,
        size: entry.size,
        expiresAt: new Date(expiresAtMilliseconds).toISOString(),
      },
    })
  }

  releaseAsset(
    request: { sessionId: string; leaseId: string },
    context: DesktopEidosFileRequestContext
  ): void {
    checkpoint(context)
    this.session(request.sessionId)
    this.assetLeases.release(request.sessionId, request.leaseId)
  }

  async activateAsset(
    request: {
      sessionId: string
      leaseId: string
      action: "open" | "download"
    },
    context: DesktopEidosFileRequestContext
  ): Promise<void> {
    checkpoint(context)
    const session = this.session(request.sessionId)
    const record = this.assetLeases.get(session.id, request.leaseId)
    if (
      (request.action === "open" && record.lease.purpose !== "preview") ||
      (request.action === "download" && record.lease.purpose !== "download")
    ) {
      throw hostFailure("invalid-request", "Asset lease purpose is invalid")
    }
    const electron = await import("electron")
    const safeName = safeAssetFilename(record.lease.name)
    if (request.action === "download") {
      const selected = await electron.dialog.showSaveDialog({
        defaultPath: safeName,
      })
      if (selected.canceled || !selected.filePath) return
      await writeFile(selected.filePath, record.bytes, { mode: 0o600 })
      return
    }
    const directory = path.join(session.workingDirectory, "opened-assets")
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const target = path.join(directory, `${record.lease.leaseId}-${safeName}`)
    await writeFile(target, record.bytes, { mode: 0o600 })
    const failure = await electron.shell.openPath(target)
    if (failure) throw hostFailure("asset-unavailable", failure)
  }

  async close(
    request: { sessionId: string },
    context: DesktopEidosFileRequestContext
  ): Promise<void> {
    checkpoint(context)
    const session = this.session(request.sessionId)
    await this.closeSession(session)
  }

  private getFiles(spaceId: string): SpaceFiles {
    const space = this.registry.getSpace(spaceId)
    if (!space)
      throw hostFailure("invalid-request", `Space not found: ${spaceId}`)
    if (space.mode !== "file") {
      throw hostFailure(
        "invalid-request",
        `Space is not file-based: ${spaceId}`
      )
    }
    const existing = this.files.get(spaceId)
    if (existing?.root === space.path) return existing
    const files = new SpaceFiles(space.path)
    this.files.set(spaceId, files)
    return files
  }

  private async openWorkingCopy(
    source: SourceGrant,
    access: "read" | "readwrite"
  ) {
    const file = await source.files.readBinary(source.relativePath)
    if (file.size > SOURCE_BYTES_MAX) {
      throw hostFailure("resource-limit", "Source exceeds sourceBytesMax")
    }
    const workingDirectory = await mkdtemp(
      path.join(tmpdir(), "eidos-file-desktop-")
    )
    await chmod(workingDirectory, 0o700)
    const workingPath = path.join(workingDirectory, "working.eidos")
    await writeFile(workingPath, file.content, { mode: 0o600 })
    const workingId = `working-${randomUUID()}`
    let worker: EidosFileRuntimeWorkerClient | undefined
    try {
      const receiptTarget: { current?: DesktopHostSession } = {}
      worker = this.createWorker(workingPath, workingId, access, receiptTarget)
      const opened = await worker.open()
      return {
        workingDirectory,
        workingPath,
        workingId,
        worker,
        runtime: opened.runtime,
        snapshot: opened.snapshot,
        sourceVersion: {
          size: file.size,
          mtimeMs: file.mtimeMs,
          digest: digest(file.content),
        },
        receiptTarget,
      }
    } catch (error) {
      await worker?.terminate()
      await rm(workingDirectory, { recursive: true, force: true })
      throw normalizeHostError(error, "invalid-source")
    }
  }

  private async openExistingWorkingCopy(session: DesktopHostSession) {
    const worker = this.createWorker(
      session.workingPath,
      session.workingId,
      session.access,
      { current: session }
    )
    const opened = await worker.open()
    return { worker, runtime: opened.runtime, snapshot: opened.snapshot }
  }

  private createWorker(
    workingPath: string,
    workingId: string,
    access: "read" | "readwrite",
    receiptTarget?: { current?: DesktopHostSession }
  ): EidosFileRuntimeWorkerClient {
    return new EidosFileRuntimeWorkerClient(
      { workingPath, workingId, access },
      {
        retainReceipt: (receipt) => {
          if (receiptTarget?.current) receiptTarget.current.receipt = receipt
        },
        settleReceipt: (receipt) => {
          if (
            receiptTarget?.current?.receipt?.receiptID === receipt.receiptID
          ) {
            receiptTarget.current.receipt = null
          }
        },
      }
    )
  }

  private async replaceFromSource(session: DesktopHostSession): Promise<void> {
    this.assetLeases.releaseSession(session.id)
    await session.worker.terminate()
    await rm(session.workingDirectory, { recursive: true, force: true })
    const opened = await this.openWorkingCopy(session.source, session.access)
    session.workingDirectory = opened.workingDirectory
    session.workingPath = opened.workingPath
    session.workingId = opened.workingId
    session.worker = opened.worker
    session.runtime = opened.runtime
    session.sourceVersion = opened.sourceVersion
    session.receipt = null
    opened.receiptTarget.current = session
    session.state = this.state(session, opened.snapshot, "ready-clean")
    this.emit(session)
  }

  private state(
    session: DesktopHostSession,
    snapshot: RuntimeSnapshot,
    phase: HostSessionState["phase"]
  ): HostSessionState {
    const readonly = session.access === "read"
    return {
      sessionId: session.id,
      phase: readonly ? "ready-readonly" : phase,
      capabilities: readonly
        ? {
            ...DESKTOP_CAPABILITIES,
            canWriteCurrent: false,
            assetWriteSchemes: [],
          }
        : { ...DESKTOP_CAPABILITIES },
      limits: { ...SERVICE_LIMITS },
      fileId: snapshot.fileId,
      revision: snapshot.revision,
    }
  }

  private transition(
    session: DesktopHostSession,
    phase: HostSessionState["phase"]
  ): void {
    session.state = {
      ...session.state,
      phase,
      error: undefined,
      conflictToken:
        phase === "conflict" ? session.state.conflictToken : undefined,
    }
    this.emit(session)
  }

  private emit(session: DesktopHostSession): void {
    for (const listener of session.listeners) listener(session.state)
  }

  private session(sessionId: string): DesktopHostSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw hostFailure("closed", "Host session is closed")
    return session
  }

  private waitForRuntime(session: DesktopHostSession): Promise<void> {
    if (session.pending === 0) return Promise.resolve()
    return new Promise((resolve) => session.pendingWaiters.add(resolve))
  }

  private async closeSession(session: DesktopHostSession): Promise<void> {
    if (!this.sessions.has(session.id)) return
    this.sessions.delete(session.id)
    this.assetLeases.releaseSession(session.id)
    for (const source of this.assetSources.values()) {
      if (source.sessionId === session.id)
        this.assetSources.delete(source.token)
    }
    try {
      await this.waitForRuntime(session)
      await session.worker.close()
    } finally {
      try {
        await rm(session.workingDirectory, { recursive: true, force: true })
      } finally {
        session.state = { ...session.state, phase: "closed" }
        this.emit(session)
        session.listeners.clear()
        this.sources.delete(session.source.token)
        const writerKey = this.writerKey(session.source)
        if (this.writers.get(writerKey) === session.id) {
          this.writers.delete(writerKey)
        }
      }
    }
  }

  private async assertRelativeAssetPath(
    session: DesktopHostSession,
    relativePath: string
  ): Promise<string> {
    const assetRoot = path.posix.dirname(session.source.relativePath)
    const relativeToRoot = path.posix.relative(assetRoot, relativePath)
    if (
      !relativeToRoot ||
      relativeToRoot === ".." ||
      relativeToRoot.startsWith("../") ||
      path.posix.isAbsolute(relativeToRoot)
    ) {
      throw hostFailure(
        "permission-denied",
        "Asset is outside the session asset root"
      )
    }
    const [rootSystemPath, assetSystemPath] = await Promise.all([
      session.source.files.getSystemPath(assetRoot === "." ? "" : assetRoot),
      session.source.files.getSystemPath(relativePath),
    ])
    const canonicalRelative = path.relative(rootSystemPath, assetSystemPath)
    if (
      canonicalRelative === ".." ||
      canonicalRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(canonicalRelative)
    ) {
      throw hostFailure(
        "permission-denied",
        "Asset symlink escapes the session asset root"
      )
    }
    return relativeToRoot
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")
  }

  private async readAssetBytes(
    session: DesktopHostSession,
    entry: FileEntry,
    uriClass: "relative" | "data" | "https"
  ): Promise<Uint8Array> {
    if (uriClass === "data") {
      const payload = entry.uri.slice(entry.uri.indexOf(",") + 1)
      return new Uint8Array(Buffer.from(payload, "base64"))
    }
    if (uriClass !== "relative") {
      throw hostFailure("asset-unavailable", "Network assets are disabled")
    }
    const parsed = new URL(entry.uri, "https://eidos.invalid/")
    let decodedPath: string
    try {
      decodedPath = parsed.pathname
        .slice(1)
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/")
    } catch {
      throw hostFailure("asset-unavailable", "Asset URI encoding is invalid")
    }
    const assetRoot = path.posix.dirname(session.source.relativePath)
    const relativePath = path.posix.join(assetRoot, decodedPath)
    await this.assertRelativeAssetPath(session, relativePath)
    return (await session.source.files.readBinary(relativePath)).content
  }

  private writerKey(source: SourceGrant): string {
    return `${source.spacePath}\0${source.relativePath}`
  }

  private reserveWriter(writerKey: string): string {
    if (this.writers.has(writerKey)) {
      throw hostFailure(
        "writer-unavailable",
        "Another writable session already owns this Eidos File",
        true
      )
    }
    const reservation = `writer-${randomUUID()}`
    this.writers.set(writerKey, reservation)
    return reservation
  }

  private async closeSpace(spacePath: string): Promise<void> {
    await Promise.all(
      [...this.sessions.values()]
        .filter((session) => session.source.spacePath === spacePath)
        .map((session) => this.closeSession(session))
    )
  }

  private async closeAll(): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map((session) => this.closeSession(session))
    )
  }
}

function checkpoint(context: DesktopEidosFileRequestContext): void {
  if (!context || typeof context.requestId !== "string" || !context.requestId) {
    throw hostFailure("invalid-request", "Request context is invalid")
  }
  if (
    context.deadlineMilliseconds !== undefined &&
    (!Number.isSafeInteger(context.deadlineMilliseconds) ||
      context.deadlineMilliseconds < 1)
  ) {
    throw hostFailure("invalid-request", "Request deadline is invalid")
  }
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`
}

function detectRasterMediaType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg"
  }
  const ascii = (start: number, length: number) =>
    Buffer.from(bytes.subarray(start, start + length)).toString("ascii")
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) {
    return "image/gif"
  }
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    return "image/webp"
  }
  if (bytes.length >= 2 && ascii(0, 2) === "BM") return "image/bmp"
  if (
    bytes.length >= 12 &&
    ascii(4, 4) === "ftyp" &&
    ["avif", "avis"].includes(ascii(8, 4))
  ) {
    return "image/avif"
  }
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x00 &&
      bytes[1] === 0x00 &&
      bytes[2] === 0x01 &&
      bytes[3] === 0x00) ||
      (bytes[0] === 0x00 &&
        bytes[1] === 0x00 &&
        bytes[2] === 0x02 &&
        bytes[3] === 0x00))
  ) {
    return "image/x-icon"
  }
  return null
}

function detectAssetMediaType(bytes: Uint8Array, filename: string): string {
  const raster = detectRasterMediaType(bytes)
  if (raster) return raster
  if (
    bytes.length >= 5 &&
    Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-"
  ) {
    return "application/pdf"
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return "application/zip"
  }
  const extension = path.posix.extname(filename).toLowerCase()
  return (
    {
      ".csv": "text/csv",
      ".json": "application/json",
      ".md": "text/markdown",
      ".mp3": "audio/mpeg",
      ".mp4": "video/mp4",
      ".ogg": "audio/ogg",
      ".txt": "text/plain",
      ".wav": "audio/wav",
      ".webm": "video/webm",
    }[extension] ?? "application/octet-stream"
  )
}

function safeAssetFilename(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 180)
  return sanitized || "attachment"
}

function hostFailure(
  code: HostError["code"],
  message: string,
  retryable = false
): Error & HostError {
  return Object.assign(new Error(message), {
    name: "EidosHostError",
    code,
    message,
    retryable,
  })
}

function assetHostFailure(
  error: unknown,
  fallback: "asset-unavailable" | "invalid-request"
): Error & HostError {
  if (isRecord(error) && error.name === "EidosHostError") {
    return error as unknown as Error & HostError
  }
  const message =
    error instanceof Error
      ? error.message
      : String(error ?? "Asset unavailable")
  const code =
    isRecord(error) && error.code === "resource-limit"
      ? "resource-limit"
      : fallback
  return hostFailure(code, message)
}

function runtimeFailure(
  code: string,
  message: string,
  retryable = false
): Error {
  return Object.assign(new Error(message), {
    name: "EidosRuntimeError",
    code,
    retryable,
  })
}

function normalizeHostError(
  error: unknown,
  fallback: HostError["code"]
): Error {
  if (error instanceof Error) return error
  if (isRecord(error) && typeof error.message === "string") {
    return Object.assign(new Error(error.message), error)
  }
  return hostFailure(fallback, String(error ?? "Unknown Host failure"))
}

function toError(error: HostError | undefined): Error {
  return error
    ? Object.assign(new Error(error.message), error, { name: "EidosHostError" })
    : new Error("Unknown Host failure")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
