import { useCallback, useMemo } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import { SquareKanban } from "lucide-react"

import type { EidosFileViewRendererProps } from "../eidos-file-editor-view"
import { EidosFileKanbanView } from "../eidos-file-kanban-view"
import { eidosFileRecordCardPageProjection } from "../eidos-file-record-card-layout"
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
        [field.tableColumnName]: value,
      })
      onMutation?.(result)
      return result
    },
    [onMutation, source, table.table.id]
  )
  const addRow = useCallback(
    async (field: EidosFileFieldInfo, value: string | null, title: string) => {
      const result = await source.insertRow(table.table.id, {
        title,
        [field.tableColumnName]: value,
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
      loadGroupCounts={(field) =>
        source.getGroupCounts!(table.table.id, field.tableColumnName, query)
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
              field.tableColumnName,
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
      onAddRow={addRow}
      onDeleteRow={onDeleteRow}
      onError={onError}
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
          const groupByField = fields.find(
            (field) => field.type === "select"
          )?.tableColumnName
          return {
            cardSize: "medium",
            hideEmptyFields: true,
            ...(groupByField ? { groupByField } : {}),
          }
        },
      },
    },
  ],
})
