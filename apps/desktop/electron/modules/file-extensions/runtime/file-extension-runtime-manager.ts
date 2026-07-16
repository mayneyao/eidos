import { randomUUID } from "node:crypto"
import {
  createExtensionWorkerSource,
  parseExtensionWorkerMessage,
  type ExtensionHostToWorkerMessage,
  type ExtensionRuntimeError,
  type ExtensionRuntimeLog,
  type ExtensionRuntimeResource,
  type ExtensionRuntimeRpcRequest,
} from "@eidos.space/extension-runtime"
import type { ExtensionSnapshotIdentity } from "@eidos.space/extension-state"

import { Inject, Injectable } from "../../../common/di"
import {
  ElectronFileExtensionRuntimeTransportFactory,
  type FileExtensionRuntimeTransport,
  type FileExtensionRuntimeTransportFactory,
} from "./electron-runtime-transport"

const ACTIVATION_TIMEOUT_MS = 5_000
const INVOCATION_TIMEOUT_MS = 60_000

export interface FileExtensionRuntimeDescriptor {
  spaceId: string
  snapshot: ExtensionSnapshotIdentity
  bundleCode: string
  commandIds: readonly string[]
  panelIds: readonly string[]
}

export interface FileExtensionRuntimeExecution {
  descriptor: FileExtensionRuntimeDescriptor
  commandId: string
  resource: ExtensionRuntimeResource
  handleRpc(request: ExtensionRuntimeRpcRequest): Promise<unknown>
  handleLog?(log: ExtensionRuntimeLog): void
}

interface PendingRequest {
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface RuntimeHandle {
  key: string
  descriptor: FileExtensionRuntimeDescriptor
  generation: string
  transport: FileExtensionRuntimeTransport
  activation: Promise<void>
  resolveActivation: () => void
  rejectActivation: (error: Error) => void
  activationTimer: ReturnType<typeof setTimeout>
  pending: Map<string, PendingRequest>
  handleRpc(request: ExtensionRuntimeRpcRequest): Promise<unknown>
  handleLog?: (log: ExtensionRuntimeLog) => void
  ready: boolean
  disposed: boolean
}

export class FileExtensionRuntimeError extends Error {
  constructor(
    readonly code: ExtensionRuntimeError["code"],
    message: string
  ) {
    super(message)
    this.name = "FileExtensionRuntimeError"
  }
}

function snapshotKey(
  spaceId: string,
  snapshot: ExtensionSnapshotIdentity
): string {
  return [
    spaceId,
    snapshot.packageId,
    snapshot.contentDigest,
    snapshot.permissionHash,
  ].join("\0")
}

function runtimeError(error: ExtensionRuntimeError): FileExtensionRuntimeError {
  return new FileExtensionRuntimeError(error.code, error.message)
}

@Injectable()
export class FileExtensionRuntimeManager {
  private readonly handles = new Map<string, RuntimeHandle>()

  constructor(
    @Inject(ElectronFileExtensionRuntimeTransportFactory)
    private readonly transportFactory: FileExtensionRuntimeTransportFactory
  ) {}

  has(spaceId: string, snapshot: ExtensionSnapshotIdentity): boolean {
    const handle = this.handles.get(snapshotKey(spaceId, snapshot))
    return Boolean(handle && !handle.disposed)
  }

