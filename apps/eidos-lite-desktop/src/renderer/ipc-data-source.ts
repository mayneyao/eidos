import type {
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileDataSource,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "@eidos.space/eidos-file-ui"
import {
  isEidosLiteSchemaImpactRequiredResult,
  type RuntimeCalls,
  type RuntimeMutationMethod,
} from "../shared/contracts"

export class IpcEidosFileDataSource implements EidosFileEditorDataSource {
  constructor(
    readonly sessionId: string,
    private snapshotValue: EidosFileSnapshot,
    private readonly onSnapshot?: (snapshot: EidosFileSnapshot) => void,
    private readonly consumer: {
      calendarQueryVersion?: 2
      calendarWindowVersion?: 1
    } = {},
    readonly readOnly = false
  ) {}

  private callRuntime: typeof window.eidosLite.callRuntime = (
    sessionId,
    method,
    args
  ) =>
    this.consumer.calendarQueryVersion === 2
      ? window.eidosLite.callRuntime(sessionId, method, args, this.consumer)
      : window.eidosLite.callRuntime(sessionId, method, args)

  private async mutate<M extends RuntimeMutationMethod>(
    method: M,
    args: RuntimeCalls[M]["args"]
  ): Promise<RuntimeCalls[M]["result"]> {
    const result = await this.callRuntime(this.sessionId, method, args)
    if (isEidosLiteSchemaImpactRequiredResult(result)) {
      throw Object.assign(
        new Error("Review the schema change impact before applying it"),
        {
          name: "EidosFileSchemaImpactRequiredError",
          code: "schema-impact-confirmation-required",
          impact: result.impact,
        }
      )
    }
    await this.getSnapshot()
    this.onSnapshot?.(this.snapshotValue)
    return result
  }

  async getSnapshot(): Promise<EidosFileSnapshot> {
    this.snapshotValue = await this.callRuntime(
      this.sessionId,
      "getSnapshot",
      []
    )
    return this.snapshotValue
  }

  getPage(...args: Parameters<EidosFileDataSource["getPage"]>) {
    return this.callRuntime(this.sessionId, "getPage", args)
  }

  readTablePluginConfig(
    ...args: RuntimeCalls["readTablePluginConfig"]["args"]
  ) {
    return this.callRuntime(this.sessionId, "readTablePluginConfig", args)
  }
  writeTablePluginConfig(
    ...args: RuntimeCalls["writeTablePluginConfig"]["args"]
  ) {
    return this.mutate("writeTablePluginConfig", args)
  }
  async captureTableActionTarget(
    tableId: string,
    query: RuntimeCalls["captureTableActionTarget"]["args"][1],
    ranges: RuntimeCalls["captureTableActionTarget"]["args"][2],
    signal?: AbortSignal
  ) {
    signal?.throwIfAborted()
    const ids = await this.callRuntime(
      this.sessionId,
      "captureTableActionTarget",
      [tableId, query, ranges]
    )
    signal?.throwIfAborted()
    return ids
  }
  readTableActionRows(...args: RuntimeCalls["readTableActionRows"]["args"]) {
    return this.callRuntime(this.sessionId, "readTableActionRows", args)
  }
  writeTableActionRow(
    tableId: string,
    row: RuntimeCalls["writeTableActionRow"]["args"][1],
    values: RuntimeCalls["writeTableActionRow"]["args"][2],
    signal?: AbortSignal
  ) {
    signal?.throwIfAborted()
    // A dispatched atomic write must settle so cancellation retains its undo receipt.
    return this.callRuntime(this.sessionId, "writeTableActionRow", [
      tableId,
      row,
      values,
    ])
  }
  undoTableActionRow(token: string) {
    return this.callRuntime(this.sessionId, "undoTableActionRow", [token])
  }
  releaseTableActionUndo(tokens: string[]) {
    void window.eidosLite
      .callRuntime(this.sessionId, "releaseTableActionUndo", [tokens])
      .catch(() => {})
  }

  getPages(...args: Parameters<NonNullable<EidosFileDataSource["getPages"]>>) {
    return this.callRuntime(this.sessionId, "getPages", args)
  }

  getRow(...args: Parameters<NonNullable<EidosFileDataSource["getRow"]>>) {
    return this.callRuntime(this.sessionId, "getRow", args)
  }

  getRecordNeighbors(
    ...args: Parameters<NonNullable<EidosFileDataSource["getRecordNeighbors"]>>
  ) {
    return this.callRuntime(this.sessionId, "getRecordNeighbors", args)
  }

  getRowIndex(
    ...args: Parameters<NonNullable<EidosFileDataSource["getRowIndex"]>>
  ) {
    return this.callRuntime(this.sessionId, "getRowIndex", args)
  }

  getGroupCounts(
    ...args: Parameters<NonNullable<EidosFileDataSource["getGroupCounts"]>>
  ) {
    return this.callRuntime(this.sessionId, "getGroupCounts", args)
  }

  calculateColumnStats(
    ...args: Parameters<EidosFileDataSource["calculateColumnStats"]>
  ) {
    return this.callRuntime(this.sessionId, "calculateColumnStats", args)
  }

  aggregateTable(
    ...args: Parameters<NonNullable<EidosFileDataSource["aggregateTable"]>>
  ) {
    return this.callRuntime(this.sessionId, "aggregateTable", args)
  }

  previewFormula(
    ...args: Parameters<NonNullable<EidosFileDataSource["previewFormula"]>>
  ) {
    return this.callRuntime(this.sessionId, "previewFormula", args)
  }

  previewCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<EidosFileCsvImportPlan> {
    return this.callRuntime(this.sessionId, "previewCsv", [
      fileName,
      bytes,
      options,
    ])
  }

  importCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<{
    snapshot: EidosFileSnapshot
    result: EidosFileCsvImportResult
  }> {
    return this.mutate("importCsv", [fileName, bytes, options])
  }

  insertRow(...args: Parameters<EidosFileDataSource["insertRow"]>) {
    return this.mutate("insertRow", args)
  }

  updateRow(...args: Parameters<EidosFileDataSource["updateRow"]>) {
    return this.mutate("updateRow", args)
  }

  deleteRowRanges(...args: Parameters<EidosFileDataSource["deleteRowRanges"]>) {
    return this.mutate("deleteRowRanges", args)
  }

  deleteRows(...args: Parameters<EidosFileDataSource["deleteRows"]>) {
    return this.mutate("deleteRows", args)
  }

  revertRowMutation(
    ...args: Parameters<NonNullable<EidosFileDataSource["revertRowMutation"]>>
  ) {
    return this.mutate("revertRowMutation", args)
  }

  updateField(...args: Parameters<EidosFileDataSource["updateField"]>) {
    return this.mutate("updateField", args)
  }

  addField(...args: Parameters<EidosFileDataSource["addField"]>) {
    return this.mutate("addField", args)
  }

  deleteField(...args: Parameters<EidosFileDataSource["deleteField"]>) {
    return this.mutate("deleteField", args)
  }

  createTable(...args: Parameters<EidosFileDataSource["createTable"]>) {
    return this.mutate("createTable", args)
  }

  updateTable(...args: Parameters<EidosFileDataSource["updateTable"]>) {
    return this.mutate("updateTable", args)
  }

  deleteTable(...args: Parameters<EidosFileDataSource["deleteTable"]>) {
    return this.mutate("deleteTable", args)
  }

  reorderTables(
    ...args: Parameters<NonNullable<EidosFileEditorDataSource["reorderTables"]>>
  ) {
    return this.mutate("reorderTables", args)
  }

  createView(...args: Parameters<EidosFileDataSource["createView"]>) {
    return this.mutate("createView", args)
  }

  duplicateView(...args: Parameters<EidosFileDataSource["duplicateView"]>) {
    return this.mutate("duplicateView", args)
  }

  deleteView(...args: Parameters<EidosFileDataSource["deleteView"]>) {
    return this.mutate("deleteView", args)
  }

  reorderViews(...args: Parameters<EidosFileDataSource["reorderViews"]>) {
    return this.mutate("reorderViews", args)
  }

  updateView(...args: Parameters<EidosFileDataSource["updateView"]>) {
    return this.mutate("updateView", args)
  }
}
