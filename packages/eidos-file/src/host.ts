import {
  EIDOS_FILE_EXTENSION,
  EIDOS_FILE_FORMAT,
  EIDOS_FILE_MIME_TYPE,
} from "./constants"
import type { EidosFileDataSource } from "./data-source"
import type { EidosFileMetadata, EidosFileSnapshot } from "./types"

export type EidosFilePermissionState =
  | "granted"
  | "prompt"
  | "denied"
  | "unavailable"

export interface EidosFileHostCapabilities {
  read: true
  write: boolean
  saveAs: boolean
  recovery: boolean
  persistentFileAccess: boolean
}

export interface EidosFileDescriptor {
  /** Stable for the lifetime of the host adapter, opaque to views. */
  id: string
  name: string
  format: typeof EIDOS_FILE_FORMAT
  mimeType: typeof EIDOS_FILE_MIME_TYPE
  size: number
  /** Adapter-owned compare-and-swap token. Never derive behavior from it. */
  revision: string
  lastModified?: number
  metadata?: EidosFileMetadata
}

export interface EidosFileReadResult {
  descriptor: EidosFileDescriptor
  bytes: ArrayBuffer
}

export interface EidosFileWriteOptions {
  expectedRevision?: string
  force?: boolean
  signal?: AbortSignal
}

export interface EidosFileHandle {
  readonly capabilities: EidosFileHostCapabilities
  descriptor(): Promise<EidosFileDescriptor>
  permission(): Promise<EidosFilePermissionState>
  requestPermission?(): Promise<EidosFilePermissionState>
  read(options?: { signal?: AbortSignal }): Promise<EidosFileReadResult>
  write?(
    bytes: Uint8Array,
    options?: EidosFileWriteOptions
  ): Promise<EidosFileDescriptor>
  close?(): void | Promise<void>
}

export interface EidosFileDocument {
  readonly source: EidosFileDataSource
  exportBytes(options?: { signal?: AbortSignal }): Promise<Uint8Array>
  close(): void | Promise<void>
}

export interface EidosFileRuntimeAdapter {
  open(
    read: EidosFileReadResult,
    options?: { signal?: AbortSignal }
  ): Promise<EidosFileDocument>
}

export interface EidosFileRecoverySnapshot {
  id: string
  descriptor: EidosFileDescriptor
  bytes: Uint8Array
  updatedAt: number
}

export interface EidosFileRecoveryStore {
  load(id: string): Promise<EidosFileRecoverySnapshot | null>
  save(snapshot: EidosFileRecoverySnapshot): Promise<void>
  delete(id: string): Promise<void>
}

export type EidosFileSessionPhase =
  | "idle"
  | "opening"
  | "ready"
  | "dirty"
  | "saving"
  | "conflict"
  | "error"
  | "closed"

export interface EidosFileConflict {
  expectedRevision: string
  actual: EidosFileDescriptor
}

export interface EidosFileSessionState {
  phase: EidosFileSessionPhase
  descriptor: EidosFileDescriptor | null
  permission: EidosFilePermissionState
  capabilities: EidosFileHostCapabilities | null
  source: EidosFileDataSource | null
  snapshot: EidosFileSnapshot | null
  dirty: boolean
  error: Error | null
  conflict: EidosFileConflict | null
  recoveryAvailable: boolean
}

export type EidosFileHostErrorCode =
  | "closed"
  | "permission-denied"
  | "read-failed"
  | "write-failed"
  | "conflict"

export class EidosFileHostError extends Error {
  constructor(
    readonly code: EidosFileHostErrorCode,
    message: string,
    readonly conflict?: EidosFileConflict,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = "EidosFileHostError"
  }
}

const initialState: EidosFileSessionState = {
  phase: "idle",
  descriptor: null,
  permission: "unavailable",
  capabilities: null,
  source: null,
  snapshot: null,
  dirty: false,
  error: null,
  conflict: null,
  recoveryAvailable: false,
}