  async execute(execution: FileExtensionRuntimeExecution): Promise<void> {
    const handle = await this.getOrCreate(execution)
    await handle.activation
    if (handle.disposed) {
      throw new FileExtensionRuntimeError(
        "RUNTIME_DISPOSED",
        "Extension runtime was disposed before command invocation"
      )
    }
    const requestId = `invoke-${randomUUID()}`
    const result = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        handle.pending.delete(requestId)
        const error = new FileExtensionRuntimeError(
          "RUNTIME_TIMEOUT",
          `Extension command timed out after ${INVOCATION_TIMEOUT_MS}ms`
        )
        reject(error)
        this.disposeHandle(handle, error)
      }, INVOCATION_TIMEOUT_MS)
      handle.pending.set(requestId, { resolve, reject, timer })
    })
    try {
      handle.transport.postMessage({
        type: "invoke",
        requestId,
        commandId: execution.commandId,
        resource: execution.resource,
      } satisfies ExtensionHostToWorkerMessage)
    } catch (error) {
      const pending = handle.pending.get(requestId)
      if (pending) {
        clearTimeout(pending.timer)
        handle.pending.delete(requestId)
      }
      const runtimeFailure = new FileExtensionRuntimeError(
        "RUNTIME_DISPOSED",
        error instanceof Error ? error.message : String(error)
      )
      this.disposeHandle(handle, runtimeFailure)
      throw runtimeFailure
    }
    return result
  }

  disposePackage(spaceId: string, packageId: string, reason: string): void {
    for (const handle of this.handles.values()) {
      if (
        handle.descriptor.spaceId === spaceId &&
        handle.descriptor.snapshot.packageId === packageId
      ) {
        this.disposeHandle(
          handle,
          new FileExtensionRuntimeError("RUNTIME_STALE", reason)
        )
      }
    }
  }

  disposeSpace(spaceId: string, reason: string): void {
    for (const handle of this.handles.values()) {
      if (handle.descriptor.spaceId === spaceId) {
        this.disposeHandle(
          handle,
          new FileExtensionRuntimeError("RUNTIME_STALE", reason)
        )
      }
    }
  }

  disposeAll(reason = "Eidos is shutting down"): void {
    for (const handle of [...this.handles.values()]) {
      this.disposeHandle(
        handle,
        new FileExtensionRuntimeError("RUNTIME_DISPOSED", reason)
      )
    }
  }

  private async getOrCreate(
    execution: FileExtensionRuntimeExecution
  ): Promise<RuntimeHandle> {
    const { descriptor } = execution
    const key = snapshotKey(descriptor.spaceId, descriptor.snapshot)
    const existing = this.handles.get(key)
    if (existing && !existing.disposed) {
      existing.handleRpc = execution.handleRpc
      existing.handleLog = execution.handleLog
      return existing
    }
    this.disposePackage(
      descriptor.spaceId,
      descriptor.snapshot.packageId,
      "A newer extension runtime generation is activating"
    )
    const generation = `${descriptor.snapshot.contentDigest}:${randomUUID()}`
    const source = createExtensionWorkerSource({
      bundleCode: descriptor.bundleCode,
      extensionId: descriptor.snapshot.packageId,
      generation,
      commandIds: descriptor.commandIds,
      panelIds: descriptor.panelIds,
    })
    const transport = await this.transportFactory.create({
      source,
      generation,
    })
    let resolveActivation!: () => void
    let rejectActivation!: (error: Error) => void
    const activation = new Promise<void>((resolve, reject) => {
      resolveActivation = resolve
      rejectActivation = reject
    })
    const handle: RuntimeHandle = {
      key,
      descriptor,
      generation,
      transport,
      activation,
      resolveActivation,
      rejectActivation,
      activationTimer: setTimeout(() => {
        const error = new FileExtensionRuntimeError(
          "RUNTIME_TIMEOUT",
          `Extension activation timed out after ${ACTIVATION_TIMEOUT_MS}ms`
        )
        rejectActivation(error)
        this.disposeHandle(handle, error)
      }, ACTIVATION_TIMEOUT_MS),
      pending: new Map(),
      handleRpc: execution.handleRpc,
      handleLog: execution.handleLog,
      ready: false,
      disposed: false,
    }
    this.handles.set(key, handle)
    transport.onMessage((message) => void this.onMessage(handle, message))
    transport.onClose(() => {
      this.disposeHandle(
        handle,
        new FileExtensionRuntimeError(
          "RUNTIME_DISPOSED",
          "Extension runtime process closed"
        )
      )
    })
    return handle
  }

  private async onMessage(handle: RuntimeHandle, raw: unknown): Promise<void> {
    if (handle.disposed) return
    let message
    try {
      message = parseExtensionWorkerMessage(raw)
    } catch (error) {
      this.disposeHandle(
        handle,
        new FileExtensionRuntimeError(
          "RUNTIME_PROTOCOL_ERROR",
          error instanceof Error ? error.message : String(error)
        )
      )
      return
    }
    if (
      (message.type === "ready" ||
        message.type === "activation-error" ||
        message.type === "log") &&
      message.generation !== handle.generation
    ) {
      this.disposeHandle(
        handle,
        new FileExtensionRuntimeError(
          "RUNTIME_STALE",
          "Extension worker replied from a stale generation"
        )
      )
      return
    }
    if (message.type === "log") {
      handle.handleLog?.(message)
      return
    }
    if (message.type === "ready") {
      const declared = new Set(handle.descriptor.commandIds)
      if (message.commands.some((command) => !declared.has(command))) {
        this.disposeHandle(
          handle,
          new FileExtensionRuntimeError(
            "RUNTIME_PROTOCOL_ERROR",
            "Extension worker registered an undeclared command"
          )
        )
        return
      }
      handle.ready = true
      clearTimeout(handle.activationTimer)
      handle.resolveActivation()
      return
    }
    if (message.type === "activation-error") {
      const error = runtimeError(message.error)
      handle.rejectActivation(error)
      this.disposeHandle(handle, error)
      return
    }
    if (message.type === "invoke-result") {
      const pending = handle.pending.get(message.requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      handle.pending.delete(message.requestId)
      if (message.ok) pending.resolve()
      else pending.reject(runtimeError(message.error))
      return
    }
    if (message.type === "rpc") {
      try {
        const value = await handle.handleRpc(message)
        if (handle.disposed) return
        handle.transport.postMessage({
          type: "rpc-result",
          requestId: message.requestId,
          ok: true,
          value,
        } satisfies ExtensionHostToWorkerMessage)
      } catch (error) {
        if (handle.disposed) return
        const runtimeFailure =
          error instanceof FileExtensionRuntimeError
            ? error
            : new FileExtensionRuntimeError(
                "CAPABILITY_DENIED",
                error instanceof Error ? error.message : String(error)
              )
        handle.transport.postMessage({
          type: "rpc-result",
          requestId: message.requestId,
          ok: false,
          error: {
            code: runtimeFailure.code,
            message: runtimeFailure.message,
          },
        } satisfies ExtensionHostToWorkerMessage)
      }
    }
  }

  private disposeHandle(handle: RuntimeHandle, error: Error): void {
    if (handle.disposed) return
    handle.disposed = true
    clearTimeout(handle.activationTimer)
    if (!handle.ready) handle.rejectActivation(error)
    this.handles.delete(handle.key)
    for (const pending of handle.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    handle.pending.clear()
    try {
      handle.transport.postMessage({
        type: "dispose",
        reason: error.message,
      } satisfies ExtensionHostToWorkerMessage)
    } catch {
      // The transport may already be closed.
    }
    handle.transport.dispose()
  }
}
