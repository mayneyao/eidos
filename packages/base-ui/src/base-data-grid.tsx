import { useCallback, useMemo } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowMutationResult,
  BaseRowQuery,
  BaseSnapshot,
  BaseSqlPrimitive,
  BaseTableSnapshot,
  BaseViewInfo,
  UpdateBaseFieldInput,
  UpdateBaseViewInput,
} from "@eidos.space/base"

import { BaseGrid } from "./base-grid"
import type { BaseEditorDataSource } from "./data-source"

export interface BaseDataGridProps {
  source: BaseEditorDataSource
  table: BaseTableSnapshot
  view?: BaseViewInfo
  search?: string
  disabled?: boolean
  reloadToken?: number
  propertyField?: BaseFieldInfo | null
  onMutation?: (result: BaseRowMutationResult) => void
  onSnapshot?: (snapshot: BaseSnapshot) => void
  onFieldOpen?: (field: BaseFieldInfo) => void
  onFieldClose?: () => void
  onFieldAdd?: (position?: number) => void
  onError?: (error: unknown) => void
}

/**
 * Convenience adapter for hosts that expose the public BaseEditorDataSource.
 * It keeps paging and mutations outside React while rendering the exact shared
 * Desktop Grid component.
 */
export function BaseDataGrid({
  source,
  table,
  view,
  search = "",
  disabled = false,
  reloadToken = 0,
  propertyField,
  onMutation,
  onSnapshot,
  onFieldOpen,
  onFieldClose,
  onFieldAdd,
  onError,
}: BaseDataGridProps) {
  const query = useMemo<BaseRowQuery>(
    () => ({
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(view?.filter ? { filter: view.filter } : {}),
      ...(view?.sorts.length ? { sorts: view.sorts } : {}),
    }),
    [search, view?.filter, view?.sorts]
  )

  const loadPage = useCallback(
    (offset: number, limit: number) =>
      source.getPage(
        table.table.id,
        offset,
        limit,
        query,
        search.trim() ? undefined : table.rowCount
      ),
    [query, search, source, table.rowCount, table.table.id]
  )

  const addRow = useCallback(async () => {
    const result = await source.insertRow(table.table.id, { title: "" })
    onMutation?.(result)
    return result
  }, [onMutation, source, table.table.id])

  const editCell = useCallback(
    async (row: BaseRow, field: BaseFieldInfo, value: BaseSqlPrimitive) => {
      const result = await source.updateRow(table.table.id, String(row._id), {
        [field.tableColumnName]: value,
      })
      onMutation?.(result)
      return result
    },
    [onMutation, source, table.table.id]
  )

  const updateField = useCallback(
    async (field: BaseFieldInfo, changes: UpdateBaseFieldInput) => {
      const snapshot = await source.updateField(
        table.table.id,
        field.tableColumnName,
        changes
      )
      onSnapshot?.(snapshot)
    },
    [onSnapshot, source, table.table.id]
  )

  const deleteField = useCallback(
    (field: BaseFieldInfo) => {
      void source
        .deleteField(table.table.id, field.tableColumnName)
        .then((snapshot) => {
          onSnapshot?.(snapshot)
          onFieldClose?.()
        })
        .catch((error) => onError?.(error))
    },
    [onError, onFieldClose, onSnapshot, source, table.table.id]
  )

  const updateView = useCallback(
    async (changes: UpdateBaseViewInput) => {
      if (!view) return
      const snapshot = await source.updateView(view.id, changes)
      onSnapshot?.(snapshot)
    },
    [onSnapshot, source, view]
  )

  return (
    <BaseGrid
      table={table}
      view={view}
      disabled={disabled}
      reloadToken={reloadToken}
      loadPage={loadPage}
      onAddRow={addRow}
      onCellEdit={editCell}
      propertyField={propertyField}
      onPropertyFieldOpen={onFieldOpen}
      onPropertyFieldClose={onFieldClose}
      onFieldUpdate={updateField}
      onAddField={onFieldAdd}
      onDeleteField={deleteField}
      onViewUpdate={view ? updateView : undefined}
      onError={onError}
    />
  )
}
