import type {
  AdapterCommitReceipt,
  AssetLease,
  HostCommitReconciliationResult,
  HostConflictResult,
  HostError,
  HostLimits,
  HostRecoveryReport,
  HostRecoveryResult,
  HostSaveCopyResult,
  HostSaveResult,
  HostServiceCapabilities,
  HostServices,
  HostSessionState,
  RequestContext,
  RuntimeClient,
} from "@eidos.space/eidos-file"

import { EidosFileWorkerClient } from "../runtime/worker-client"
import type { EidosFileWorkerOpenResult } from "../runtime/protocol"
import {
  openEidosFileHandle,
  readHandleVersion,
  requestWritePermission as requestHandlePermission,
  sameFileVersion,
  supportsSavePicker,
  writeAndVerifyHandle,
  type EidosFileVersion,
  type OpenedBrowserFile,
} from "./browser-file-adapter"

const SERVICE_CAPABILITIES: HostServiceCapabilities = Object.freeze({
  canOpenSource: true,
  canCreateSource: false,
  canRequestPermission: true,
  canSaveCopy: true,
  canReconcileCommit: true,
  canResolveConflict: false,
  canRecover: true,
  canUseAssets: false,
})

const SERVICE_LIMITS: HostLimits = Object.freeze({
  sourceBytesMax: "268435456",
  candidateBytesMax: "268435456",
  recoveryBytesMax: "268435456",
  recoveryEntriesMax: 1,
  recoveryRetentionSecondsMax: 604_800,
  assetBytesMax: "0",
  assetPreviewBytesMax: "0",
  concurrentAssetLeasesMax: 0,
  concurrentSessionsMax: 8,
})

interface BrowserHostSession {
  id: string
  workingID: string
  opened: OpenedBrowserFile
  access: "read" | "readwrite"
  worker: EidosFileWorkerClient
  runtime: RuntimeClient
  state: HostSessionState
  storage: EidosFileWorkerOpenResult["storage"]
  publishedVersion: EidosFileVersion
  listeners: Set<(state: HostSessionState) => void>
  pending: number
  pendingWaiters: Set<() => void>
  receipt: AdapterCommitReceipt | null
  settledReceipt: AdapterCommitReceipt | null
  recoveryCreatedAt: string
}

/**
 * Browser EA-Host-1.0 composition facade. Native file handles are registered
 * outside HostServices and represented to UI only by opaque source/destination
 * tokens. Runtime always stays behind the dedicated Worker transport.
 */
export class BrowserEidosHostServices implements HostServices {
  private readonly sources = new Map<string, OpenedBrowserFile>()
  private readonly destinations = new Map<string, FileSystemFileHandle>()
  private readonly sessions = new Map<string, BrowserHostSession>()

  registerSource(source: OpenedBrowserFile): string {
    const token = opaqueToken("source")
    this.sources.set(token, source)
    return token
  }

  registerDestination(handle: FileSystemFileHandle): string {
    const token = opaqueToken("destination")
    this.destinations.set(token, handle)
    return token
  }

  revokeToken(token: string): void {
    this.sources.delete(token)
    this.destinations.delete(token)
  }

