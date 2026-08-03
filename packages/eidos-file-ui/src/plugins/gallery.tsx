import { useCallback, useMemo } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import { LayoutGrid } from "lucide-react"

import type { EidosFileViewRendererProps } from "../eidos-file-editor-view"
import { EidosFileRendererFieldPropertyPanel } from "../eidos-file-renderer-field-property-panel"
import {
  eidosFileFieldKey,
  isEidosFileRecordLabelField,
} from "../eidos-file-field-visibility"
import { EidosFileGalleryView } from "../eidos-file-gallery-view"
import { eidosFileRecordCardPageProjection } from "../eidos-file-record-card-layout"
import { searchEidosFileRelationRecords } from "../eidos-file-relation-search"
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

  if (!view) return null
  return (
    <EidosFileGalleryView
      table={table}
      view={view}
      disabled={disabled}
      reloadToken={reloadToken}
      searchResultIndex={props.searchResultIndex}
      loadPage={loadPage}
      loadRow={
        source.getRow
          ? (rowId) => source.getRow!(table.table.id, rowId)
          : undefined
      }
      onCellEdit={editCell}
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
        properties: (fields) => ({
          cardFields: fields
            .filter(
              (field) =>
                !isEidosFileRecordLabelField(field) &&
                field.valueKind !== "system"
            )
            .slice(0, 6)
            .map(eidosFileFieldKey),
          cardSize: "medium",
          coverFit: "cover",
          hideEmptyFields: true,
        }),
      },
    },
  ],
})
