import { useCallback, useMemo } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import { LayoutGrid } from "lucide-react"

import type { EidosFileViewRendererProps } from "../eidos-file-editor-view"
import { EidosFileGalleryView } from "../eidos-file-gallery-view"
import { eidosFileRecordCardPageProjection } from "../eidos-file-record-card-layout"
import { defineEidosFilePlugin } from "../plugin"

function EidosFileGalleryRenderer(props: EidosFileViewRendererProps) {
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
  const loadPage = useCallback(
    (offset: number, limit: number, totalHint?: number, cursor?: string) =>
      source.getPage(
        table.table.id,
        offset,
        limit,
        query,
        totalHint,
        cursor,
        projection
      ),
    [projection, query, source, table.table.id]
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

  if (!view) return null
  return (
    <EidosFileGalleryView
      table={table}
      view={view}
      disabled={disabled}
      reloadToken={reloadToken}
      loadPage={loadPage}
      loadRow={
        source.getRow
          ? (rowId) => source.getRow!(table.table.id, rowId)
          : undefined
      }
      onCellEdit={editCell}
      onDeleteRow={onDeleteRow}
      onError={onError}
    />
  )
}

export const eidosFileGalleryPlugin = defineEidosFilePlugin({
  id: "@eidos.space/eidos-file-ui/gallery",
  views: [
    {
      type: "gallery",
      label: "Gallery",
      description: "Responsive record cards",
      icon: LayoutGrid,
      renderer: EidosFileGalleryRenderer,
      create: {
        defaultName: "Gallery",
        properties: () => ({ cardSize: "medium", hideEmptyFields: true }),
      },
    },
  ],
})
