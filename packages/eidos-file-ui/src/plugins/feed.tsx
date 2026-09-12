import { useCallback, useMemo } from "react"
import type { EidosFileRowQuery } from "@eidos.space/eidos-file"
import { Newspaper } from "lucide-react"

import type { EidosFileViewRendererProps } from "../eidos-file-editor-view"
import { eidosFileFieldKey } from "../eidos-file-field-visibility"
import {
  EidosFileFeedView,
  eidosFileFeedCreatedField,
  eidosFileFeedProjection,
} from "../eidos-file-feed-view"
import { EidosFileRendererFieldPropertyPanel } from "../eidos-file-renderer-field-property-panel"
import { defineEidosFilePlugin } from "../plugin"

function EidosFileFeedRenderer(props: EidosFileViewRendererProps) {
  const { source, table, view, query, disabled, reloadToken, onError } = props
  const projection = useMemo(
    () => (view ? eidosFileFeedProjection(table) : undefined),
    [table, view]
  )
  const createdField = useMemo(
    () => eidosFileFeedCreatedField(table.fields),
    [table.fields]
  )
  const feedQuery = useMemo<EidosFileRowQuery>(() => {
    if (!createdField || (query.sorts && query.sorts.length > 0)) return query
    return {
      ...query,
      sorts: [
        { field: eidosFileFieldKey(createdField), direction: "desc" as const },
      ],
    }
  }, [createdField, query])
  const loadPage = useCallback(
    (offset: number, limit: number, totalHint?: number, cursor?: string) =>
      source.getPage(
        table.table.id,
        offset,
        limit,
        feedQuery,
        totalHint,
        cursor,
        projection
      ),
    [feedQuery, projection, source, table.table.id]
  )

  if (!view) return null
  return (
    <EidosFileFeedView
      table={table}
      view={view}
      disabled={disabled}
      reloadToken={reloadToken}
      searchResultIndex={props.searchResultIndex}
      loadPage={loadPage}
      onOpenRecord={
        props.onInspectedRowChange
          ? (row) => props.onInspectedRowChange?.(String(row._id))
          : undefined
      }
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

export const eidosFileFeedPlugin = defineEidosFilePlugin({
  id: "@eidos.space/eidos-file-ui/feed",
  views: [
    {
      type: "feed",
      label: "Feed",
      description: "Reverse-chronological content stream",
      icon: Newspaper,
      renderer: EidosFileFeedRenderer,
      create: {
        defaultName: "Feed",
      },
    },
  ],
})
