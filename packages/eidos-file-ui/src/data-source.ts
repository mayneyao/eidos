import type {
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileFieldPlacement,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowMutationResult,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileRowQuery,
  EidosFileSnapshot,
  CreateEidosFileFieldInput,
  UpdateEidosFileFieldInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"

/**
 * Host-neutral mutation and paging contract consumed by Eidos File editor surfaces.
 * SQLite and file-handle ownership stay outside React and outside this package.
 */
export interface EidosFileEditorDataSource {
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
  /** Fetches the complete record used by card inspectors. */
  getRow?(tableId: string, rowId: string): Promise<EidosFileRow | null>
  /** Server-side/runtime grouping used by Kanban; hosts must not reimplement it in React. */
  getGroupCounts?(
    tableId: string,
    columnName: string,
    query: EidosFileRowQuery
  ): Promise<EidosFileRowGroupCount[]>
  /** Calculates filtered Grid footer values in the shared runtime. */
  calculateColumnStats(
    tableId: string,
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery
  ): Promise<EidosFileColumnStatResult[]>
  insertRow(
    tableId: string,
    row: EidosFileRow
  ): Promise<EidosFileRowMutationResult>
  updateRow(
    tableId: string,
    rowId: string,
    changes: EidosFileRow
  ): Promise<EidosFileRowMutationResult>
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
  updateView(
    viewId: string,
    changes: UpdateEidosFileViewInput
  ): Promise<EidosFileSnapshot>
}
