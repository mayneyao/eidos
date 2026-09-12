import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRowQuery,
  EidosFileSqlPrimitive,
  EidosFileTableSnapshot,
  FileEntry,
  RecordNeighbors,
} from "@eidos.space/eidos-file"

import type { EidosFileRelationRecordTarget } from "./context"
import type { EidosFileEditorDataSource } from "./data-source"
import {
  eidosFileContentField,
  eidosFileFieldKey,
} from "./eidos-file-field-visibility"
import { EidosFileRecordInspector } from "./eidos-file-record-inspector"
import { searchEidosFileRelationRecords } from "./eidos-file-relation-search"
import { useEidosFileRecordInspectorRow } from "./use-eidos-file-record-inspector-row"

export interface EidosFileRelatedRecordPanelProps {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  target: EidosFileRelationRecordTarget
  /**
   * Host-selected presentation. Defaults to the right panel, or the full page
   * for tables with a Content field.
   */
  presentation?: "panel" | "page"
  /** Switch between the side panel and the full content page. */
  onPresentationToggle?: () => void
  /** Active view query used to resolve previous and next Records. */
  query?: EidosFileRowQuery
  /** Invalidate neighbors after external row mutations. */
  reloadToken?: number
  /** Ask the Host to open a neighbouring Record in the same query order. */
  onNavigate?: (rowId: string) => void
  disabled?: boolean
  onClose: () => void
  onMutation?: (result: EidosFileRowMutationResult) => void
  onError?: (error: unknown) => void
  onImportFiles?: () => Promise<FileEntry[]>
  onImportDroppedFiles?: (
    files: File[],
    source?: "drop" | "paste"
  ) => Promise<FileEntry[]>
}

/** Host-neutral detail panel for a record reached through a relation field. */
export function EidosFileRelatedRecordPanel({
  source,
  table,
  target,
  presentation,
  onPresentationToggle,
  query,
  reloadToken,
  onNavigate,
  disabled = false,
  onClose,
  onMutation,
  onError,
  onImportFiles,
  onImportDroppedFiles,
}: EidosFileRelatedRecordPanelProps) {
  const loadRow = useMemo(
    () =>
      source.getRow
        ? (rowId: string) => source.getRow!(table.table.id, rowId)
        : undefined,
    [source, table.table.id]
  )
  const {
    inspectedRow,
    inspectorLoading,
    inspectorHasCompleteRow,
    inspectorLoadError,
    openInspectorRow,
    closeInspectorRow,
    replaceInspectorRow,
    retryInspectorRow,
  } = useEidosFileRecordInspectorRow(loadRow, true)

  const targetPreviewRef = useRef({ fields: table.fields, title: target.title })
  targetPreviewRef.current = { fields: table.fields, title: target.title }
  useEffect(() => {
    const { fields, title } = targetPreviewRef.current
    const labelField = fields.find((field) => field.isRecordLabel === true)
    openInspectorRow({
      _id: target.rowId,
      ...(labelField ? { [labelField.tableColumnName]: title } : {}),
    })
  }, [openInspectorRow, target.rowId])

  const editRecord = useCallback(
    async (
      _row: EidosFileRow,
      field: EidosFileFieldInfo,
      value: EidosFileSqlPrimitive
    ) => {
      const result = await source.updateRow(table.table.id, target.rowId, {
        [eidosFileFieldKey(field)]: value,
      })
      replaceInspectorRow(result.row)
      onMutation?.(result)
      return result
    },
    [onMutation, replaceInspectorRow, source, table.table.id, target.rowId]
  )

  // Key results by query value, row and revision so old neighbors cannot be used
  // while a new lookup is pending. Equivalent host renders do not restart reads.
  const queryKey = JSON.stringify(query)
  const [mutationRevision, setMutationRevision] = useState(0)
  const navigationKey = JSON.stringify([
    table.table.id,
    target.rowId,
    queryKey,
    mutationRevision,
    reloadToken,
  ])
  const [navigation, setNavigation] = useState<{
    key: string
    source: EidosFileEditorDataSource
    result: RecordNeighbors
  } | null>(null)
  const onNavigateRef = useRef(onNavigate)
  onNavigateRef.current = onNavigate
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const canNavigate = Boolean(onNavigate)
  useEffect(() => {
    let active = true
    if (!queryKey || !canNavigate || !source.getRecordNeighbors) return
    void (async () => {
      try {
        const result = await source.getRecordNeighbors!(
          table.table.id,
          target.rowId,
          JSON.parse(queryKey) as EidosFileRowQuery
        )
        if (active) setNavigation({ key: navigationKey, source, result })
      } catch (error) {
        if (active) {
          setNavigation(null)
          onErrorRef.current?.(error)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [
    source,
    table.table.id,
    target.rowId,
    queryKey,
    navigationKey,
    canNavigate,
  ])
  const neighbors =
    canNavigate &&
    navigation?.source === source &&
    navigation.key === navigationKey &&
    navigation.result.found
      ? navigation.result
      : null

  if (!inspectedRow) return null
  const retainingPreviousRow = String(inspectedRow._id) !== target.rowId

  const contentField = eidosFileContentField(table)
  const variant =
    presentation === "panel"
      ? "panel"
      : presentation === "page"
        ? "page"
        : contentField
          ? "page"
          : "panel"

  return (
    <EidosFileRecordInspector
      row={inspectedRow}
      fields={table.fields}
      variant={variant}
      contentField={contentField}
      onPresentationToggle={onPresentationToggle}
      disabled={disabled || retainingPreviousRow}
      loading={inspectorLoading || retainingPreviousRow}
      preserveContentWhileLoading={inspectorHasCompleteRow}
      loadError={inspectorLoadError}
      onRetryLoad={retryInspectorRow}
      onPreviousRecord={
        neighbors?.previousId
          ? () => onNavigateRef.current?.(neighbors.previousId!)
          : undefined
      }
      onNextRecord={
        neighbors?.nextId
          ? () => onNavigateRef.current?.(neighbors.nextId!)
          : undefined
      }
      onClose={() => {
        closeInspectorRow()
        onClose()
      }}
      onCellEdit={async (...args) => {
        const result = await editRecord(...args)
        setMutationRevision((revision) => revision + 1)
        return result
      }}
      onSearchRelation={(field, query) =>
        searchEidosFileRelationRecords(source, field, query)
      }
      onError={onError}
      onImportFiles={onImportFiles}
      onImportDroppedFiles={onImportDroppedFiles}
    />
  )
}
