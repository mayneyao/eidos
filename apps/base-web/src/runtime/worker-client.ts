import type {
  BaseFieldPlacement,
  BaseRow,
  BaseRowGroupCount,
  BaseRowMutationResult,
  BaseRowPage,
  BaseRowPageProjection,
  BaseRowQuery,
  BaseSnapshot,
  CreateBaseFieldInput,
  UpdateBaseFieldInput,
  UpdateBaseViewInput,
} from "@eidos.space/base"
import type { BaseEditorDataSource } from "@eidos.space/base-ui"

import type {
  BaseWorkerAction,
  BaseWorkerExportResult,
  BaseWorkerOpenResult,
  BaseWorkerRequest,
  BaseWorkerResponse,
  BaseWorkerResult,
} from "./protocol"

interface PendingCall {
  resolve: (value: BaseWorkerResult) => void
  reject: (reason: Error) => void
}

export type { BaseEditorDataSource } from "@eidos.space/base-ui"

export class BaseWorkerClient implements BaseEditorDataSource {
  private readonly worker = new Worker(
    new URL("./base.worker.ts", import.meta.url),
    { type: "module", name: "eidos-base-runtime" }
  )
  private readonly pending = new Map<number, PendingCall>()
  private nextId = 1
  private terminated = false

  constructor() {
    this.worker.addEventListener(
      "message",
      (event: MessageEvent<BaseWorkerResponse>) => {
        const pending = this.pending.get(event.data.id)
        if (!pending) return
        this.pending.delete(event.data.id)
        if (event.data.ok) {
          pending.resolve(event.data.result)
        } else {
          const error = new Error(event.data.error.message)
          error.name = event.data.error.name
          if (event.data.error.stack) error.stack = event.data.error.stack
          pending.reject(error)
        }
      }
    )
    this.worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "The Base runtime worker failed")
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
    })
  }

  private call<T extends BaseWorkerResult>(
    action: BaseWorkerAction,
    transfers: Transferable[] = []
  ): Promise<T> {
    if (this.terminated) {
      return Promise.reject(new Error("The Base runtime worker is closed"))
    }
    const id = this.nextId++
    const request: BaseWorkerRequest = { id, action }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      })
      this.worker.postMessage(request, transfers)
    })
  }

  openSource(
    fileName: string,
    recoveryId: string,
    bytes: ArrayBuffer
  ): Promise<BaseWorkerOpenResult> {
    return this.call({ type: "open-source", fileName, recoveryId, bytes }, [
      bytes,
    ])
  }

  openRecovery(
    fileName: string,
    recoveryId: string
  ): Promise<BaseWorkerOpenResult> {
    return this.call({ type: "open-recovery", fileName, recoveryId })
  }

  discardRecovery(recoveryId: string): Promise<{ discarded: true }> {
    return this.call({ type: "discard-recovery", recoveryId })
  }

  getSnapshot(): Promise<BaseSnapshot> {
    return this.call({ type: "snapshot" })
  }

  getPage(
    tableId: string,
    offset: number,
    limit: number,
    query: BaseRowQuery,
    totalHint?: number,
    cursor?: string,
    projection?: BaseRowPageProjection
  ): Promise<BaseRowPage> {
    return this.call({
      type: "page",
      tableId,
      offset,
      limit,
      query,
      ...(totalHint === undefined ? {} : { totalHint }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(projection === undefined ? {} : { projection }),
    })
  }

  getRow(tableId: string, rowId: string): Promise<BaseRow | null> {
    return this.call({ type: "row", tableId, rowId })
  }

  getGroupCounts(
    tableId: string,
    columnName: string,
    query: BaseRowQuery
  ): Promise<BaseRowGroupCount[]> {
    return this.call({ type: "group-counts", tableId, columnName, query })
  }

  insertRow(tableId: string, row: BaseRow): Promise<BaseRowMutationResult> {
    return this.call({ type: "insert-row", tableId, row })
  }

  updateRow(
    tableId: string,
    rowId: string,
    changes: BaseRow
  ): Promise<BaseRowMutationResult> {
    return this.call({ type: "update-row", tableId, rowId, changes })
  }

  updateField(
    tableId: string,
    columnName: string,
    changes: UpdateBaseFieldInput
  ): Promise<BaseSnapshot> {
    return this.call({
      type: "update-field",
      tableId,
      columnName,
      changes,
    })
  }

  addField(
    tableId: string,
    field: CreateBaseFieldInput,
    placement?: BaseFieldPlacement
  ): Promise<BaseSnapshot> {
    return this.call({
      type: "add-field",
      tableId,
      field,
      ...(placement ? { placement } : {}),
    })
  }

  deleteField(tableId: string, columnName: string): Promise<BaseSnapshot> {
    return this.call({ type: "delete-field", tableId, columnName })
  }

  updateView(
    viewId: string,
    changes: UpdateBaseViewInput
  ): Promise<BaseSnapshot> {
    return this.call({ type: "update-view", viewId, changes })
  }

  exportFile(): Promise<BaseWorkerExportResult> {
    return this.call({ type: "export" })
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
    const error = new Error("The Base runtime worker was closed")
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}
