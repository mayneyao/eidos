import type { EidosFileRuntime } from "./runtime"
import type {
  CreateEidosFileFieldInput,
  CreateEidosFileTableInput,
  CreateEidosFileViewInput,
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileFieldPlacement,
  EidosFileFormulaPreview,
  EidosFileFormulaPreviewInput,
  EidosFileLogicalValue,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowMutationResult,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileRowQuery,
  EidosFileRowRange,
  EidosFileRowsDeleteResult,
  EidosFileRowsUndoResult,
  EidosFileSnapshot,
  UpdateEidosFileFieldInput,
  UpdateEidosFileTableInput,
  UpdateEidosFileViewInput,
} from "./types"

/**
 * Async, host-neutral data contract consumed by Eidos File views.
 *
 * A host may implement this with a Worker, an Electron bridge, a remote
 * process, or the browser runtime. Views never receive a SQLite connection,
 * native file handle, router, or application store.
 */
export interface EidosFileDataSource {
  getSnapshot(): Promise<EidosFileSnapshot>
  getPage(
    tableId: string,
    offset: number,
    limit: number,
    query: EidosFileRowQuery,
    totalHint?: number,
    cursor?: string,
    projection?: EidosFileRowPageProjection
  ): Promise<EidosFileRowPage>
  getRow?(tableId: string, rowId: string): Promise<EidosFileRow | null>
  getRowIndex?(
    tableId: string,
    rowId: string,
    query: EidosFileRowQuery
  ): Promise<number | null>
  getGroupCounts?(
    tableId: string,
    fieldId: string,
    query: EidosFileRowQuery
  ): Promise<EidosFileRowGroupCount[]>
  calculateColumnStats(
    tableId: string,
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery
  ): Promise<EidosFileColumnStatResult[]>
  /**
   * Validate a draft formula against the live file and return sample values.
   * Hosts without a runtime preview boundary may omit this; the shared UI
   * still performs schema-level compilation before saving.
   */
  previewFormula?(
    tableId: string,
    input: EidosFileFormulaPreviewInput
  ): Promise<EidosFileFormulaPreview>
  insertRow(
    tableId: string,
    fields: Record<string, EidosFileLogicalValue>
  ): Promise<EidosFileRowMutationResult>
  updateRow(
    tableId: string,
    rowId: string,
    fields: Record<string, EidosFileLogicalValue>
  ): Promise<EidosFileRowMutationResult>
  deleteRowRanges(
    tableId: string,
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery
  ): Promise<EidosFileRowsDeleteResult>
  deleteRows(
    tableId: string,
    rowIds: string[]
  ): Promise<EidosFileRowsDeleteResult>
  /** Undo a reversible row mutation. The returned token performs its inverse. */
  revertRowMutation?(
    tableId: string,
    undoToken: string
  ): Promise<EidosFileRowsUndoResult>
  updateField(
    tableId: string,
    fieldId: string,
    changes: UpdateEidosFileFieldInput
  ): Promise<EidosFileSnapshot>
  addField(
    tableId: string,
    field: CreateEidosFileFieldInput,
    placement?: EidosFileFieldPlacement
  ): Promise<EidosFileSnapshot>
  deleteField(tableId: string, fieldId: string): Promise<EidosFileSnapshot>
  createTable(input: CreateEidosFileTableInput): Promise<EidosFileSnapshot>
  updateTable(
    tableId: string,
    changes: UpdateEidosFileTableInput
  ): Promise<EidosFileSnapshot>
  deleteTable(tableId: string): Promise<EidosFileSnapshot>
  createView(
    tableId: string,
    input: CreateEidosFileViewInput
  ): Promise<EidosFileSnapshot>
  duplicateView(viewId: string, name?: string): Promise<EidosFileSnapshot>
  deleteView(viewId: string): Promise<EidosFileSnapshot>
  reorderViews(tableId: string, viewIds: string[]): Promise<EidosFileSnapshot>
  updateView(
    viewId: string,
    changes: UpdateEidosFileViewInput
  ): Promise<EidosFileSnapshot>
}

export function eidosFileSnapshot(
  runtime: EidosFileRuntime,
  path: string
): EidosFileSnapshot {
  return {
    path,
    metadata: runtime.info(),
    tables: runtime.listTables().map((table) => ({
      table,
      fields: runtime.listFields(table.id),
      views: runtime.listViews(table.id),
      rowCount: runtime.countRows(table.id),
    })),
  }
}

/** Adapts the synchronous core runtime to the public async view contract. */
export class EidosFileRuntimeDataSource implements EidosFileDataSource {
  constructor(
    readonly runtime: EidosFileRuntime,
    readonly path: string
  ) {}

  async getSnapshot(): Promise<EidosFileSnapshot> {
    return eidosFileSnapshot(this.runtime, this.path)
  }

  async getPage(
    tableId: string,
    offset: number,
    limit: number,
    query: EidosFileRowQuery,
    totalHint?: number,
    cursor?: string,
    projection?: EidosFileRowPageProjection
  ): Promise<EidosFileRowPage> {
    return this.runtime.getRowPage(
      tableId,
      offset,
      limit,
      query,
      totalHint,
      cursor,
      projection
    )
  }

  async getRow(tableId: string, rowId: string): Promise<EidosFileRow | null> {
    return this.runtime.getRow(tableId, rowId)
  }

