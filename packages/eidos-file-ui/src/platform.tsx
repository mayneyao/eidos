import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react"
import type {
  EidosFileDataSource,
  EidosFileSession,
  EidosFileSessionState,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"

import { EidosFileUIProvider, type EidosFileUIHost } from "./context"
import {
  EidosFileEditorView,
  type EidosFileEditorViewProps,
  type EidosFileViewCapabilities,
  type EidosFileViewCommand,
  type EidosFileViewSelection,
  type EidosFileViewState,
} from "./eidos-file-editor-view"

export type EidosFileReactTrust = "trusted-react-view"

export interface EidosFileReactContextValue {
  session: EidosFileSession
  state: EidosFileSessionState
  source: EidosFileDataSource | null
  snapshot: EidosFileSnapshot | null
  trust: EidosFileReactTrust
}

const EidosFileReactContext = createContext<EidosFileReactContextValue | null>(
  null
)

export interface EidosFileProviderProps extends Partial<EidosFileUIHost> {
  session: EidosFileSession
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * Connects a host-owned session to React. Custom views are trusted application
 * code, but they receive only the public data source and view context.
 */
export function EidosFileProvider({
  session,
  children,
  className,
  style,
  themeName = "light",
  locale,
  weekStartsOnMonday,
  translate,
  assetSession,
  assetPresenter,
}: EidosFileProviderProps) {
  const state = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState
  )
  const value = useMemo<EidosFileReactContextValue>(
    () => ({
      session,
      state,
      source: state.source,
      snapshot: state.snapshot,
      trust: "trusted-react-view",
    }),
    [session, state]
  )
  const classes = ["eidos-file-root", className].filter(Boolean).join(" ")
  return (
    <EidosFileReactContext.Provider value={value}>
      <EidosFileUIProvider
        themeName={themeName}
        locale={locale}
        weekStartsOnMonday={weekStartsOnMonday}
        translate={translate}
        assetSession={assetSession}
        assetPresenter={assetPresenter}
      >
        <div
          className={classes}
          data-eidos-file-root=""
          data-theme={themeName}
          style={style}
        >
          {children}
        </div>
      </EidosFileUIProvider>
    </EidosFileReactContext.Provider>
  )
}

export function useEidosFile(): EidosFileReactContextValue {
  const value = useContext(EidosFileReactContext)
  if (!value) {
    throw new Error("useEidosFile must be used inside EidosFileProvider")
  }
  return value
}

export function useEidosFileSession(): EidosFileSession {
  return useEidosFile().session
}

export interface EidosFileViewHostProps extends Omit<
  EidosFileEditorViewProps,
  | "source"
  | "table"
  | "view"
  | "selection"
  | "onSelectionChange"
  | "state"
  | "onStateChange"
  | "capabilities"
  | "onSnapshot"
  | "onMutation"
> {
  tableId?: string
  viewId?: string
  commands?: readonly EidosFileViewCommand[]
  selection?: EidosFileViewSelection
  onSelectionChange?: (selection: EidosFileViewSelection) => void
  state?: EidosFileViewState
  onStateChange?: (state: EidosFileViewState) => void
  onSnapshot?: EidosFileEditorViewProps["onSnapshot"]
  onMutation?: EidosFileEditorViewProps["onMutation"]
  renderEmpty?: (state: EidosFileSessionState) => ReactNode
}

const EMPTY_SELECTION: EidosFileViewSelection = { rowIds: [] }

/** Renders the selected built-in or host-registered view from session state. */
export function EidosFileViewHost({
  tableId,
  viewId,
  commands = [],
  selection: controlledSelection,
  onSelectionChange,
  state: controlledViewState,
  onStateChange,
  onSnapshot,
  onMutation,
  renderEmpty,
  disabled = false,
  ...props
}: EidosFileViewHostProps) {
  const { session, source, snapshot, state: sessionState } = useEidosFile()
  const [selection, setSelection] =
    useState<EidosFileViewSelection>(EMPTY_SELECTION)
  const [viewState, setViewState] = useState<EidosFileViewState>({})
  const activeTable =
    snapshot?.tables.find((item) => item.table.id === tableId) ??
    snapshot?.tables.find(
      (item) => item.table.id === snapshot.metadata.defaultTableId
    ) ??
    snapshot?.tables[0]
  const activeView =
    activeTable?.views.find((item) => item.id === viewId) ??
    activeTable?.views.find((item) => item.type === "grid") ??
    activeTable?.views[0]

  const changeSelection = useCallback(
    (next: EidosFileViewSelection) => {
      if (controlledSelection === undefined) setSelection(next)
      onSelectionChange?.(next)
    },
    [controlledSelection, onSelectionChange]
  )
  const changeViewState = useCallback(
    (next: EidosFileViewState) => {
      if (controlledViewState === undefined) setViewState(next)
      onStateChange?.(next)
    },
    [controlledViewState, onStateChange]
  )
  const viewCapabilities = useMemo<EidosFileViewCapabilities>(
    () => ({
      read: true,
      mutate: !disabled,
      resolveAssets: true,
      rawFile: false,
      nativeFileSystem: false,
    }),
    [disabled]
  )

  if (!source || !snapshot || !activeTable) {
    return renderEmpty ? (
      renderEmpty(sessionState)
    ) : (
      <div className="eidos-file-empty" role="status">
        {sessionState.phase === "opening"
          ? "Opening Eidos File…"
          : "Open an Eidos File to begin."}
      </div>
    )
  }

  return (
    <EidosFileEditorView
      {...props}
      source={source}
      table={activeTable}
      tables={snapshot.tables}
      view={activeView}
      disabled={disabled}
      commands={commands}
      selection={controlledSelection ?? selection}
      onSelectionChange={changeSelection}
      state={controlledViewState ?? viewState}
      onStateChange={changeViewState}
      capabilities={viewCapabilities}
      onMutation={(result) => {
        session.markDirty()
        void session.refresh().then(() => session.markDirty())
        onMutation?.(result)
      }}
      onSnapshot={(next) => {
        session.markDirty(next)
        onSnapshot?.(next)
      }}
    />
  )
}
