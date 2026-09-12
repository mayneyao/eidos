import { useCallback, useEffect, useMemo } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileSqlPrimitive,
  EidosFileTableSnapshot,
  FileEntry,
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
    inspectorLoadError,
    openInspectorRow,
    closeInspectorRow,
    replaceInspectorRow,
    retryInspectorRow,
  } = useEidosFileRecordInspectorRow(loadRow)

  useEffect(() => {
    const labelField = table.fields.find(
      (field) => field.isRecordLabel === true
    )
    openInspectorRow({
      _id: target.rowId,
      ...(labelField ? { [labelField.tableColumnName]: target.title } : {}),
    })
  }, [openInspectorRow, table.fields, target.rowId, target.title])

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

  if (!inspectedRow) return null

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
      disabled={disabled}
      loading={inspectorLoading}
      loadError={inspectorLoadError}
      onRetryLoad={retryInspectorRow}
      onClose={() => {
        closeInspectorRow()
        onClose()
      }}
      onCellEdit={editRecord}
      onSearchRelation={(field, query) =>
        searchEidosFileRelationRecords(source, field, query)
      }
      onError={onError}
      onImportFiles={onImportFiles}
      onImportDroppedFiles={onImportDroppedFiles}
    />
  )
}