export class EidosFileSession {
  private state: EidosFileSessionState = initialState
  private handle: EidosFileHandle | null = null
  private document: EidosFileDocument | null = null
  private closePromise: Promise<void> | null = null
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly runtime: EidosFileRuntimeAdapter,
    private readonly recovery?: EidosFileRecoveryStore
  ) {}

  getState = (): EidosFileSessionState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async open(handle: EidosFileHandle, options?: { signal?: AbortSignal }) {
    this.assertOpen()
    const previousState = this.state
    const previousDocument = this.document
    const previousHandle = this.handle
    this.setState({
      ...initialState,
      phase: "opening",
      capabilities: handle.capabilities,
    })
    let document: EidosFileDocument | null = null
    try {
      const read = await handle.read(options)
      document = await this.runtime.open(read, options)
      const snapshot = await document.source.getSnapshot()
      const permission = await handle.permission()
      const recoveryAvailable = Boolean(
        this.recovery && (await this.recovery.load(read.descriptor.id))
      )
      this.document = document
      this.handle = handle
      document = null
      this.setState({
        phase: "ready",
        descriptor: { ...read.descriptor, metadata: snapshot.metadata },
        permission,
        capabilities: handle.capabilities,
        source: this.document.source,
        snapshot,
        dirty: false,
        error: null,
        conflict: null,
        recoveryAvailable,
      })
      await settleResources(
        previousDocument,
        previousHandle === handle ? null : previousHandle
      )
      return snapshot
    } catch (cause) {
      await settleResources(document, previousHandle === handle ? null : handle)
      const error = hostError("read-failed", "Unable to open Eidos File", cause)
      this.setState(
        previousDocument && previousState.source
          ? { ...previousState, phase: "error", error, conflict: null }
          : { ...initialState, phase: "error", error }
      )
      throw error
    }
  }

  async refresh(): Promise<EidosFileSnapshot> {
    const document = this.requireDocument()
    const snapshot = await document.source.getSnapshot()
    this.setState({ ...this.state, snapshot })
    return snapshot
  }

  markDirty(snapshot?: EidosFileSnapshot): void {
    this.requireDocument()
    this.setState({
      ...this.state,
      phase: "dirty",
      dirty: true,
      snapshot: snapshot ?? this.state.snapshot,
      error: null,
      conflict: null,
    })
  }

  async checkpoint(): Promise<EidosFileRecoverySnapshot | null> {
    const document = this.requireDocument()
    if (!this.recovery || !this.state.descriptor || !this.state.dirty)
      return null
    const bytes = await document.exportBytes()
    const recovery: EidosFileRecoverySnapshot = {
      id: this.state.descriptor.id,
      descriptor: this.state.descriptor,
      bytes,
      updatedAt: Date.now(),
    }
    await this.recovery.save(recovery)
    this.setState({ ...this.state, recoveryAvailable: true })
    return recovery
  }

  async save(
    options: EidosFileWriteOptions = {}
  ): Promise<EidosFileDescriptor> {
    const document = this.requireDocument()
    if (!this.handle?.write || !this.state.capabilities?.write) {
      throw new EidosFileHostError(
        "permission-denied",
        "This host cannot write to the open Eidos File. Use Save As instead."
      )
    }
    const permission = await this.requestWritePermission()
    if (permission !== "granted") {
      throw new EidosFileHostError(
        "permission-denied",
        "Write permission was not granted for this Eidos File."
      )
    }
    const expectedRevision = this.state.descriptor?.revision
    this.setState({
      ...this.state,
      phase: "saving",
      error: null,
      conflict: null,
    })
    try {
      const bytes = await document.exportBytes({ signal: options.signal })
      const descriptor = await this.handle.write(bytes, {
        ...options,
        expectedRevision,
      })
      const snapshot = await document.source.getSnapshot()
      await this.recovery?.delete(descriptor.id)
      this.setState({
        ...this.state,
        phase: "ready",
        descriptor: { ...descriptor, metadata: snapshot.metadata },
        permission,
        snapshot,
        dirty: false,
        error: null,
        conflict: null,
        recoveryAvailable: false,
      })
      return descriptor
    } catch (cause) {
      if (cause instanceof EidosFileHostError && cause.code === "conflict") {
        this.setState({
          ...this.state,
          phase: "conflict",
          dirty: true,
          error: cause,
          conflict: cause.conflict ?? null,
        })
        throw cause
      }
      const error = hostError(
        "write-failed",
        "Unable to save Eidos File",
        cause
      )
      this.setState({ ...this.state, phase: "error", dirty: true, error })
      throw error
    }
  }

  async saveAs(handle: EidosFileHandle): Promise<EidosFileDescriptor> {
    const document = this.requireDocument()
    if (!handle.write) {
      throw new EidosFileHostError(
        "permission-denied",
        "The selected destination is not writable."
      )
    }
    const permission = await requestHandleWritePermission(handle)
    if (permission !== "granted") {
      throw new EidosFileHostError(
        "permission-denied",
        "Write permission was not granted for the selected destination."
      )
    }
    const bytes = await document.exportBytes()
    const descriptor = await handle.write(bytes, { force: true })
    const previousHandle = this.handle
    const previousDescriptorId = this.state.descriptor?.id
    this.handle = handle
    const snapshot = await document.source.getSnapshot()
    this.setState({
      ...this.state,
      phase: "ready",
      descriptor: { ...descriptor, metadata: snapshot.metadata },
      permission,
      capabilities: handle.capabilities,
      snapshot,
      dirty: false,
      error: null,
      conflict: null,
      recoveryAvailable: false,
    })
    await Promise.allSettled([
      ...(previousHandle && previousHandle !== handle
        ? [Promise.resolve().then(() => previousHandle.close?.())]
        : []),
      ...(this.recovery
        ? [this.recovery.delete(previousDescriptorId ?? descriptor.id)]
        : []),
    ])
    return descriptor
  }

  async reload(options?: { signal?: AbortSignal }): Promise<EidosFileSnapshot> {
    const previousDocument = this.requireDocument()
    if (!this.handle) throw new EidosFileHostError("closed", "No file is open")
    const handle = this.handle
    let replacement: EidosFileDocument | null = null
    try {
      const read = await handle.read(options)
      replacement = await this.runtime.open(read, options)
      const snapshot = await replacement.source.getSnapshot()
      this.document = replacement
      replacement = null
      this.setState({
        ...this.state,
        phase: "ready",
        descriptor: { ...read.descriptor, metadata: snapshot.metadata },
        source: this.document.source,
        snapshot,
        dirty: false,
        error: null,
        conflict: null,
        recoveryAvailable: false,
      })
      await Promise.allSettled([
        Promise.resolve().then(() => previousDocument.close()),
        ...(this.recovery ? [this.recovery.delete(read.descriptor.id)] : []),
      ])
      return snapshot
    } catch (cause) {
      await settleResources(replacement)
      const error = hostError(
        "read-failed",
        "Unable to reload Eidos File",
        cause
      )
      this.setState({ ...this.state, phase: "error", error, conflict: null })
      throw error
    }
  }

  async restore(
    recovery: EidosFileRecoverySnapshot
  ): Promise<EidosFileSnapshot> {
    this.assertOpen()
    const previousDocument = this.document
    let document: EidosFileDocument | null = null
    try {
      document = await this.runtime.open({
        descriptor: recovery.descriptor,
        bytes: copyArrayBuffer(recovery.bytes),
      })
      const snapshot = await document.source.getSnapshot()
      this.document = document
      document = null
      this.setState({
        ...this.state,
        phase: "dirty",
        descriptor: { ...recovery.descriptor, metadata: snapshot.metadata },
        source: this.document.source,
        snapshot,
        dirty: true,
        error: null,
        conflict: null,
        recoveryAvailable: true,
      })
      await settleResources(previousDocument)
      return snapshot
    } catch (cause) {
      await settleResources(document)
      const error = hostError(
        "read-failed",
        "Unable to restore Eidos File recovery data",
        cause
      )
      this.setState({ ...this.state, phase: "error", error, conflict: null })
      throw error
    }
  }

  async close(): Promise<void> {
    if (this.state.phase === "closed") return
    if (this.closePromise) return this.closePromise
    this.closePromise = this.closeResources()
    return this.closePromise
  }

  private async closeResources(): Promise<void> {
    const document = this.document
    const handle = this.handle
    this.document = null
    this.handle = null
    const results = await settleResources(document, handle)
    this.setState({ ...initialState, phase: "closed" })
    this.listeners.clear()
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    if (failure) throw failure.reason
  }

  private async requestWritePermission(): Promise<EidosFilePermissionState> {
    if (!this.handle) return "unavailable"
    const requested = await requestHandleWritePermission(this.handle)
    this.setState({ ...this.state, permission: requested })
    return requested
  }

  private assertOpen(): void {
    if (this.state.phase === "closed") {
      throw new EidosFileHostError("closed", "The Eidos File session is closed")
    }
  }

  private requireDocument(): EidosFileDocument {
    this.assertOpen()
    if (!this.document || !this.state.source) {
      throw new EidosFileHostError("closed", "No Eidos File is open")
    }
    return this.document
  }

  private setState(state: EidosFileSessionState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}

