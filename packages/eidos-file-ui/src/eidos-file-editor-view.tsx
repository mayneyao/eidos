import {
  useMemo,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react"
import type {
  CreateEidosFileFieldInput,
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
import type { EidosFileRecordFocus } from "./eidos-file-record-focus"
import { eidosFileViewRowQuery } from "./eidos-file-view-query"
import { useEidosFileSearchNavigation } from "./eidos-file-search-navigation"
import { useEidosFileUI } from "./context"
import {
  EidosFileCalendarViewProvider,
  useEidosFileCalendarExecution,
} from "./eidos-file-calendar-context"
import { EidosFileDateQueryUpgrade } from "./eidos-file-date-query-upgrade"
import { eidosFileMutationHistory } from "./eidos-file-mutation-history"
import { EidosFileUndoScope } from "./eidos-file-undo-scope"
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
  /** Host display policy for the Grid's leading row-number/selection gutter. */
  showRowMarkers?: boolean
  /** Host presentation policy; false ignores saved column freezing without modifying the view. */
  allowFrozenColumns?: boolean
  inspectedRowId?: string | null
  onInspectedRowChange?: (rowId: string | null) => void
  /** Host-owned navigation replaces the embedded record inspector. */
  onOpenRecord?: (rowId: string) => void
  recordFocus?: EidosFileRecordFocus
  /** Runtime presentation for a record opened from this view. */
  recordPresentation?: "panel" | "page"
  onRecordPresentationToggle?: () => void
  disabled: boolean
  reloadToken: number
  /** Monotonic Host request for the active view to reclaim keyboard focus. */
  focusRequestToken?: number
  commands: readonly EidosFileViewCommand[]
  selection: EidosFileViewSelection
  onSelectionChange?: (selection: EidosFileViewSelection) => void
  state: EidosFileViewState
  onStateChange?: (state: EidosFileViewState) => void
  capabilities: EidosFileViewCapabilities
  propertyField?: EidosFileFieldInfo | null
  onMutation?: (result: EidosFileRowMutationResult) => void
  onDeleteRow?: (row: EidosFileRow) => Promise<void>
  /** Delete exact stable identities through the Host's atomic record mutation path. */
  onDeleteRowIds?: (
    rowIds: readonly string[]
  ) => Promise<EidosFileRowsDeleteResult>
  onDeleteRows?: (
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery
  ) => Promise<EidosFileRowsDeleteResult | void>
  onSnapshot?: (snapshot: EidosFileSnapshot) => void
  onFieldOpen?: (field: EidosFileFieldInfo) => void
  onFieldClose?: () => void
  onFieldAdd?: (
    position?: number,
    allowedTypes?: readonly CreateEidosFileFieldInput["type"][]
  ) => void
  onEditFormula?: (
    field: EidosFileFieldInfo,
    previewRowId?: string,
    anchor?: EidosFileFormulaEditorAnchor
  ) => void
  onEditLookup?: (field: EidosFileFieldInfo) => void
  onError?: (error: unknown) => void
  onImportFiles?: (options?: { imagesOnly?: boolean }) => Promise<FileEntry[]>
  onImportDroppedFiles?: (
    files: File[],
    source?: "drop" | "paste"
  ) => Promise<FileEntry[]>
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
      recordFocus={props.recordFocus}
      showRowMarkers={props.showRowMarkers}
      allowFrozenColumns={props.allowFrozenColumns}
      inspectedRowId={props.inspectedRowId}
      onInspectedRowChange={props.onInspectedRowChange}
      onOpenRecord={props.onOpenRecord}
      recordPresentation={props.recordPresentation}
      onRecordPresentationToggle={props.onRecordPresentationToggle}
      disabled={props.disabled}
      reloadToken={props.reloadToken}
      focusRequestToken={props.focusRequestToken}
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

export function EidosFileUnsupportedQuery({ name }: { name: string }) {
  const { translate: t } = useEidosFileUI()
  return (
    <div
      className="flex h-full min-h-48 items-center justify-center p-6 text-center"
      role="status"
      data-eidos-file-unsupported-query
    >
      <div className="max-w-sm">
        <span className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Puzzle className="h-4 w-4" />
        </span>
        <p className="text-sm font-medium">{name}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t(
            "This view uses filter or sort rules from a newer Eidos version. Update Eidos to open it. Its saved configuration has been preserved."
          )}
        </p>
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
  focusRequestToken = 0,
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
  const history = useMemo(() => eidosFileMutationHistory(source), [source])
  const historyState = useSyncExternalStore(
    history.subscribe,
    history.getSnapshot,
    history.getSnapshot
  )
  const tableCapabilities = table.table.settings?.capabilities as
    | { delete?: boolean | "clear_meta" }
    | undefined
  const reversibleRecords =
    !disabled &&
    capabilities.mutate &&
    tableCapabilities?.delete !== false &&
    tableCapabilities?.delete !== "clear_meta" &&
    table.table.settings?.vtabModule !== "fs_meta"
  const deleteCallbacks = useMemo(
    () =>
      reversibleRecords
        ? {
            onDeleteRow:
              callbacks.onDeleteRow && callbacks.onDeleteRowIds
                ? async (row: EidosFileRow) => {
                    await history.delete(() =>
                      callbacks.onDeleteRowIds!([String(row._id)])
                    )
                  }
                : callbacks.onDeleteRow,
            onDeleteRowIds: callbacks.onDeleteRowIds
              ? (ids: readonly string[]) =>
                  history.delete(() => callbacks.onDeleteRowIds!(ids))
              : undefined,
            onDeleteRows: callbacks.onDeleteRows
              ? (ranges: EidosFileRowRange[], rowQuery: EidosFileRowQuery) =>
                  history.delete(() =>
                    callbacks.onDeleteRows!(ranges, rowQuery)
                  )
              : undefined,
          }
        : {},
    [
      history,
      reversibleRecords,
      callbacks.onDeleteRow,
      callbacks.onDeleteRowIds,
      callbacks.onDeleteRows,
    ]
  )
  const searchNavigation = useEidosFileSearchNavigation()
  const resolvedSearchResultIndex =
    searchResultIndex === undefined
      ? (searchNavigation?.searchResultIndex ?? null)
      : searchResultIndex
  const reportSearchResultCount =
    onSearchResultCountChange ?? searchNavigation?.reportSearchResultCount
  const calendar = useEidosFileCalendarExecution()
  const query = useMemo(
    () => ({
      ...eidosFileViewRowQuery(view, search),
      ...(calendar ? { calendar } : {}),
    }),
    [search, view, calendar]
  )
  const props: EidosFileViewRendererProps = {
    source: history.source,
    table,
    view,
    query,
    search,
    searchResultIndex: resolvedSearchResultIndex,
    onSearchResultCountChange: reportSearchResultCount,
    disabled,
    reloadToken: reloadToken + historyState.revision,
    focusRequestToken,
    commands,
    selection,
    state,
    capabilities,
    ...callbacks,
    ...deleteCallbacks,
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
  if (view?.queryStatus === "unsupported") {
    return (
      <EidosFileDateQueryUpgrade
        source={source}
        view={view}
        fields={table.fields}
        disabled={disabled || !capabilities.mutate}
        onSnapshot={callbacks.onSnapshot}
        fallback={<EidosFileUnsupportedQuery name={view.name} />}
      />
    )
  }
  if (Renderer)
    return (
      <EidosFileUndoScope
        history={history}
        disabled={disabled || !capabilities.mutate}
        onSnapshot={callbacks.onSnapshot}
        onError={callbacks.onError}
        focusKey={view?.id ?? "grid"}
        focusRequestToken={focusRequestToken}
        grid={type === "grid"}
      >
        <EidosFileCalendarViewProvider view={view}>
          <Renderer {...props} />
        </EidosFileCalendarViewProvider>
      </EidosFileUndoScope>
    )
  if (renderUnsupportedView) return renderUnsupportedView(props)
  return (
    <EidosFileUnsupportedView name={view?.name ?? "Unknown view"} type={type} />
  )
}
