import { createHash, randomUUID } from "node:crypto"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import {
  type AdapterCommitReceipt,
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
import { EidosFileRuntimeWorkerClient } from "./eidos-file-runtime-worker-client"
import { SpaceRegistry } from "./space-registry"
import { SpaceResourceLifecycle } from "./space-resource-lifecycle"

const SOURCE_BYTES_MAX = 268_435_456
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
  canUseAssets: false,
})

const SERVICE_LIMITS: HostLimits = Object.freeze({
  sourceBytesMax: String(SOURCE_BYTES_MAX),
  candidateBytesMax: String(SOURCE_BYTES_MAX),
  recoveryBytesMax: "0",
  recoveryEntriesMax: 0,
  recoveryRetentionSecondsMax: 0,
  assetBytesMax: "0",
  assetPreviewBytesMax: "0",
  concurrentAssetLeasesMax: 0,
  concurrentSessionsMax: 16,
})

const DESKTOP_CAPABILITIES: HostCapabilities = Object.freeze({
  canWriteCurrent: true,
  canSaveCopy: false,
  canRequestPermission: false,
  hasRecovery: false,
  assetReadSchemes: [],
  assetWriteSchemes: [],
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
  private readonly sessions = new Map<string, DesktopHostSession>()
  private readonly writers = new Map<string, string>()

  constructor(
    @Inject(SpaceRegistry) private readonly registry: SpaceRegistry,
    @Inject(SpaceResourceLifecycle)
    resourceLifecycle: SpaceResourceLifecycle
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
    await files.getSystemPath(relativePath)
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
        ? { ...DESKTOP_CAPABILITIES, canWriteCurrent: false }
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
