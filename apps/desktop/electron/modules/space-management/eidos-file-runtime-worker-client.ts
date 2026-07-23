import path from "node:path"
import { Worker } from "node:worker_threads"
import {
  AdapterTransportRuntimeClient,
  type AdapterCommitReceipt,
  type AdapterStructuredCloneCarrier,
  type AdapterTransportChannel,
  type FileEntry,
  type RuntimeClient,
  type RuntimeSnapshot,
} from "@eidos.space/eidos-file"

import type {
  EidosFileRuntimeWorkerData,
  EidosFileRuntimeWorkerError,
  EidosFileRuntimeWorkerFileEntryInput,
  EidosFileRuntimeWorkerResponse,
} from "./eidos-file-runtime-worker-protocol"

interface PendingControl {
  resolve: (value: Uint8Array | FileEntry | void) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface EidosFileRuntimeWorkerClientOptions {
  retainReceipt(receipt: AdapterCommitReceipt): void
  settleReceipt(receipt: AdapterCommitReceipt): void
}

export class EidosFileRuntimeWorkerClient {
  private readonly worker: Worker
  private readonly transportListeners = new Set<
    (carrier: AdapterStructuredCloneCarrier) => void
  >()
  private readonly closeListeners = new Set<(reason?: unknown) => void>()
  private readonly pendingControls = new Map<string, PendingControl>()
  private readonly ready: Promise<RuntimeSnapshot>
  private readyResolve!: (snapshot: RuntimeSnapshot) => void
  private readyReject!: (error: Error) => void
  private runtimeValue: AdapterTransportRuntimeClient | null = null
  private sequence = 0
  private terminated = false

  constructor(
    private readonly data: EidosFileRuntimeWorkerData,
    private readonly options: EidosFileRuntimeWorkerClientOptions
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    this.worker = new Worker(
      path.join(__dirname, "eidos-file-runtime-worker.js"),
      { workerData: data }
    )
    this.worker.on("message", (message: EidosFileRuntimeWorkerResponse) =>
      this.receive(message)
    )
    this.worker.once("error", (error) => this.fail(error))
    this.worker.once("exit", (code) => {
      if (!this.terminated && code !== 0) {
        this.fail(
          new Error(`Eidos File Runtime Worker exited with code ${code}`)
        )
      }
    })
  }

  async open(): Promise<{
    runtime: RuntimeClient
    snapshot: RuntimeSnapshot
  }> {
    const snapshot = await this.ready
    const channel: AdapterTransportChannel = {
      post: (carrier, transfers = []) => {
        this.worker.postMessage(
          { transport: carrier },
          transfers.filter(
            (item): item is ArrayBuffer => item instanceof ArrayBuffer
          )
        )
      },
      subscribe: (listener, onClose) => {
        this.transportListeners.add(listener)
        if (onClose) this.closeListeners.add(onClose)
        return () => {
          this.transportListeners.delete(listener)
          if (onClose) this.closeListeners.delete(onClose)
        }
      },
      close: () => undefined,
    }
    const runtime = await new AdapterTransportRuntimeClient(channel, {
      workingID: this.data.workingId,
      retainPreparedReceipt: this.options.retainReceipt,
      settlePreparedReceipt: this.options.settleReceipt,
    }).connect()
    this.runtimeValue = runtime
    return { runtime, snapshot }
  }

  export(maxBytes: string): Promise<Uint8Array> {
    return this.control({
      operation: "export",
      maxBytes,
    }) as Promise<Uint8Array>
  }

  allocateFileEntry(
    entry: EidosFileRuntimeWorkerFileEntryInput
  ): Promise<FileEntry> {
    return this.control({
      operation: "allocate-file-entry",
      entry,
    }) as Promise<FileEntry>
  }

  findFileEntry(entryId: string): Promise<FileEntry> {
    return this.control({
      operation: "find-file-entry",
      entryId,
    }) as Promise<FileEntry>
  }

  async close(): Promise<void> {
    if (this.terminated) return
    try {
      if (this.runtimeValue) {
        await this.runtimeValue.close({
          requestId: `desktop-close-${crypto.randomUUID()}`,
          deadlineMilliseconds: 30_000,
        })
      } else {
        await this.control({ operation: "close" })
      }
    } finally {
      await this.terminate()
    }
  }

  async terminate(reason?: unknown): Promise<void> {
    if (this.terminated) return
    this.terminated = true
    const error =
      reason instanceof Error
        ? reason
        : new Error("Eidos File Runtime Worker was closed")
    for (const pending of this.pendingControls.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pendingControls.clear()
    for (const listener of this.closeListeners) listener(error)
    this.transportListeners.clear()
    this.closeListeners.clear()
    await this.worker.terminate().catch(() => undefined)
  }

  private control(
    request:
      | { operation: "export"; maxBytes: string }
      | {
          operation: "allocate-file-entry"
          entry: EidosFileRuntimeWorkerFileEntryInput
        }
      | { operation: "find-file-entry"; entryId: string }
      | { operation: "close" }
  ): Promise<Uint8Array | FileEntry | void> {
    if (this.terminated) {
      return Promise.reject(new Error("Eidos File Runtime Worker is closed"))
    }
    const id = `desktop-control-${++this.sequence}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingControls.delete(id)
        reject(new Error(`Eidos File Runtime ${request.operation} timed out`))
        void this.terminate()
      }, 30_000)
      this.pendingControls.set(id, { resolve, reject, timer })
      this.worker.postMessage({ control: { id, ...request } })
    })
  }

  private receive(message: EidosFileRuntimeWorkerResponse): void {
    if (message.type === "ready") {
      this.readyResolve(message.snapshot)
      return
    }
    if (message.type === "transport") {
      for (const listener of this.transportListeners) {
        listener(message.carrier)
      }
      return
    }
    if (message.type === "fatal") {
      this.fail(workerError(message.error))
      return
    }
    const pending = this.pendingControls.get(message.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pendingControls.delete(message.id)
    if (!message.ok) {
      pending.reject(workerError(message.error))
      return
    }
    pending.resolve(
      message.result.operation === "export"
        ? message.result.bytes
        : message.result.operation === "allocate-file-entry" ||
            message.result.operation === "find-file-entry"
          ? message.result.entry
          : undefined
    )
  }

  private fail(error: Error): void {
    this.readyReject(error)
    void this.terminate(error)
  }
}

function workerError(value: EidosFileRuntimeWorkerError): Error {
  return Object.assign(new Error(value.message), {
    name: value.name,
    ...(value.stack ? { stack: value.stack } : {}),
    ...(value.code ? { code: value.code } : {}),
    ...(value.retryable === undefined ? {} : { retryable: value.retryable }),
    ...(value.fatal === undefined ? {} : { fatal: value.fatal }),
  })
}
