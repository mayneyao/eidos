import { useCallback, useMemo } from "react"
import type {
  EidosFileColumnStatConfig,
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRowQuery,
  EidosFileRowRange,
  EidosFileSnapshot,
  EidosFileSqlPrimitive,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
  UpdateEidosFileFieldInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"

import { EidosFileGrid } from "./eidos-file-grid"
import type { EidosFileEditorDataSource } from "./data-source"

export interface EidosFileDataGridProps {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  view?: EidosFileViewInfo
  search?: string
  disabled?: boolean
  reloadToken?: number
  propertyField?: EidosFileFieldInfo | null
  onMutation?: (result: EidosFileRowMutationResult) => void
  onDeleteRows?: (
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery
  ) => Promise<void>
  onSnapshot?: (snapshot: EidosFileSnapshot) => void
  onFieldOpen?: (field: EidosFileFieldInfo) => void
  onFieldClose?: () => void
  onFieldAdd?: (position?: number) => void
  onError?: (error: unknown) => void
}

/**
 * Convenience adapter for hosts that expose the public EidosFileEditorDataSource.
 * It keeps paging and mutations outside React while rendering the exact shared
 * Desktop Grid component.
 */
export function EidosFileDataGrid({
  source,
  table,
  view,
  search = "",
  disabled = false,
  reloadToken = 0,
  propertyField,
  onMutation,
  onDeleteRows,
  onSnapshot,
  onFieldOpen,
  onFieldClose,
  onFieldAdd,
  onError,
}: EidosFileDataGridProps) {
  const query = useMemo<EidosFileRowQuery>(
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

  const loadColumnStats = useCallback(
    (configs: EidosFileColumnStatConfig[]) =>
      source.calculateColumnStats(table.table.id, configs, query),
    [query, source, table.table.id]
  )

  const addRow = useCallback(async () => {
    const result = await source.insertRow(table.table.id, { title: "" })
    onMutation?.(result)
    return result
  }, [onMutation, source, table.table.id])

  const editCell = useCallback(
    async (
      row: EidosFileRow,
      field: EidosFileFieldInfo,
      value: EidosFileSqlPrimitive
    ) => {
      const result = await source.updateRow(table.table.id, String(row._id), {
        [field.tableColumnName]: value,
      })
      onMutation?.(result)
      return result
    },
    [onMutation, source, table.table.id]
  )

  const updateField = useCallback(
    async (field: EidosFileFieldInfo, changes: UpdateEidosFileFieldInput) => {
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
    (field: EidosFileFieldInfo) => {
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
    async (changes: UpdateEidosFileViewInput) => {
      if (!view) return
      const snapshot = await source.updateView(view.id, changes)
      onSnapshot?.(snapshot)
    },
    [onSnapshot, source, view]
  )

  return (
    <EidosFileGrid
      table={table}
      view={view}
      disabled={disabled}
      reloadToken={reloadToken}
      loadPage={loadPage}
      loadColumnStats={loadColumnStats}
      onAddRow={addRow}
      onCellEdit={editCell}
      propertyField={propertyField}
      onPropertyFieldOpen={onFieldOpen}
      onPropertyFieldClose={onFieldClose}
      onFieldUpdate={updateField}
      onAddField={onFieldAdd}
      onDeleteField={deleteField}
      onRequestDeleteRows={
        onDeleteRows ? (ranges) => void onDeleteRows(ranges, query) : undefined
      }
      onViewUpdate={view ? updateView : undefined}
      onError={onError}
    />
  )
}
