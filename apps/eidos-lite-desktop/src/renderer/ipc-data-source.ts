import type {
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileDataSource,
  EidosFileSnapshot,
  EidosFileRowQuery,
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
    readonly propertyDirectory: string | null = null
  ) {}

  withPropertyDirectory(
    directory: string | null,
    snapshot = this.snapshotValue
  ) {
    return new IpcEidosFileDataSource(
      this.sessionId,
      snapshot,
      this.onSnapshot,
      directory
    )
  }

  private scopedQuery(
    tableId: string,
    query: EidosFileRowQuery
  ): EidosFileRowQuery {
    if (!this.propertyDirectory) return query
    const table = this.snapshotValue.tables.find(
      ({ table }) => table.id === tableId
    )
    if (table?.table.settings?.vtabModule !== "fs_meta") return query
    const field = table.fields.find((field) => field.name === "path")
    if (!field) throw new Error("File metadata table has no path field")
    return {
      ...query,
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: field.id,
            operator: "starts-with",
            value: `${this.propertyDirectory}/`,
          },
          ...(query.filter ? [query.filter] : []),
        ],
      },
    }
  }

  private async mutate<M extends RuntimeMutationMethod>(
    method: M,
    args: RuntimeCalls[M]["args"]
  ): Promise<RuntimeCalls[M]["result"]> {
    const result = await window.eidosLite.callRuntime(
      this.sessionId,
      method,
      args
    )
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
    this.snapshotValue = await window.eidosLite.callRuntime(
      this.sessionId,
      "getSnapshot",
      []
    )
    return this.snapshotValue
  }

  getPage(...args: Parameters<EidosFileDataSource["getPage"]>) {
    args[3] = this.scopedQuery(args[0], args[3])
    // A Grid's initial hint comes from the full catalog snapshot.
    if (this.propertyDirectory) args[4] = undefined
    return window.eidosLite.callRuntime(this.sessionId, "getPage", args)
  }

  readTablePluginConfig(
    ...args: RuntimeCalls["readTablePluginConfig"]["args"]
  ) {
    return window.eidosLite.callRuntime(
      this.sessionId,
      "readTablePluginConfig",
      args
    )
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
    const ids = await window.eidosLite.callRuntime(
      this.sessionId,
      "captureTableActionTarget",
      [tableId, this.scopedQuery(tableId, query), ranges]
    )
    signal?.throwIfAborted()
    return ids
  }
  readTableActionRows(...args: RuntimeCalls["readTableActionRows"]["args"]) {
    return window.eidosLite.callRuntime(
      this.sessionId,
      "readTableActionRows",
      args
    )
  }
  writeTableActionRow(
    tableId: string,
    row: RuntimeCalls["writeTableActionRow"]["args"][1],
    values: RuntimeCalls["writeTableActionRow"]["args"][2],
    signal?: AbortSignal
  ) {
    signal?.throwIfAborted()
    // A dispatched atomic write must settle so cancellation retains its undo receipt.
    return window.eidosLite.callRuntime(this.sessionId, "writeTableActionRow", [
      tableId,
      row,
      values,
    ])
  }
  undoTableActionRow(token: string) {
    return window.eidosLite.callRuntime(this.sessionId, "undoTableActionRow", [
      token,
    ])
  }
  releaseTableActionUndo(tokens: string[]) {
    void window.eidosLite
      .callRuntime(this.sessionId, "releaseTableActionUndo", [tokens])
      .catch(() => {})
  }

  async getRow(
    ...args: Parameters<NonNullable<EidosFileDataSource["getRow"]>>
  ) {
    if (
      this.propertyDirectory &&
      (await this.getRowIndex(args[0], args[1], {})) === null
    )
      return null
    return window.eidosLite.callRuntime(this.sessionId, "getRow", args)
  }

  getRecordNeighbors(
    ...args: Parameters<NonNullable<EidosFileDataSource["getRecordNeighbors"]>>
  ) {
    args[2] = this.scopedQuery(args[0], args[2])
    return window.eidosLite.callRuntime(
      this.sessionId,
      "getRecordNeighbors",
      args
    )
  }

  getRowIndex(
    ...args: Parameters<NonNullable<EidosFileDataSource["getRowIndex"]>>
  ) {
    args[2] = this.scopedQuery(args[0], args[2])
    return window.eidosLite.callRuntime(this.sessionId, "getRowIndex", args)
  }

  getGroupCounts(
    ...args: Parameters<NonNullable<EidosFileDataSource["getGroupCounts"]>>
  ) {
    args[2] = this.scopedQuery(args[0], args[2])
    return window.eidosLite.callRuntime(this.sessionId, "getGroupCounts", args)
  }

  calculateColumnStats(
    ...args: Parameters<EidosFileDataSource["calculateColumnStats"]>
  ) {
    args[2] = this.scopedQuery(args[0], args[2])
    return window.eidosLite.callRuntime(
      this.sessionId,
      "calculateColumnStats",
      args
    )
  }

  aggregateTable(
    ...args: Parameters<NonNullable<EidosFileDataSource["aggregateTable"]>>
  ) {
    args[2] = this.scopedQuery(args[0], args[2])
    return window.eidosLite.callRuntime(this.sessionId, "aggregateTable", args)
  }

  previewFormula(
    ...args: Parameters<NonNullable<EidosFileDataSource["previewFormula"]>>
  ) {
    return window.eidosLite.callRuntime(this.sessionId, "previewFormula", args)
  }

  previewCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<EidosFileCsvImportPlan> {
    return window.eidosLite.callRuntime(this.sessionId, "previewCsv", [
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

  async updateRow(...args: Parameters<EidosFileDataSource["updateRow"]>) {
    const result = await this.mutate("updateRow", args)
    if (!this.propertyDirectory) return result
    const page = await this.getPage(args[0], 0, 1, {})
    return { ...result, rowCount: page.total }
  }

  deleteRowRanges(...args: Parameters<EidosFileDataSource["deleteRowRanges"]>) {
    args[2] = this.scopedQuery(args[0], args[2])
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
