import { useMemo, type ComponentType, type ReactNode } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRowMutationResult,
  EidosFileRowQuery,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { Puzzle } from "lucide-react"

import { EidosFileDataGrid } from "./eidos-file-data-grid"
import { eidosFileViewRowQuery } from "./eidos-file-view-query"
import type { EidosFileEditorDataSource } from "./data-source"
import { createEidosFilePluginRegistry, type EidosFilePlugin } from "./plugin"

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
  /** Trusted, statically imported capabilities for this editor instance. */
  plugins?: readonly EidosFilePlugin[]
  /** Optional host-owned surface used when a saved renderer is unavailable. */
  renderUnsupportedView?: (props: EidosFileViewRendererProps) => ReactNode
}

export function EidosFileGridRenderer(props: EidosFileViewRendererProps) {
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

export const builtInEidosFileViewRenderers: EidosFileViewRendererRegistry = {
  grid: EidosFileGridRenderer,
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
  plugins = [],
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
  const pluginRegistry = useMemo(
    () => createEidosFilePluginRegistry(plugins),
    [plugins]
  )
  const Renderer =
    renderers?.[type] ??
    pluginRegistry.viewRenderers[type] ??
    builtInEidosFileViewRenderers[type]
  if (Renderer) return <Renderer {...props} />
  if (renderUnsupportedView) return renderUnsupportedView(props)
  return (
    <EidosFileUnsupportedView name={view?.name ?? "Unknown view"} type={type} />
  )
}
