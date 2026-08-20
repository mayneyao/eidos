import { useMemo, type ComponentType, type ReactNode } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRowRange,
  EidosFileRowQuery,
  EidosFileRowsDeleteResult,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
  FileEntry,
} from "@eidos.space/eidos-file"
import { Puzzle } from "lucide-react"

import { EidosFileDataGrid } from "./eidos-file-data-grid"
import { eidosFileViewRowQuery } from "./eidos-file-view-query"
import { useEidosFileSearchNavigation } from "./eidos-file-search-navigation"
import type { EidosFileEditorDataSource } from "./data-source"
import { createEidosFilePluginRegistry, type EidosFilePlugin } from "./plugin"
import type { EidosFileFormulaEditorAnchor } from "./eidos-file-derived-field-editor"

export interface EidosFileViewRendererProps {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  tables?: readonly EidosFileTableSnapshot[]
  view?: EidosFileViewInfo
  query: EidosFileRowQuery
  search: string
  searchResultIndex?: number | null
  onSearchResultCountChange?: (rowCount: number | null) => void
  disabled: boolean
  reloadToken: number
  commands: readonly EidosFileViewCommand[]
  selection: EidosFileViewSelection
  onSelectionChange?: (selection: EidosFileViewSelection) => void
  state: EidosFileViewState
  onStateChange?: (state: EidosFileViewState) => void
  capabilities: EidosFileViewCapabilities
  propertyField?: EidosFileFieldInfo | null
  onMutation?: (result: EidosFileRowMutationResult) => void
  onDeleteRow?: (row: EidosFileRow) => Promise<void>
  onDeleteRows?: (
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery
  ) => Promise<EidosFileRowsDeleteResult | void>
  onSnapshot?: (snapshot: EidosFileSnapshot) => void
  onFieldOpen?: (field: EidosFileFieldInfo) => void
  onFieldClose?: () => void
  onFieldAdd?: (position?: number) => void
  onEditFormula?: (
    field: EidosFileFieldInfo,
    previewRowId?: string,
    anchor?: EidosFileFormulaEditorAnchor
  ) => void
  onEditLookup?: (field: EidosFileFieldInfo) => void
  onError?: (error: unknown) => void
  onImportFiles?: () => Promise<FileEntry[]>
  onImportDroppedFiles?: (files: File[]) => Promise<FileEntry[]>
}

export interface EidosFileCommandContext {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  view?: EidosFileViewInfo
  selection: EidosFileViewSelection
}

export interface EidosFileViewCommand {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  run(context: EidosFileCommandContext): void | Promise<void>
}

export interface EidosFileViewSelection {
  rowIds: readonly string[]
  field?: string
}

export type EidosFileViewState = Readonly<Record<string, unknown>>

export interface EidosFileViewCapabilities {
  read: true
  mutate: boolean
  resolveAssets: boolean
  rawFile: false
  nativeFileSystem: false
}

/** A host-registered React renderer for a persisted Eidos File view type. */
export type EidosFileViewRenderer = ComponentType<EidosFileViewRendererProps>

/** View type keys are persisted in `.eidos`; unknown keys remain round-trippable. */
export type EidosFileViewRendererRegistry = Readonly<
  Record<string, EidosFileViewRenderer>
>

export interface EidosFileEditorViewProps extends Omit<
  EidosFileViewRendererProps,
  | "query"
  | "search"
  | "disabled"
  | "reloadToken"
  | "commands"
  | "selection"
  | "state"
  | "capabilities"
> {
  search?: string
  disabled?: boolean
  reloadToken?: number
  commands?: readonly EidosFileViewCommand[]
  selection?: EidosFileViewSelection
  onSelectionChange?: (selection: EidosFileViewSelection) => void
  state?: EidosFileViewState
  onStateChange?: (state: EidosFileViewState) => void
  capabilities?: EidosFileViewCapabilities
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
      tables={props.tables}
      view={props.view}
      search={props.search}
      searchResultIndex={props.searchResultIndex}
      disabled={props.disabled}
      reloadToken={props.reloadToken}
      propertyField={props.propertyField}
      onMutation={props.onMutation}
      onDeleteRows={props.onDeleteRows}
      onSnapshot={props.onSnapshot}
      onFieldOpen={props.onFieldOpen}
      onFieldClose={props.onFieldClose}
      onFieldAdd={props.onFieldAdd}
      onEditFormula={props.onEditFormula}
      onEditLookup={props.onEditLookup}
      onSearchResultCountChange={props.onSearchResultCountChange}
      onError={props.onError}
      onImportFiles={props.onImportFiles}
      onImportDroppedFiles={props.onImportDroppedFiles}
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
  searchResultIndex,
  onSearchResultCountChange,
  disabled = false,
  reloadToken = 0,
  commands = [],
  selection = { rowIds: [] },
  state = {},
  capabilities = {
    read: true,
    mutate: !disabled,
    resolveAssets: true,
    rawFile: false,
    nativeFileSystem: false,
  },
  renderers,
  plugins = [],
  renderUnsupportedView,
  ...callbacks
}: EidosFileEditorViewProps) {
  const searchNavigation = useEidosFileSearchNavigation()
  const resolvedSearchResultIndex =
    searchResultIndex === undefined
      ? (searchNavigation?.searchResultIndex ?? null)
      : searchResultIndex
  const reportSearchResultCount =
    onSearchResultCountChange ?? searchNavigation?.reportSearchResultCount
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
    searchResultIndex: resolvedSearchResultIndex,
    onSearchResultCountChange: reportSearchResultCount,
    disabled,
    reloadToken,
    commands,
    selection,
    state,
    capabilities,
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