export interface EidosFileTypeHandler {
  id: string
  label: string
  extensions: readonly string[]
  mimeTypes: readonly string[]
  accepts(descriptor: EidosFileCandidateDescriptor): boolean
}

export interface EidosFileCandidateDescriptor {
  name: string
  mimeType: string
}

export const eidosFileTypeHandler: EidosFileTypeHandler = {
  id: EIDOS_FILE_FORMAT,
  label: "Eidos File",
  extensions: [EIDOS_FILE_EXTENSION],
  mimeTypes: [EIDOS_FILE_MIME_TYPE],
  accepts: ({ name, mimeType }) =>
    mimeType === EIDOS_FILE_MIME_TYPE ||
    name.toLowerCase().endsWith(EIDOS_FILE_EXTENSION),
}

export class EidosFileHandlerRegistry {
  private readonly handlers = new Map<string, EidosFileTypeHandler>()

  constructor(
    handlers: readonly EidosFileTypeHandler[] = [eidosFileTypeHandler]
  ) {
    for (const handler of handlers) this.register(handler)
  }

  register(handler: EidosFileTypeHandler): () => void {
    if (this.handlers.has(handler.id)) {
      throw new Error(`Duplicate Eidos File handler: ${handler.id}`)
    }
    this.handlers.set(handler.id, handler)
    return () => this.handlers.delete(handler.id)
  }

  match(descriptor: EidosFileCandidateDescriptor): EidosFileTypeHandler | null {
    return (
      [...this.handlers.values()].find((handler) =>
        handler.accepts(descriptor)
      ) ?? null
    )
  }

  list(): readonly EidosFileTypeHandler[] {
    return [...this.handlers.values()]
  }
}

function hostError(
  code: Exclude<
    EidosFileHostErrorCode,
    "conflict" | "closed" | "permission-denied"
  >,
  message: string,
  cause: unknown
): EidosFileHostError {
  return cause instanceof EidosFileHostError
    ? cause
    : new EidosFileHostError(code, message, undefined, cause)
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function requestHandleWritePermission(
  handle: EidosFileHandle
): Promise<EidosFilePermissionState> {
  const current = await handle.permission()
  if (current === "granted" || !handle.requestPermission) return current
  return handle.requestPermission()
}

function settleResources(
  document?: EidosFileDocument | null,
  handle?: EidosFileHandle | null
): Promise<PromiseSettledResult<void>[]> {
  return Promise.allSettled([
    ...(document ? [Promise.resolve().then(async () => document.close())] : []),
    ...(handle?.close
      ? [Promise.resolve().then(async () => handle.close?.())]
      : []),
  ])
}
