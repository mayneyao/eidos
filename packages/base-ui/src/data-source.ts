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

/**
 * Host-neutral mutation and paging contract consumed by Base editor surfaces.
 * SQLite and file-handle ownership stay outside React and outside this package.
 */
export interface BaseEditorDataSource {
  getSnapshot(): Promise<BaseSnapshot>
  getPage(
    tableId: string,
    offset: number,
    limit: number,
    query: BaseRowQuery,
    totalHint?: number,
    cursor?: string,
    projection?: BaseRowPageProjection
  ): Promise<BaseRowPage>
  /** Fetches the complete record used by card inspectors. */
  getRow?(tableId: string, rowId: string): Promise<BaseRow | null>
  /** Server-side/runtime grouping used by Kanban; hosts must not reimplement it in React. */
  getGroupCounts?(
    tableId: string,
    columnName: string,
    query: BaseRowQuery
  ): Promise<BaseRowGroupCount[]>
  insertRow(tableId: string, row: BaseRow): Promise<BaseRowMutationResult>
  updateRow(
    tableId: string,
    rowId: string,
    changes: BaseRow
  ): Promise<BaseRowMutationResult>
  updateField(
    tableId: string,
    columnName: string,
    changes: UpdateBaseFieldInput
  ): Promise<BaseSnapshot>
  addField(
    tableId: string,
    field: CreateBaseFieldInput,
    placement?: BaseFieldPlacement
  ): Promise<BaseSnapshot>
  deleteField(tableId: string, columnName: string): Promise<BaseSnapshot>
  updateView(
    viewId: string,
    changes: UpdateBaseViewInput
  ): Promise<BaseSnapshot>
}