  async negotiate(
    request: { protocol: "eidos-host"; versions: ["1.0"] },
    context: RequestContext
  ) {
    hostCheckpoint(context)()
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

  async openSource(
    request: { sourceToken: string; access: "read" | "readwrite" },
    context: RequestContext
  ) {
    const checkpoint = hostCheckpoint(context)
    checkpoint()
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
    if (BigInt(source.version.size) > BigInt(SERVICE_LIMITS.sourceBytesMax)) {
      throw hostFailure("resource-limit", "Source exceeds sourceBytesMax")
    }
    const sessionID = opaqueToken("session")
    const workingID = opaqueToken("working")
    const worker = new EidosFileWorkerClient()
    const sourceBytes = source.bytes.slice(0)
    let activeWorker = worker
    try {
      let opened = await worker.openSource(
        source.fileName,
        workingID,
        source.bytes.slice(0),
        request.access
      )
      checkpoint()
      let effectiveAccess = request.access
      if (request.access === "readwrite" && opened.storage !== "opfs-sahpool") {
        await worker.close()
        activeWorker = new EidosFileWorkerClient()
        opened = await activeWorker.openSource(
          source.fileName,
          workingID,
          sourceBytes,
          "read"
        )
        checkpoint()
        effectiveAccess = "read"
      }
      const session = {} as BrowserHostSession
      const runtime = await this.openRuntimeClient(
        session,
        activeWorker,
        workingID
      )
      checkpoint()
      Object.assign(session, {
        id: sessionID,
        workingID,
        opened: { ...source, bytes: new ArrayBuffer(0) },
        access: effectiveAccess,
        worker: activeWorker,
        runtime,
        storage: opened.storage,
        publishedVersion: source.version,
        listeners: new Set(),
        pending: 0,
        pendingWaiters: new Set(),
        receipt: null,
        settledReceipt: null,
        recoveryCreatedAt: new Date().toISOString(),
      } satisfies Omit<BrowserHostSession, "state">)
      session.state = this.sessionState(
        session,
        opened,
        opened.migrated || opened.recovered ? "ready-dirty" : "ready-clean"
      )
      session.runtime = this.observeRuntime(session, runtime)
      this.sessions.set(sessionID, session)
      return {
        sessionId: sessionID,
        runtime: session.runtime,
        state: session.state,
      }
    } catch (error) {
      activeWorker.terminate()
      throw normalizeHostFailure(error, "invalid-source")
    }
  }

  async createSource(
    _request: { destinationToken: string; title: string },
    context: RequestContext
  ): Promise<never> {
    hostCheckpoint(context)()
    throw hostFailure(
      "unsupported",
      "Browser Host source creation is unavailable"
    )
  }

  async requestWritePermission(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostSessionState> {
    const checkpoint = hostCheckpoint(context)
    checkpoint()
    const session = this.session(request.sessionId)
    const handle = session.opened.handle
    if (!handle)
      throw hostFailure("unsupported", "Current source has no writable handle")
    const permission = await requestHandlePermission(handle)
    checkpoint()
    session.opened = { ...session.opened, permission }
    session.state = this.sessionState(
      session,
      undefined,
      session.state.phase === "ready-dirty" ? "ready-dirty" : "ready-clean"
    )
    this.emit(session)
    return session.state
  }

  async save(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostSaveResult> {
    const checkpoint = hostCheckpoint(context)
    checkpoint()
    const session = this.session(request.sessionId)
    const handle = session.opened.handle
    if (!handle || !session.state.capabilities.canWriteCurrent) {
      throw hostFailure("permission-denied", "Current source is not writable")
    }
    await this.waitForRuntime(session)
    checkpoint()
    this.transition(session, "publishing")
    try {
      const current = await readHandleVersion(handle)
      checkpoint()
      if (!sameFileVersion(current.version, session.publishedVersion)) {
        const conflictToken = opaqueToken("conflict")
        session.state = {
          ...session.state,
          phase: "conflict",
          conflictToken,
          error: hostFailure(
            "conflict",
            "Source changed since it was opened",
            true
          ),
        }
        this.emit(session)
        throw session.state.error
      }
      const candidate = await session.worker.exportFile(
        session.state.limits.candidateBytesMax
      )
      checkpoint()
      if (
        BigInt(candidate.bytes.byteLength) >
        BigInt(session.state.limits.candidateBytesMax)
      ) {
        throw hostFailure(
          "resource-limit",
          "Candidate exceeds candidateBytesMax"
        )
      }
      session.publishedVersion = await writeAndVerifyHandle(
        handle,
        candidate.bytes
      )
      this.transition(session, "ready-clean")
      return { state: session.state }
    } catch (error) {
      if (session.state.phase !== "conflict")
        this.transition(session, "ready-dirty")
      throw normalizeHostFailure(error, "publication-failed")
    }
  }

  async saveCopy(
    request: {
      sessionId: string
      destinationToken: string
      adopt: "keep-current" | "adopt-copy"
    },
    context: RequestContext
  ): Promise<HostSaveCopyResult> {
    const checkpoint = hostCheckpoint(context)
    checkpoint()
    if (request.adopt !== "keep-current" && request.adopt !== "adopt-copy") {
      throw hostFailure("invalid-request", "Save Copy adoption mode is invalid")
    }
    const session = this.session(request.sessionId)
    const handle = this.destinations.get(request.destinationToken)
    if (!handle)
      throw hostFailure("invalid-request", "Destination token is invalid")
    await this.waitForRuntime(session)
    checkpoint()
    const previousPhase = session.state.phase
    this.transition(session, "publishing")
    try {
      const candidate = await session.worker.exportFile(
        session.state.limits.candidateBytesMax
      )
      checkpoint()
      const version = await writeAndVerifyHandle(handle, candidate.bytes)
      if (request.adopt === "keep-current") {
        this.transition(
          session,
          previousPhase === "ready-clean" ? "ready-clean" : "ready-dirty"
        )
        return { state: session.state, adopted: false }
      }
      const replacementSource = await openEidosFileHandle(handle)
      await session.worker.close()
      const replacementWorker = new EidosFileWorkerClient()
      const opened = await replacementWorker.openSource(
        replacementSource.fileName,
        session.workingID,
        replacementSource.bytes,
        session.access
      )
      const runtime = await this.openRuntimeClient(
        session,
        replacementWorker,
        session.workingID
      )
      session.worker = replacementWorker
      session.opened = { ...replacementSource, bytes: new ArrayBuffer(0) }
      session.publishedVersion = version
      session.storage = opened.storage
      session.runtime = this.observeRuntime(session, runtime)
      session.state = this.sessionState(session, opened, "ready-clean")
      this.emit(session)
      return { state: session.state, adopted: true, runtime: session.runtime }
    } catch (error) {
      this.transition(session, "ready-dirty")
      throw normalizeHostFailure(error, "publication-failed")
    }
  }

  async reconcileCommit(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostCommitReconciliationResult> {
    hostCheckpoint(context)()
    const session = this.session(request.sessionId)
    const receipt = session.receipt
    if (session.state.phase !== "commit-unknown" || !receipt) {
      throw hostFailure("invalid-request", "Session has no unknown commit")
    }
    session.worker.terminate()
    const worker = new EidosFileWorkerClient()
    try {
      const opened = await worker.openRecovery(
        session.opened.fileName,
        session.workingID,
        session.access
      )
      const runtime = await this.openRuntimeClient(
        session,
        worker,
        session.workingID
      )
      const revision = opened.snapshot.revision
      session.worker = worker
      session.runtime = this.observeRuntime(session, runtime)
      session.storage = opened.storage
      session.receipt = null
      if (revision === receipt.commitRevision) {
        session.state = this.sessionState(session, opened, "ready-dirty")
        this.emit(session)
        return {
          state: session.state,
          outcome: "committed",
          runtime: session.runtime,
          reconciliation: receipt.reconciliation,
        }
      }
      if (revision === receipt.baseRevision) {
        session.state = this.sessionState(session, opened, "ready-dirty")
        this.emit(session)
        return {
          state: session.state,
          outcome: "rolled-back",
          runtime: session.runtime,
        }
      }
      session.state = {
        ...session.state,
        phase: "conflict",
        conflictToken: opaqueToken("conflict"),
        revision: undefined,
      }
      this.emit(session)
      return { state: session.state, outcome: "conflict" }
    } catch (error) {
      worker.terminate()
      throw normalizeHostFailure(error, "fatal")
    }
  }

  async resolveConflict(
    _request: {
      sessionId: string
      strategy: "reload" | "save-copy" | "merge"
      conflictToken: string
      destinationToken?: string
      adopt?: "keep-current" | "adopt-copy"
    },
    context: RequestContext
  ): Promise<HostConflictResult> {
    hostCheckpoint(context)()
    throw hostFailure("unsupported", "Conflict resolution is product-defined")
  }

  async listRecovery(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostRecoveryReport> {
    const checkpoint = hostCheckpoint(context)
    checkpoint()
    const session = this.session(request.sessionId)
    if (session.storage !== "opfs-sahpool") return { items: [] }
    await this.waitForRuntime(session)
    checkpoint()
    const [candidate, snapshot] = await Promise.all([
      session.worker.exportFile(session.state.limits.recoveryBytesMax),
      session.runtime.getSnapshot({}, context),
    ])
    checkpoint()
    if (
      BigInt(candidate.bytes.byteLength) >
      BigInt(session.state.limits.recoveryBytesMax)
    ) {
      throw hostFailure(
        "resource-limit",
        "Recovery copy exceeds recoveryBytesMax"
      )
    }
    return {
      items: [
        {
          recoveryToken: session.workingID,
          fileId: snapshot.fileId,
          revision: snapshot.revision,
          createdAt: session.recoveryCreatedAt,
          size: String(candidate.bytes.byteLength),
        },
      ],
    }
  }

  async restoreRecovery(
    request: { sessionId: string; recoveryToken: string },
    context: RequestContext
  ): Promise<HostRecoveryResult> {
    hostCheckpoint(context)()
    const session = this.session(request.sessionId)
    if (request.recoveryToken !== session.workingID) {
      throw hostFailure("invalid-request", "Recovery token is invalid")
    }
    await this.waitForRuntime(session)
    session.worker.terminate()
    const worker = new EidosFileWorkerClient()
    try {
      const opened = await worker.openRecovery(
        session.opened.fileName,
        session.workingID,
        session.access
      )
      const runtime = await this.openRuntimeClient(
        session,
        worker,
        session.workingID
      )
      session.worker = worker
      session.runtime = this.observeRuntime(session, runtime)
      session.storage = opened.storage
      session.state = this.sessionState(session, opened, "ready-dirty")
      this.emit(session)
      return { state: session.state, runtime: session.runtime }
    } catch (error) {
      worker.terminate()
      throw normalizeHostFailure(error, "recovery-required")
    }
  }

  async discardRecovery(
    request: { sessionId: string; recoveryToken: string },
    context: RequestContext
  ): Promise<HostRecoveryResult> {
    hostCheckpoint(context)()
    const session = this.session(request.sessionId)
    if (request.recoveryToken !== session.workingID) {
      throw hostFailure("invalid-request", "Recovery token is invalid")
    }
    await session.worker.discardRecovery(session.workingID)
    session.state = { ...session.state, phase: "closed" }
    this.emit(session)
    this.sessions.delete(session.id)
    return { state: session.state }
  }

  async acquireAsset(
    _request: { sessionId: string; sourceToken: string },
    context: RequestContext
  ): Promise<never> {
    hostCheckpoint(context)()
    throw hostFailure("unsupported", "Browser asset acquisition is unavailable")
  }

  async resolveAsset(
    _request: {
      sessionId: string
      entryId: string
      purpose: "thumbnail" | "preview" | "download"
    },
    context: RequestContext
  ): Promise<AssetLease> {
    hostCheckpoint(context)()
    throw hostFailure("unsupported", "Browser asset resolution is unavailable")
  }

  async releaseAsset(
    _request: { sessionId: string; leaseId: string },
    context: RequestContext
  ): Promise<void> {
    hostCheckpoint(context)()
    throw hostFailure("unsupported", "Browser assets are unavailable")
  }

  async close(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<void> {
    hostCheckpoint(context, false)
    const session = this.session(request.sessionId)
    await this.waitForRuntime(session)
    try {
      await session.worker.close()
    } finally {
      session.state = { ...session.state, phase: "closed" }
      this.emit(session)
      this.sessions.delete(session.id)
      session.listeners.clear()
    }
  }

  subscribe(
    sessionId: string,
    listener: (state: HostSessionState) => void
  ): () => void {
    const session = this.session(sessionId)
    session.listeners.add(listener)
    return () => session.listeners.delete(listener)
  }

  private async openRuntimeClient(
    session: BrowserHostSession,
    worker: EidosFileWorkerClient,
    workingID: string
  ): Promise<RuntimeClient> {
    return worker.runtimeClient(workingID, {
      retain: (receipt) => {
        session.receipt = receipt
      },
      settle: (receipt) => {
        session.settledReceipt = receipt
        if (session.receipt?.receiptID === receipt.receiptID) {
          session.receipt = null
        }
      },
    })
  }

  private observeRuntime(
    session: BrowserHostSession,
    runtime: RuntimeClient
  ): RuntimeClient {
    const mutationNames = new Set([
      "mutateRows",
      "revertMutation",
      "mutateView",
      "mutateSchema",
      "importCsv",
    ])
    return new Proxy(runtime, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver)
        if (typeof property !== "string" || typeof value !== "function")
          return value
        return (...args: unknown[]) => {
          if (
            mutationNames.has(property) &&
            session.state.phase === "publishing"
          ) {
            return Promise.reject(
              runtimeFailure("busy", "Host publication is active", true)
            )
          }
          session.pending += 1
          return Promise.resolve(value.apply(target, args))
            .then(
              (result: unknown) => {
                if (
                  mutationNames.has(property) &&
                  isRecord(result) &&
                  result.changed === true &&
                  typeof result.revision === "string"
                ) {
                  session.state = {
                    ...session.state,
                    phase: "ready-dirty",
                    revision: result.revision,
                  }
                  this.emit(session)
                }
                return result
              },
              (error: unknown) => {
                if (
                  isRecord(error) &&
                  error.code === "unknown-commit" &&
                  session.receipt
                ) {
                  session.state = {
                    ...session.state,
                    phase: "commit-unknown",
                    revision: undefined,
                  }
                  this.emit(session)
                }
                throw error
              }
            )
            .finally(() => {
              session.pending -= 1
              if (session.pending === 0) {
                for (const resolve of session.pendingWaiters) resolve()
                session.pendingWaiters.clear()
              }
            })
        }
      },
    })
  }

  private sessionState(
    session: BrowserHostSession,
    opened?: EidosFileWorkerOpenResult,
    phase: HostSessionState["phase"] = "ready-clean"
  ): HostSessionState {
    const metadata = opened?.snapshot
    const recoverable = (opened?.storage ?? session.storage) === "opfs-sahpool"
    const canWriteCurrent =
      session.access === "readwrite" &&
      recoverable &&
      session.opened.mode === "direct" &&
      session.opened.permission === "granted"
    return {
      sessionId: session.id,
      phase:
        session.access === "read" || !recoverable ? "ready-readonly" : phase,
      capabilities: {
        canWriteCurrent,
        canSaveCopy: supportsSavePicker(),
        canRequestPermission:
          session.access === "readwrite" &&
          recoverable &&
          Boolean(session.opened.handle) &&
          session.opened.permission !== "granted",
        hasRecovery: recoverable,
        assetReadSchemes: [],
        assetWriteSchemes: [],
        casGuarantee: "cooperative",
        atomicReplace: false,
        durability: "best-effort",
      },
      limits: recoverable
        ? { ...SERVICE_LIMITS }
        : {
            ...SERVICE_LIMITS,
            recoveryBytesMax: "0",
            recoveryEntriesMax: 0,
            recoveryRetentionSecondsMax: 0,
          },
      ...(metadata
        ? {
            fileId: metadata.fileId,
            revision: metadata.revision,
          }
        : {
            ...(session.state?.fileId ? { fileId: session.state.fileId } : {}),
            ...(session.state?.revision
              ? { revision: session.state.revision }
              : {}),
          }),
    }
  }

  private transition(
    session: BrowserHostSession,
    phase: HostSessionState["phase"]
  ): void {
    session.state = { ...session.state, phase, error: undefined }
    this.emit(session)
  }

  private emit(session: BrowserHostSession): void {
    for (const listener of session.listeners) listener(session.state)
  }

  private session(sessionId: string): BrowserHostSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw hostFailure("closed", "Host session is closed")
    return session
  }

  private waitForRuntime(session: BrowserHostSession): Promise<void> {
    if (session.pending === 0) return Promise.resolve()
    return new Promise((resolve) => session.pendingWaiters.add(resolve))
  }
}

function opaqueToken(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function hostFailure(
  code: HostError["code"],
  message: string,
  retryable = false
): HostError {
  return { code, message, retryable }
}

function hostCheckpoint(
  context: RequestContext,
  enforceCancellation = true
): () => void {
  if (
    !context ||
    typeof context.requestId !== "string" ||
    context.requestId.length === 0 ||
    context.requestId.includes("\u0000") ||
    new TextEncoder().encode(context.requestId).byteLength > 128 ||
    hasUnpairedSurrogate(context.requestId)
  ) {
    throw hostFailure("invalid-request", "Host requestId is invalid")
  }
  if (
    context.deadlineMilliseconds !== undefined &&
    (!Number.isSafeInteger(context.deadlineMilliseconds) ||
      context.deadlineMilliseconds < 1)
  ) {
    throw hostFailure(
      "invalid-request",
      "deadlineMilliseconds must be a positive safe integer"
    )
  }
  const startedAt = performance.now()
  const checkpoint = () => {
    if (enforceCancellation && context.signal?.aborted) {
      throw hostFailure("cancelled", "Host request was cancelled")
    }
    if (
      enforceCancellation &&
      context.deadlineMilliseconds !== undefined &&
      performance.now() - startedAt >= context.deadlineMilliseconds
    ) {
      throw hostFailure("deadline-exceeded", "Host request deadline exceeded")
    }
  }
  checkpoint()
  return checkpoint
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) return true
  }
  return false
}

function normalizeHostFailure(
  error: unknown,
  fallback: HostError["code"]
): HostError {
  if (
    isRecord(error) &&
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    typeof error.retryable === "boolean"
  )
    return error as unknown as HostError
  return hostFailure(
    fallback,
    error instanceof Error ? error.message : "Browser Host operation failed"
  )
}

function runtimeFailure(code: "busy", message: string, retryable: boolean) {
  return { code, message, retryable }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
