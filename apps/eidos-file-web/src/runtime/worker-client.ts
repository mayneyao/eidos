import type {
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileFieldPlacement,
  EidosFileFormulaPreview,
  EidosFileFormulaPreviewInput,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowMutationResult,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileRowRange,
  EidosFileRowQuery,
  EidosFileRowsDeleteResult,
  EidosFileSnapshot,
  CreateEidosFileFieldInput,
  CreateEidosFileTableInput,
  CreateEidosFileViewInput,
  UpdateEidosFileFieldInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "@eidos.space/eidos-file-ui"

import type {
  EidosFileWorkerAction,
  EidosFileWorkerCsvImportResult,
  EidosFileWorkerExportResult,
  EidosFileWorkerOpenResult,
  EidosFileWorkerRequest,
  EidosFileWorkerResponse,
  EidosFileWorkerResult,
} from "./protocol"

interface PendingCall {
  resolve: (value: EidosFileWorkerResult) => void
  reject: (reason: Error) => void
}

export type { EidosFileEditorDataSource } from "@eidos.space/eidos-file-ui"

export class EidosFileWorkerClient implements EidosFileEditorDataSource {
  private readonly worker = new Worker(
    new URL("./eidos-file.worker.ts", import.meta.url),
    { type: "module", name: "eidos-file-runtime" }
  )
  private readonly pending = new Map<number, PendingCall>()
  private nextId = 1
  private terminated = false

  constructor() {
    this.worker.addEventListener(
      "message",
      (event: MessageEvent<EidosFileWorkerResponse>) => {
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
      const error = new Error(
        event.message || "The Eidos File runtime worker failed"
      )
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
    })
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

  openSource(
    fileName: string,
    recoveryId: string,
    bytes: ArrayBuffer
  ): Promise<EidosFileWorkerOpenResult> {
    return this.call({ type: "open-source", fileName, recoveryId, bytes }, [
      bytes,
    ])
  }

  openRecovery(
    fileName: string,
    recoveryId: string
  ): Promise<EidosFileWorkerOpenResult> {
    return this.call({ type: "open-recovery", fileName, recoveryId })
  }

  discardRecovery(recoveryId: string): Promise<{ discarded: true }> {
    return this.call({ type: "discard-recovery", recoveryId })
  }

  getSnapshot(): Promise<EidosFileSnapshot> {
    return this.call({ type: "snapshot" })
  }

  getPage(
    tableId: string,
    offset: number,
    limit: number,
    query: EidosFileRowQuery,
    totalHint?: number,
    cursor?: string,
    projection?: EidosFileRowPageProjection
  ): Promise<EidosFileRowPage> {
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

  getRow(tableId: string, rowId: string): Promise<EidosFileRow | null> {
    return this.call({ type: "row", tableId, rowId })
  }

  getGroupCounts(
    tableId: string,
    columnName: string,
    query: EidosFileRowQuery
  ): Promise<EidosFileRowGroupCount[]> {
    return this.call({ type: "group-counts", tableId, columnName, query })
  }

  calculateColumnStats(
    tableId: string,
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery
  ): Promise<EidosFileColumnStatResult[]> {
    return this.call({ type: "column-stats", tableId, configs, query })
  }

  previewFormula(
    tableId: string,
    input: EidosFileFormulaPreviewInput
  ): Promise<EidosFileFormulaPreview> {
    return this.call({ type: "formula-preview", tableId, input })
  }

  insertRow(
    tableId: string,
    row: EidosFileRow
  ): Promise<EidosFileRowMutationResult> {
    return this.call({ type: "insert-row", tableId, row })
  }

  updateRow(
    tableId: string,
    rowId: string,
    changes: EidosFileRow
  ): Promise<EidosFileRowMutationResult> {
    return this.call({ type: "update-row", tableId, rowId, changes })
  }

  deleteRowRanges(
    tableId: string,
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery
  ): Promise<EidosFileRowsDeleteResult> {
    return this.call({ type: "delete-row-ranges", tableId, ranges, query })
  }

  deleteRows(
    tableId: string,
    rowIds: string[]
  ): Promise<EidosFileRowsDeleteResult> {
    return this.call({ type: "delete-rows", tableId, rowIds })
  }

  updateField(
    tableId: string,
    columnName: string,
    changes: UpdateEidosFileFieldInput
  ): Promise<EidosFileSnapshot> {
    return this.call({
      type: "update-field",
      tableId,
      columnName,
      changes,
    })
  }

  addField(
    tableId: string,
    field: CreateEidosFileFieldInput,
    placement?: EidosFileFieldPlacement
  ): Promise<EidosFileSnapshot> {
    return this.call({
      type: "add-field",
      tableId,
      field,
      ...(placement ? { placement } : {}),
    })
  }

  deleteField(tableId: string, columnName: string): Promise<EidosFileSnapshot> {
    return this.call({ type: "delete-field", tableId, columnName })
  }

  createTable(input: CreateEidosFileTableInput): Promise<EidosFileSnapshot> {
    return this.call({ type: "create-table", input })
  }

  createView(
    tableId: string,
    input: CreateEidosFileViewInput
  ): Promise<EidosFileSnapshot> {
    return this.call({ type: "create-view", tableId, input })
  }

  duplicateView(viewId: string, name?: string): Promise<EidosFileSnapshot> {
    return this.call({
      type: "duplicate-view",
      viewId,
      ...(name ? { name } : {}),
    })
  }

  deleteView(viewId: string): Promise<EidosFileSnapshot> {
    return this.call({ type: "delete-view", viewId })
  }

  reorderViews(tableId: string, viewIds: string[]): Promise<EidosFileSnapshot> {
    return this.call({ type: "reorder-views", tableId, viewIds })
  }

  updateView(
    viewId: string,
    changes: UpdateEidosFileViewInput
  ): Promise<EidosFileSnapshot> {
    return this.call({ type: "update-view", viewId, changes })
  }

  previewCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<EidosFileCsvImportPlan> {
    return this.call({ type: "csv-preview", fileName, bytes, options }, [bytes])
  }

  importCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<EidosFileWorkerCsvImportResult> {
    return this.call({ type: "csv-import", fileName, bytes, options }, [bytes])
  }

  exportFile(): Promise<EidosFileWorkerExportResult> {
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
    const error = new Error("The Eidos File runtime worker was closed")
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}
