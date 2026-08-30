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
    private readonly onSnapshot?: (snapshot: EidosFileSnapshot) => void
  ) {}

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
    return window.eidosLite.callRuntime(this.sessionId, "getPage", args)
  }

  getRow(...args: Parameters<NonNullable<EidosFileDataSource["getRow"]>>) {
    return window.eidosLite.callRuntime(this.sessionId, "getRow", args)
  }

  getRowIndex(
    ...args: Parameters<NonNullable<EidosFileDataSource["getRowIndex"]>>
  ) {
    return window.eidosLite.callRuntime(this.sessionId, "getRowIndex", args)
  }

  getGroupCounts(
    ...args: Parameters<NonNullable<EidosFileDataSource["getGroupCounts"]>>
  ) {
    return window.eidosLite.callRuntime(this.sessionId, "getGroupCounts", args)
  }

  calculateColumnStats(
    ...args: Parameters<EidosFileDataSource["calculateColumnStats"]>
  ) {
    return window.eidosLite.callRuntime(
      this.sessionId,
      "calculateColumnStats",
      args
    )
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