  async getRowIndex(
    tableId: string,
    rowId: string,
    query: EidosFileRowQuery
  ): Promise<number | null> {
    return this.runtime.getRowIndex(tableId, rowId, query)
  }

  async getGroupCounts(
    tableId: string,
    fieldId: string,
    query: EidosFileRowQuery
  ): Promise<EidosFileRowGroupCount[]> {
    return this.runtime.countRowsByField(tableId, fieldId, query)
  }

  async calculateColumnStats(
    tableId: string,
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery
  ): Promise<EidosFileColumnStatResult[]> {
    return this.runtime.calculateColumnStats(tableId, configs, query)
  }

  async previewFormula(
    tableId: string,
    input: EidosFileFormulaPreviewInput
  ): Promise<EidosFileFormulaPreview> {
    return this.runtime.previewFormula(tableId, input)
  }

  async insertRow(
    tableId: string,
    fields: Record<string, EidosFileLogicalValue>
  ): Promise<EidosFileRowMutationResult> {
    const mutation = this.runtime.mutateRows({
      tableId,
      insert: [{ fields }],
    })
    return this.mutationResult(
      tableId,
      this.runtime.getRow(tableId, mutation.rows[0]!.id)!
    )
  }

  async updateRow(
    tableId: string,
    rowId: string,
    fields: Record<string, EidosFileLogicalValue>
  ): Promise<EidosFileRowMutationResult> {
    return this.mutationResult(
      tableId,
      (() => {
        this.runtime.mutateRows({ tableId, update: [{ id: rowId, fields }] })
        return this.runtime.getRow(tableId, rowId)!
      })()
    )
  }

  async deleteRowRanges(
    tableId: string,
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery
  ): Promise<EidosFileRowsDeleteResult> {
    const result = this.runtime.deleteRowRangesReversible(
      tableId,
      ranges,
      query
    )
    return this.deleteResult(
      tableId,
      result.deleted.length,
      result.rowCount,
      result.undoToken
    )
  }

  async deleteRows(
    tableId: string,
    rowIds: string[]
  ): Promise<EidosFileRowsDeleteResult> {
    const result = this.runtime.deleteRowsReversible(tableId, rowIds)
    return this.deleteResult(
      tableId,
      result.deleted.length,
      result.rowCount,
      result.undoToken
    )
  }

  async revertRowMutation(
    tableId: string,
    undoToken: string
  ): Promise<EidosFileRowsUndoResult> {
    const result = this.runtime.revertRowMutation(undoToken)
    return {
      tableId,
      rowCount: result.rowCount,
      revision: result.revision,
      undoToken: result.undoToken,
    }
  }

  async updateField(
    tableId: string,
    fieldId: string,
    changes: UpdateEidosFileFieldInput
  ): Promise<EidosFileSnapshot> {
    this.runtime.updateField(tableId, fieldId, changes)
    return this.getSnapshot()
  }

  async addField(
    tableId: string,
    field: CreateEidosFileFieldInput,
    placement?: EidosFileFieldPlacement
  ): Promise<EidosFileSnapshot> {
    this.runtime.addField(tableId, field, placement)
    return this.getSnapshot()
  }

  async deleteField(
    tableId: string,
    fieldId: string
  ): Promise<EidosFileSnapshot> {
    this.runtime.deleteField(tableId, fieldId)
    return this.getSnapshot()
  }

  async createTable(
    input: CreateEidosFileTableInput
  ): Promise<EidosFileSnapshot> {
    this.runtime.createTable(input)
    return this.getSnapshot()
  }

  async updateTable(
    tableId: string,
    changes: UpdateEidosFileTableInput
  ): Promise<EidosFileSnapshot> {
    this.runtime.updateTable(tableId, changes)
    return this.getSnapshot()
  }

  async deleteTable(tableId: string): Promise<EidosFileSnapshot> {
    this.runtime.deleteTable(tableId)
    return this.getSnapshot()
  }

  async createView(
    tableId: string,
    input: CreateEidosFileViewInput
  ): Promise<EidosFileSnapshot> {
    this.runtime.createView(tableId, input)
    return this.getSnapshot()
  }

  async duplicateView(
    viewId: string,
    name?: string
  ): Promise<EidosFileSnapshot> {
    this.runtime.duplicateView(viewId, name)
    return this.getSnapshot()
  }

  async deleteView(viewId: string): Promise<EidosFileSnapshot> {
    this.runtime.deleteView(viewId)
    return this.getSnapshot()
  }

  async reorderViews(
    tableId: string,
    viewIds: string[]
  ): Promise<EidosFileSnapshot> {
    this.runtime.reorderViews(tableId, viewIds)
    return this.getSnapshot()
  }

  async updateView(
    viewId: string,
    changes: UpdateEidosFileViewInput
  ): Promise<EidosFileSnapshot> {
    this.runtime.updateView(viewId, changes)
    return this.getSnapshot()
  }

  private mutationResult(
    tableId: string,
    row: EidosFileRow
  ): EidosFileRowMutationResult {
    return {
      tableId,
      row,
      rowCount: this.runtime.countRows(tableId),
      revision: this.runtime.info().revision,
    }
  }

  private deleteResult(
    tableId: string,
    deletedCount: number,
    rowCount: number,
    undoToken?: string
  ): EidosFileRowsDeleteResult {
    return {
      tableId,
      deletedCount,
      rowCount,
      revision: this.runtime.info().revision,
      ...(undoToken ? { undoToken } : {}),
    }
  }
}
