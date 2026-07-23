import type {
  AdapterCommitReceipt,
  AdapterStructuredCloneCarrier,
  AdapterTransportChannel,
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import { AdapterTransportRuntimeClient } from "@eidos.space/eidos-file"
import {
  EidosRuntimeEditorDataSource,
  type EidosFileEditorDataSource,
} from "@eidos.space/eidos-file-ui"

import type {
  EidosFileWorkerAction,
  EidosFileWorkerExportResult,
  EidosFileWorkerOpenResult,
  EidosFileWorkerRequest,
  EidosFileWorkerResponse,
  EidosFileWorkerResult,
  EidosFileWorkerTransportMessage,
} from "./protocol"

interface PendingCall {
  resolve: (value: EidosFileWorkerResult) => void
  reject: (reason: Error) => void
}

/**
 * Host-side Worker controller. Logical File operations are intentionally not
 * exposed here; UI receives only the RuntimeClient created by runtimeClient().
 */
export class EidosFileWorkerClient {
  private readonly worker = new Worker(
    new URL("./eidos-file.worker.ts", import.meta.url),
    { type: "module", name: "eidos-file-runtime" }
  )
  private readonly pending = new Map<number, PendingCall>()
  private readonly transportListeners = new Set<
    (carrier: AdapterStructuredCloneCarrier) => void
  >()
  private readonly transportCloseListeners = new Set<
    (reason?: unknown) => void
  >()
  private nextId = 1
  private terminated = false
  private editor: EidosRuntimeEditorDataSource | null = null

  constructor() {
    this.worker.addEventListener(
      "message",
      (
        event: MessageEvent<
          EidosFileWorkerResponse | EidosFileWorkerTransportMessage
        >
      ) => {
        if ("transport" in event.data) {
          for (const listener of this.transportListeners) {
            listener(event.data.transport)
          }
          return
        }
        const pending = this.pending.get(event.data.id)
        if (!pending) return
        this.pending.delete(event.data.id)
        if (event.data.ok) {
          pending.resolve(event.data.result)
        } else {
          const error = new Error(event.data.error.message)
          error.name = event.data.error.name
          if (event.data.error.stack) error.stack = event.data.error.stack
          Object.assign(error, {
            ...(event.data.error.code === undefined
              ? {}
              : { code: event.data.error.code }),
            ...(event.data.error.retryable === undefined
              ? {}
              : { retryable: event.data.error.retryable }),
            ...(event.data.error.fatal === undefined
              ? {}
              : { fatal: event.data.error.fatal }),
          })
          pending.reject(error)
        }
      }
    )
    this.worker.addEventListener("error", (event) => {
      const error = new Error(
        event.message || "The Eidos File runtime worker failed"
      )
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
      for (const listener of this.transportCloseListeners) listener(error)
    })
  }

  runtimeClient(
    workingID: string,
    receipts: {
      retain(receipt: AdapterCommitReceipt): void
      settle(receipt: AdapterCommitReceipt): void
    }
  ): Promise<AdapterTransportRuntimeClient> {
    const channel: AdapterTransportChannel = {
      post: (carrier, transfers = []) => {
        const message: EidosFileWorkerTransportMessage = { transport: carrier }
        this.worker.postMessage(message, transfers)
      },
      subscribe: (listener, onClose) => {
        this.transportListeners.add(listener)
        if (onClose) this.transportCloseListeners.add(onClose)
        return () => {
          this.transportListeners.delete(listener)
          if (onClose) this.transportCloseListeners.delete(onClose)
        }
      },
      close: () => undefined,
    }
    return new AdapterTransportRuntimeClient(channel, {
      workingID,
      retainPreparedReceipt: receipts.retain,
      settlePreparedReceipt: receipts.settle,
    }).connect()
  }

  openSource(
    fileName: string,
    recoveryId: string,
    bytes: ArrayBuffer,
    access: "read" | "readwrite" = "readwrite"
  ): Promise<EidosFileWorkerOpenResult> {
    return this.call(
      { type: "open-source", fileName, recoveryId, bytes, access },
      [bytes]
    )
  }

  createSource(
    fileName: string,
    recoveryId: string,
    title: string
  ): Promise<EidosFileWorkerOpenResult> {
    return this.call({
      type: "create-source",
      fileName,
      recoveryId,
      title,
    })
  }

  async createEditorSource(
    fileName: string,
    recoveryId: string,
    title: string
  ): Promise<
    Omit<EidosFileWorkerOpenResult, "snapshot"> & {
      snapshot: EidosFileSnapshot
    }
  > {
    const opened = await this.createSource(fileName, recoveryId, title)
    return {
      ...opened,
      snapshot: await this.connectEditor(recoveryId, fileName),
    }
  }

  async openEditorSource(
    fileName: string,
    recoveryId: string,
    bytes: ArrayBuffer,
    access: "read" | "readwrite" = "readwrite"
  ): Promise<
    Omit<EidosFileWorkerOpenResult, "snapshot"> & {
      snapshot: EidosFileSnapshot
    }
  > {
    const opened = await this.openSource(fileName, recoveryId, bytes, access)
    return {
      ...opened,
      snapshot: await this.connectEditor(recoveryId, fileName),
    }
  }

  openRecovery(
    fileName: string,
    recoveryId: string,
    access: "read" | "readwrite" = "readwrite"
  ): Promise<EidosFileWorkerOpenResult> {
    return this.call({ type: "open-recovery", fileName, recoveryId, access })
  }

  async openEditorRecovery(
    fileName: string,
    recoveryId: string,
    access: "read" | "readwrite" = "readwrite"
  ): Promise<
    Omit<EidosFileWorkerOpenResult, "snapshot"> & {
      snapshot: EidosFileSnapshot
    }
  > {
    const opened = await this.openRecovery(fileName, recoveryId, access)
    return {
      ...opened,
      snapshot: await this.connectEditor(recoveryId, fileName),
    }
  }

  getSnapshot(...args: Parameters<EidosFileEditorDataSource["getSnapshot"]>) {
    return this.requireEditor().getSnapshot(...args)
  }

  getPage(...args: Parameters<EidosFileEditorDataSource["getPage"]>) {
    return this.requireEditor().getPage(...args)
  }

  getRow(
    ...args: Parameters<NonNullable<EidosFileEditorDataSource["getRow"]>>
  ) {
    return this.requireEditor().getRow(...args)
  }

  getGroupCounts(
    ...args: Parameters<
      NonNullable<EidosFileEditorDataSource["getGroupCounts"]>
    >
  ) {
    return this.requireEditor().getGroupCounts(...args)
  }

  calculateColumnStats(
    ...args: Parameters<EidosFileEditorDataSource["calculateColumnStats"]>
  ) {
    return this.requireEditor().calculateColumnStats(...args)
  }

  previewFormula(
    ...args: Parameters<
      NonNullable<EidosFileEditorDataSource["previewFormula"]>
    >
  ) {
    return this.requireEditor().previewFormula(...args)
  }

  insertRow(...args: Parameters<EidosFileEditorDataSource["insertRow"]>) {
    return this.requireEditor().insertRow(...args)
  }

  updateRow(...args: Parameters<EidosFileEditorDataSource["updateRow"]>) {
    return this.requireEditor().updateRow(...args)
  }

  deleteRowRanges(
    ...args: Parameters<EidosFileEditorDataSource["deleteRowRanges"]>
  ) {
    return this.requireEditor().deleteRowRanges(...args)
  }

  deleteRows(...args: Parameters<EidosFileEditorDataSource["deleteRows"]>) {
    return this.requireEditor().deleteRows(...args)
  }

  updateField(...args: Parameters<EidosFileEditorDataSource["updateField"]>) {
    return this.requireEditor().updateField(...args)
  }

  addField(...args: Parameters<EidosFileEditorDataSource["addField"]>) {
    return this.requireEditor().addField(...args)
  }

  deleteField(...args: Parameters<EidosFileEditorDataSource["deleteField"]>) {
    return this.requireEditor().deleteField(...args)
  }

  createTable(...args: Parameters<EidosFileEditorDataSource["createTable"]>) {
    return this.requireEditor().createTable(...args)
  }

  updateTable(...args: Parameters<EidosFileEditorDataSource["updateTable"]>) {
    return this.requireEditor().updateTable(...args)
  }

  deleteTable(...args: Parameters<EidosFileEditorDataSource["deleteTable"]>) {
    return this.requireEditor().deleteTable(...args)
  }

  reorderTables(
    ...args: Parameters<NonNullable<EidosFileEditorDataSource["reorderTables"]>>
  ) {
    return this.requireEditor().reorderTables(...args)
  }

  createView(...args: Parameters<EidosFileEditorDataSource["createView"]>) {
    return this.requireEditor().createView(...args)
  }

  duplicateView(
    ...args: Parameters<EidosFileEditorDataSource["duplicateView"]>
  ) {
    return this.requireEditor().duplicateView(...args)
  }

  deleteView(...args: Parameters<EidosFileEditorDataSource["deleteView"]>) {
    return this.requireEditor().deleteView(...args)
  }

  reorderViews(...args: Parameters<EidosFileEditorDataSource["reorderViews"]>) {
    return this.requireEditor().reorderViews(...args)
  }

  updateView(...args: Parameters<EidosFileEditorDataSource["updateView"]>) {
    return this.requireEditor().updateView(...args)
  }

  previewCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<EidosFileCsvImportPlan> {
    return this.requireEditor().previewCsv(fileName, bytes, options)
  }

  importCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<{
    snapshot: EidosFileSnapshot
    result: EidosFileCsvImportResult
  }> {
    return this.requireEditor().importCsv(fileName, bytes, options)
  }

  discardRecovery(recoveryId: string): Promise<{ discarded: true }> {
    return this.call({ type: "discard-recovery", recoveryId })
  }

  exportFile(maxBytes = "268435456"): Promise<EidosFileWorkerExportResult> {
    return this.call({ type: "export", maxBytes })
  }

  async close(): Promise<void> {
    if (this.terminated) return
    try {
      await this.call({ type: "close" })
    } finally {
      this.terminate()
    }
  }

  terminate(): void {
    if (this.terminated) return
    this.terminated = true
    this.worker.terminate()
    const error = new Error("The Eidos File runtime worker was closed")
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    for (const listener of this.transportCloseListeners) listener(error)
    this.transportListeners.clear()
    this.transportCloseListeners.clear()
    this.editor = null
  }

  private async connectEditor(
    workingID: string,
    path: string
  ): Promise<EidosFileSnapshot> {
    const runtime = await this.runtimeClient(workingID, {
      retain: () => undefined,
      settle: () => undefined,
    })
    const editor = new EidosRuntimeEditorDataSource(runtime, path)
    this.editor = editor
    return editor.initialize()
  }

  private requireEditor(): EidosRuntimeEditorDataSource {
    if (!this.editor) {
      throw new Error("The Eidos File editor Runtime is not connected")
    }
    return this.editor
  }

  private call<T extends EidosFileWorkerResult>(
    action: EidosFileWorkerAction,
    transfers: Transferable[] = []
  ): Promise<T> {
    if (this.terminated) {
      return Promise.reject(
        new Error("The Eidos File runtime worker is closed")
      )
    }
    const id = this.nextId++
    const request: EidosFileWorkerRequest = { id, action }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      })
      this.worker.postMessage(request, transfers)
    })
  }
}
