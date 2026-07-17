import { useCallback, useMemo, type ComponentType, type ReactNode } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowMutationResult,
  BaseRowQuery,
  BaseSnapshot,
  BaseSqlPrimitive,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import { Puzzle } from "lucide-react"

import { BaseDataGrid } from "./base-data-grid"
import { BaseGalleryView } from "./base-gallery-view"
import { BaseKanbanView } from "./base-kanban-view"
import { baseRecordCardPageProjection } from "./base-record-card-layout"
import { baseViewGroupFilter, baseViewRowQuery } from "./base-view-query"
import type { BaseEditorDataSource } from "./data-source"

export interface BaseViewRendererProps {
  source: BaseEditorDataSource
  table: BaseTableSnapshot
  view?: BaseViewInfo
  query: BaseRowQuery
  search: string
  disabled: boolean
  reloadToken: number
  propertyField?: BaseFieldInfo | null
  onMutation?: (result: BaseRowMutationResult) => void
  onSnapshot?: (snapshot: BaseSnapshot) => void
  onFieldOpen?: (field: BaseFieldInfo) => void
  onFieldClose?: () => void
  onFieldAdd?: (position?: number) => void
  onError?: (error: unknown) => void
}

/** A host-registered React renderer for a persisted Base view type. */
export type BaseViewRenderer = ComponentType<BaseViewRendererProps>

/** View type keys are persisted in `.base`; unknown keys remain round-trippable. */
export type BaseViewRendererRegistry = Readonly<
  Record<string, BaseViewRenderer>
>

export interface BaseEditorViewProps extends Omit<
  BaseViewRendererProps,
  "query" | "search" | "disabled" | "reloadToken"
> {
  search?: string
  disabled?: boolean
  reloadToken?: number
  /** Host renderers override built-ins by type without changing Base metadata. */
  renderers?: BaseViewRendererRegistry
  /** Optional host-owned surface used when a saved renderer is unavailable. */
  renderUnsupportedView?: (props: BaseViewRendererProps) => ReactNode
}

function GridRenderer(props: BaseViewRendererProps) {
  return (
    <BaseDataGrid
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

function GalleryRenderer(props: BaseViewRendererProps) {
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
    () => (view ? baseRecordCardPageProjection(table.fields, view) : undefined),
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
    async (row: BaseRow, field: BaseFieldInfo, value: BaseSqlPrimitive) => {
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
    <BaseGalleryView
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

function KanbanRenderer(props: BaseViewRendererProps) {
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
    () => (view ? baseRecordCardPageProjection(table.fields, view) : undefined),
    [table.fields, view]
  )
  const editCell = useCallback(
    async (row: BaseRow, field: BaseFieldInfo, value: BaseSqlPrimitive) => {
      const result = await source.updateRow(table.table.id, String(row._id), {
        [field.tableColumnName]: value,
      })
      onMutation?.(result)
      return result
    },
    [onMutation, source, table.table.id]
  )
  const addRow = useCallback(
    async (field: BaseFieldInfo, value: string | null, title: string) => {
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
      <BaseUnsupportedView
        name={view.name}
        type={view.type}
        detail="This host does not expose runtime group counts required by Kanban."
      />
    )
  }
  return (
    <BaseKanbanView
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
            filter: baseViewGroupFilter(
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

export const builtInBaseViewRenderers: BaseViewRendererRegistry = {
  grid: GridRenderer,
  gallery: GalleryRenderer,
  kanban: KanbanRenderer,
}

export function BaseUnsupportedView({
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
      data-base-unsupported-view={type}
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
 * Public Base view router shared by Desktop, browser editors, and embedders.
 * It never interprets SQL or schema details; those stay in `@eidos.space/base`.
 */
export function BaseEditorView({
  source,
  table,
  view,
  search = "",
  disabled = false,
  reloadToken = 0,
  renderers,
  renderUnsupportedView,
  ...callbacks
}: BaseEditorViewProps) {
  const query = useMemo(() => baseViewRowQuery(view, search), [search, view])
  const props: BaseViewRendererProps = {
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
  const Renderer = renderers?.[type] ?? builtInBaseViewRenderers[type]
  if (Renderer) return <Renderer {...props} />
  if (renderUnsupportedView) return renderUnsupportedView(props)
  return <BaseUnsupportedView name={view?.name ?? "Unknown view"} type={type} />
}
