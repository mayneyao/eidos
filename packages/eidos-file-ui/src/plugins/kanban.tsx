import { useCallback, useMemo } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import { SquareKanban } from "lucide-react"

import type { EidosFileViewRendererProps } from "../eidos-file-editor-view"
import { EidosFileRendererFieldPropertyPanel } from "../eidos-file-renderer-field-property-panel"
import { EidosFileKanbanView } from "../eidos-file-kanban-view"
import {
  eidosFileFieldKey,
  isEidosFileRecordLabelField,
} from "../eidos-file-field-visibility"
import { eidosFileRecordCardPageProjection } from "../eidos-file-record-card-layout"
import { searchEidosFileRelationRecords } from "../eidos-file-relation-search"
import { eidosFileViewGroupFilter } from "../eidos-file-view-query"
import { defineEidosFilePlugin } from "../plugin"

function EidosFileKanbanRenderer(props: EidosFileViewRendererProps) {
  const {
    source,
    table,
    view,
    query,
    disabled,
    reloadToken,
    onMutation,
    onDeleteRow,
    onError,
  } = props
  const projection = useMemo(
    () =>
      view ? eidosFileRecordCardPageProjection(table.fields, view) : undefined,
    [table.fields, view]
  )
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
  const searchRelation = useCallback(
    (field: EidosFileFieldInfo, relationQuery: string) =>
      searchEidosFileRelationRecords(source, field, relationQuery),
    [source]
  )
  const addRow = useCallback(
    async (field: EidosFileFieldInfo, value: string | null, title: string) => {
      const labelField = table.fields.find(isEidosFileRecordLabelField)
      const result = await source.insertRow(table.table.id, {
        ...(labelField ? { [eidosFileFieldKey(labelField)]: title } : {}),
        [eidosFileFieldKey(field)]: value,
      })
      onMutation?.(result)
      return result
    },
    [onMutation, source, table.table.id]
  )

  if (!view) return null
  if (!source.getGroupCounts) {
    return (
      <div
        className="flex h-full min-h-48 items-center justify-center p-6 text-center text-xs text-muted-foreground"
        role="status"
      >
        This host does not expose runtime group counts required by Kanban.
      </div>
    )
  }
  return (
    <EidosFileKanbanView
      table={table}
      view={view}
      disabled={disabled}
      reloadToken={reloadToken}
      searchResultIndex={props.searchResultIndex}
      loadGroupCounts={(field) =>
        source.getGroupCounts!(table.table.id, eidosFileFieldKey(field), query)
      }
      loadGroupPage={(field, value, offset, limit, totalHint, cursor) =>
        source.getPage(
          table.table.id,
          offset,
          limit,
          {
            ...query,
            filter: eidosFileViewGroupFilter(
              query.filter,
              eidosFileFieldKey(field),
              value
            ),
          },
          totalHint,
          cursor,
          projection
        )
      }
      loadRow={
        source.getRow
          ? (rowId) => source.getRow!(table.table.id, rowId)
          : undefined
      }
      onCellEdit={editCell}
      onImportFiles={props.onImportFiles}
      onImportDroppedFiles={props.onImportDroppedFiles}
      onAddRow={addRow}
      onDeleteRow={onDeleteRow}
      onSearchRelation={searchRelation}
      onRowCountChange={props.onSearchResultCountChange}
      onError={onError}
      sidePanel={
        props.propertyField ? (
          <EidosFileRendererFieldPropertyPanel
            source={source}
            table={table}
            tables={props.tables}
            field={props.propertyField}
            disabled={disabled}
            onSnapshot={props.onSnapshot}
            onClose={props.onFieldClose}
            onEditFormula={props.onEditFormula}
            onEditLookup={props.onEditLookup}
            onError={onError}
          />
        ) : undefined
      }
    />
  )
}

export const eidosFileKanbanPlugin = defineEidosFilePlugin({
  id: "@eidos.space/eidos-file-ui/kanban",
  views: [
    {
      type: "kanban",
      label: "Kanban",
      description: "Cards grouped by a Select field",
      icon: SquareKanban,
      renderer: EidosFileKanbanRenderer,
      create: {
        defaultName: "Kanban",
        isAvailable: (fields) =>
          fields.some((field) => field.type === "select"),
        properties: (fields) => {
          const groupField = fields.find((field) => field.type === "select")
          return {
            cardFields: fields
              .filter(
                (field) =>
                  !isEidosFileRecordLabelField(field) &&
                  field.valueKind !== "system" &&
                  field !== groupField
              )
              .slice(0, 4)
              .map(eidosFileFieldKey),
            cardSize: "medium",
            coverFit: "cover",
            hideEmptyFields: true,
            ...(groupField
              ? { groupField: eidosFileFieldKey(groupField) }
              : {}),
          }
        },
      },
    },
  ],
})
