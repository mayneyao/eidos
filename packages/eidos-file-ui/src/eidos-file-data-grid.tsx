import { useCallback, useMemo } from "react"
import type {
  EidosFileColumnStatConfig,
  EidosFileFieldInfo,
  EidosFileRelationValue,
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
import {
  eidosFileFieldKey,
  isEidosFileRecordLabelField,
} from "./eidos-file-field-visibility"

export interface EidosFileDataGridProps {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  tables?: readonly EidosFileTableSnapshot[]
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
  onEditFormula?: (field: EidosFileFieldInfo) => void
  onEditLookup?: (field: EidosFileFieldInfo) => void
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
  tables,
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
  onEditFormula,
  onEditLookup,
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
        search.trim() || view?.filter ? undefined : table.rowCount
      ),
    [query, search, source, table.rowCount, table.table.id, view?.filter]
  )

  const loadColumnStats = useCallback(
    (configs: EidosFileColumnStatConfig[]) =>
      source.calculateColumnStats(table.table.id, configs, query),
    [query, source, table.table.id]
  )

  const addRow = useCallback(async () => {
    const result = await source.insertRow(table.table.id, {})
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
        [eidosFileFieldKey(field)]: value,
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
        eidosFileFieldKey(field),
        changes
      )
      onSnapshot?.(snapshot)
    },
    [onSnapshot, source, table.table.id]
  )

  const deleteField = useCallback(
    (field: EidosFileFieldInfo) => {
      void source
        .deleteField(table.table.id, eidosFileFieldKey(field))
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

  const searchRelation = useCallback(
    async (
      field: EidosFileFieldInfo,
      relationQuery: string
    ): Promise<EidosFileRelationValue[]> => {
      const targetTableId = field.property?.targetTableId
      if (typeof targetTableId !== "string" || !targetTableId) return []
      const snapshot = await source.getSnapshot()
      const targetTable = snapshot.tables.find(
        (candidate) => candidate.table.id === targetTableId
      )
      const labelField = targetTable?.fields.find(isEidosFileRecordLabelField)
      if (!labelField) return []
      const page = await source.getPage(
        targetTableId,
        0,
        50,
        relationQuery.trim() ? { search: relationQuery.trim() } : {},
        undefined,
        undefined,
        {
          columns: [labelField.tableColumnName],
          preservedColumns: ["_id"],
          fieldLimit: 1,
        }
      )
      return page.rows.flatMap((row) => {
        const id = row._id
        if (id === null || id === undefined) return []
        const display = row[labelField.tableColumnName] ?? id
        return [{ id: String(id), title: String(display ?? id) }]
      })
    },
    [source]
  )

  return (
    <EidosFileGrid
      table={table}
      tables={tables}
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
      onEditFormula={onEditFormula}
      onEditLookup={onEditLookup}
      onDeleteField={deleteField}
      onSearchRelation={searchRelation}
      onRequestDeleteRows={
        onDeleteRows ? (ranges) => void onDeleteRows(ranges, query) : undefined
      }
      onViewUpdate={view ? updateView : undefined}
      onError={onError}
    />
  )
}
