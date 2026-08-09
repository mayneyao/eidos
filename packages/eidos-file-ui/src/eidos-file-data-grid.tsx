import { useCallback, useMemo, useState } from "react"
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
  FileEntry,
  UpdateEidosFileFieldInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"

import { EidosFileGrid } from "./eidos-file-grid"
import type { EidosFileEditorDataSource } from "./data-source"
import { EidosFileFieldDeleteDialog } from "./eidos-file-field-delete-dialog"
import { eidosFileFieldKey } from "./eidos-file-field-visibility"
import { searchEidosFileRelationRecords } from "./eidos-file-relation-search"

export interface EidosFileDataGridProps {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  tables?: readonly EidosFileTableSnapshot[]
  view?: EidosFileViewInfo
  search?: string
  searchResultIndex?: number | null
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
  onSearchResultCountChange?: (rowCount: number | null) => void
  onError?: (error: unknown) => void
  onImportFiles?: () => Promise<FileEntry[]>
  onImportDroppedFiles?: (files: File[]) => Promise<FileEntry[]>
}

function isStaleRevision(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "stale-revision"
  )
}

function isSafeReapplicationField(field: EidosFileFieldInfo): boolean {
  return (
    field.valueKind === "source" &&
    !field.isDerived &&
    field.systemRole == null &&
    field.type !== "file"
  )
}

function sameLogicalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) {
    return false
  }
  if (left.byteLength !== right.byteLength) return false
  return left.every((value, index) => value === right[index])
}

function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function sameStructuredValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return sameLogicalValue(left, right)
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameStructuredValue(value, right[index]))
    )
  }
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
    .filter((key) => leftRecord[key] !== undefined)
    .sort()
  const rightKeys = Object.keys(rightRecord)
    .filter((key) => rightRecord[key] !== undefined)
    .sort()
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        sameStructuredValue(leftRecord[key], rightRecord[key])
    )
  )
}

function sameEditorSchema(
  previous: readonly EidosFileTableSnapshot[],
  current: readonly EidosFileTableSnapshot[]
): boolean {
  const descriptors = (snapshots: readonly EidosFileTableSnapshot[]) =>
    snapshots.map(({ table, fields, views }) => ({ table, fields, views }))
  return sameStructuredValue(descriptors(previous), descriptors(current))
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
  searchResultIndex = null,
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
  onSearchResultCountChange,
  onError,
  onImportFiles,
  onImportDroppedFiles,
}: EidosFileDataGridProps) {
  const [deleteFieldTarget, setDeleteFieldTarget] =
    useState<EidosFileFieldInfo | null>(null)
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
      const fieldKey = eidosFileFieldKey(field)
      const rowId = String(row._id)
      const fields = { [fieldKey]: value }
      let result: EidosFileRowMutationResult
      try {
        result = await source.updateRow(table.table.id, rowId, fields)
      } catch (error) {
        if (
          !isStaleRevision(error) ||
          !tables ||
          !source.getRow ||
          !isSafeReapplicationField(field) ||
          !hasOwn(row, fieldKey)
        ) {
          throw error
        }

        let currentRow: EidosFileRow | null
        try {
          const currentSnapshot = await source.getSnapshot()
          const currentTable = currentSnapshot.tables.find(
            (candidate) => candidate.table.id === table.table.id
          )
          const currentField = currentTable?.fields.find(
            (candidate) => candidate.id === field.id
          )
          if (
            !currentField ||
            !isSafeReapplicationField(currentField) ||
            !sameEditorSchema(tables, currentSnapshot.tables) ||
            !sameStructuredValue(field, currentField)
          ) {
            throw error
          }
          currentRow = await source.getRow(table.table.id, rowId)
        } catch {
          throw error
        }

        if (
          !currentRow ||
          !hasOwn(currentRow, fieldKey) ||
          !sameLogicalValue(row[fieldKey], currentRow[fieldKey])
        ) {
          throw error
        }

        result = await source.updateRow(table.table.id, rowId, fields)
      }
      onMutation?.(result)
      return result
    },
    [onMutation, source, table.table.id, tables]
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
    async (field: EidosFileFieldInfo) => {
      const snapshot = await source.deleteField(
        table.table.id,
        eidosFileFieldKey(field)
      )
      onSnapshot?.(snapshot)
      onFieldClose?.()
    },
    [onFieldClose, onSnapshot, source, table.table.id]
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
    (field: EidosFileFieldInfo, relationQuery: string) =>
      searchEidosFileRelationRecords(source, field, relationQuery),
    [source]
  )

  return (
    <>
      <EidosFileGrid
        table={table}
        tables={tables}
        view={view}
        disabled={disabled}
        reloadToken={reloadToken}
        searchResultIndex={searchResultIndex}
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
        onRowCountChange={onSearchResultCountChange}
        onDeleteField={setDeleteFieldTarget}
        onSearchRelation={searchRelation}
        onImportFiles={onImportFiles}
        onImportDroppedFiles={onImportDroppedFiles}
        onRequestDeleteRows={
          onDeleteRows
            ? (ranges) => void onDeleteRows(ranges, query)
            : undefined
        }
        onViewUpdate={view ? updateView : undefined}
        onError={onError}
      />
      <EidosFileFieldDeleteDialog
        field={deleteFieldTarget}
        disabled={disabled}
        onOpenChange={(open) => {
          if (!open) setDeleteFieldTarget(null)
        }}
        onDelete={deleteField}
        onError={onError}
      />
    </>
  )
}
