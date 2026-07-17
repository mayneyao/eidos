import type {
  BaseFieldPlacement,
  BaseRow,
  BaseRowMutationResult,
  BaseRowPage,
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
    totalHint?: number
  ): Promise<BaseRowPage>
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
