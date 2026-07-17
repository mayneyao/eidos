import { useCallback, useMemo, type ComponentType, type ReactNode } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRowQuery,
  EidosFileSnapshot,
  EidosFileSqlPrimitive,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { Puzzle } from "lucide-react"

import { EidosFileDataGrid } from "./eidos-file-data-grid"
import { EidosFileGalleryView } from "./eidos-file-gallery-view"
import { EidosFileKanbanView } from "./eidos-file-kanban-view"
import { eidosFileRecordCardPageProjection } from "./eidos-file-record-card-layout"
import {
  eidosFileViewGroupFilter,
  eidosFileViewRowQuery,
} from "./eidos-file-view-query"
import type { EidosFileEditorDataSource } from "./data-source"

export interface EidosFileViewRendererProps {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  view?: EidosFileViewInfo
  query: EidosFileRowQuery
  search: string
  disabled: boolean
  reloadToken: number
  propertyField?: EidosFileFieldInfo | null
  onMutation?: (result: EidosFileRowMutationResult) => void
  onSnapshot?: (snapshot: EidosFileSnapshot) => void
  onFieldOpen?: (field: EidosFileFieldInfo) => void
  onFieldClose?: () => void
  onFieldAdd?: (position?: number) => void
  onError?: (error: unknown) => void
}

/** A host-registered React renderer for a persisted Eidos File view type. */
export type EidosFileViewRenderer = ComponentType<EidosFileViewRendererProps>

/** View type keys are persisted in `.eidos`; unknown keys remain round-trippable. */
export type EidosFileViewRendererRegistry = Readonly<
  Record<string, EidosFileViewRenderer>
>

export interface EidosFileEditorViewProps extends Omit<
  EidosFileViewRendererProps,
  "query" | "search" | "disabled" | "reloadToken"
> {
  search?: string
  disabled?: boolean
  reloadToken?: number
  /** Host renderers override built-ins by type without changing Eidos File metadata. */
  renderers?: EidosFileViewRendererRegistry
  /** Optional host-owned surface used when a saved renderer is unavailable. */
  renderUnsupportedView?: (props: EidosFileViewRendererProps) => ReactNode
}

function GridRenderer(props: EidosFileViewRendererProps) {
  return (
    <EidosFileDataGrid
      source={props.source}
      table={props.table}
      view={props.view}
      search={props.search}
      disabled={props.disabled}
      reloadToken={props.reloadToken}
      propertyField={props.propertyField}
      onMutation={props.onMutation}
      onSnapshot={props.onSnapshot}
      onFieldOpen={props.onFieldOpen}
      onFieldClose={props.onFieldClose}
      onFieldAdd={props.onFieldAdd}
      onError={props.onError}
    />
  )
}

function GalleryRenderer(props: EidosFileViewRendererProps) {
  const {
    source,
    table,
    view,
    query,
    disabled,
    reloadToken,
    onMutation,
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

  if (!view) return <GridRenderer {...props} />
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
      onError={onError}
    />
  )
}

function KanbanRenderer(props: EidosFileViewRendererProps) {
  const {
    source,
    table,
    view,
    query,
    disabled,
    reloadToken,
    onMutation,
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

  if (!view) return <GridRenderer {...props} />
  if (!source.getGroupCounts) {
    return (
      <EidosFileUnsupportedView
        name={view.name}
        type={view.type}
        detail="This host does not expose runtime group counts required by Kanban."
      />
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
      onError={onError}
    />
  )
}

export const builtInEidosFileViewRenderers: EidosFileViewRendererRegistry = {
  grid: GridRenderer,
  gallery: GalleryRenderer,
  kanban: KanbanRenderer,
}

export function EidosFileUnsupportedView({
  name,
  type,
  detail = "Install or register a renderer to use this saved view.",
}: {
  name: string
  type: string
  detail?: string
}) {
  return (
    <div
      className="flex h-full min-h-48 items-center justify-center p-6 text-center"
      role="status"
      data-eidos-file-unsupported-view={type}
    >
      <div className="max-w-sm">
        <span className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Puzzle className="h-4 w-4" />
        </span>
        <p className="text-sm font-medium">{name}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
        <code className="mt-3 inline-block rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          {type}
        </code>
      </div>
    </div>
  )
}

/**
 * Public Eidos File view router shared by Desktop, browser editors, and embedders.
 * It never interprets SQL or schema details; those stay in `@eidos.space/eidos-file`.
 */
export function EidosFileEditorView({
  source,
  table,
  view,
  search = "",
  disabled = false,
  reloadToken = 0,
  renderers,
  renderUnsupportedView,
  ...callbacks
}: EidosFileEditorViewProps) {
  const query = useMemo(
    () => eidosFileViewRowQuery(view, search),
    [search, view]
  )
  const props: EidosFileViewRendererProps = {
    source,
    table,
    view,
    query,
    search,
    disabled,
    reloadToken,
    ...callbacks,
  }
  const type = view?.type || "grid"
  const Renderer = renderers?.[type] ?? builtInEidosFileViewRenderers[type]
  if (Renderer) return <Renderer {...props} />
  if (renderUnsupportedView) return renderUnsupportedView(props)
  return (
    <EidosFileUnsupportedView name={view?.name ?? "Unknown view"} type={type} />
  )
}
