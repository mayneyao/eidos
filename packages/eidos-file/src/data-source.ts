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
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowMutationResult,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileRowQuery,
  EidosFileRowRange,
  EidosFileRowsDeleteResult,
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
  getGroupCounts?(
    tableId: string,
    columnName: string,
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
    row: EidosFileRow
  ): Promise<EidosFileRowMutationResult>
  updateRow(
    tableId: string,
    rowId: string,
    changes: EidosFileRow
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
  updateField(
    tableId: string,
    columnName: string,
    changes: UpdateEidosFileFieldInput
  ): Promise<EidosFileSnapshot>
  addField(
    tableId: string,
    field: CreateEidosFileFieldInput,
    placement?: EidosFileFieldPlacement
  ): Promise<EidosFileSnapshot>
  deleteField(tableId: string, columnName: string): Promise<EidosFileSnapshot>
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

  async getGroupCounts(
    tableId: string,
    columnName: string,
    query: EidosFileRowQuery
  ): Promise<EidosFileRowGroupCount[]> {
    return this.runtime.countRowsByField(tableId, columnName, query)
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
    row: EidosFileRow
  ): Promise<EidosFileRowMutationResult> {
    return this.mutationResult(tableId, this.runtime.insertRow(tableId, row))
  }

  async updateRow(
    tableId: string,
    rowId: string,
    changes: EidosFileRow
  ): Promise<EidosFileRowMutationResult> {
    return this.mutationResult(
      tableId,
      this.runtime.updateRow(tableId, rowId, changes)
    )
  }

  async deleteRowRanges(
    tableId: string,
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery
  ): Promise<EidosFileRowsDeleteResult> {
    const deletedCount = this.runtime.deleteRowRanges(tableId, ranges, query)
    return this.deleteResult(tableId, deletedCount)
  }

  async deleteRows(
    tableId: string,
    rowIds: string[]
  ): Promise<EidosFileRowsDeleteResult> {
    return this.deleteResult(
      tableId,
      this.runtime.deleteRows(tableId, rowIds).length
    )
  }

  async updateField(
    tableId: string,
    columnName: string,
    changes: UpdateEidosFileFieldInput
  ): Promise<EidosFileSnapshot> {
    this.runtime.updateField(tableId, columnName, changes)
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
    columnName: string
  ): Promise<EidosFileSnapshot> {
    this.runtime.deleteField(tableId, columnName)
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
      revision: this.runtime.info().updatedAt,
    }
  }

  private deleteResult(
    tableId: string,
    deletedCount: number
  ): EidosFileRowsDeleteResult {
    return {
      tableId,
      deletedCount,
      rowCount: this.runtime.countRows(tableId),
      revision: this.runtime.info().updatedAt,
    }
  }
}
