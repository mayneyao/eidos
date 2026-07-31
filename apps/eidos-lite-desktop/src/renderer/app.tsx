import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Cloud,
  CloudDownload,
  Copy,
  Database,
  FilePlus2,
  FolderInput,
  FolderOpen,
  FolderPlus,
  HardDrive,
  History,
  LoaderCircle,
  PanelLeft,
  Pencil,
  RefreshCw,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react"

import type {
  EidosFileIssue,
  EidosLiteAppearance,
  EidosLiteAppInfo,
  EidosSyncQueueStatus,
  RecentSpaceEntry,
  SpacePathMutationResult,
  SpaceSnapshot,
  SpaceTreeEntry,
  TextFilePreviewResult,
} from "../shared/contracts"
import {
  applyAppearance,
  DEFAULT_RENDERER_PREFERENCES,
  resolveAppearance,
  type ResolvedAppearance,
} from "./app-appearance"
import { FileRecoveryNotice } from "./file-recovery-notice"
import { IpcEidosFileDataSource } from "./ipc-data-source"
import {
  canNavigateHistory,
  initializeNavigationHistory,
  navigationOffsetForKeyboardShortcut,
  navigationOffsetForPointerButton,
  pathMatchesPrefix,
  pushNavigationLocation,
  readNavigationHistory,
  replaceNavigationLocation,
  type NavigationLocation,
  type NavigationSnapshot,
} from "./navigation-history"
import { TextFilePreview } from "./text-file-preview"
import { SettingsPage } from "./settings-page"
import type { VersionInspection } from "./version-change-tree"
import {
  WORKSPACE_SHORTCUT_ARIA,
  workspaceShortcutForKeyboardEvent,
  workspaceShortcutLabel,
} from "./workspace-shortcuts"

const EidosFileWorkbench = lazy(async () => {
  const module = await import("./eidos-file-workbench")
  return { default: module.EidosFileWorkbench }
})
const SpaceFileTree = lazy(async () => {
  const module = await import("./space-file-tree")
  return { default: module.SpaceFileTree }
})
const SyncPanel = lazy(async () => {
  const module = await import("./sync-panel")
  return { default: module.SyncPanel }
})
const VersionPanel = lazy(async () => {
  const module = await import("./version-panel")
  return { default: module.VersionPanel }
})
const VersionDiffPreview = lazy(async () => {
  const module = await import("./version-panel")
  return { default: module.VersionDiffPreview }
})

interface CachedFile {
  sessionId: string
  relativePath: string
  snapshot: EidosFileSnapshot
  source: IpcEidosFileDataSource
  tableId: string
}

function useAppTheme(): ResolvedAppearance {
  const media = useMemo(
    () => window.matchMedia("(prefers-color-scheme: dark)"),
    []
  )
  const [systemDark, setSystemDark] = useState(media.matches)
  const [appearance, setAppearance] = useState<EidosLiteAppearance>(
    DEFAULT_RENDERER_PREFERENCES.appearance
  )
  useEffect(() => {
    const update = () => setSystemDark(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [media])
  useEffect(() => {
    void window.eidosLite
      .getPreferences()
      .then((preferences) => setAppearance(preferences.appearance))
    return window.eidosLite.onPreferencesChanged((preferences) =>
      setAppearance(preferences.appearance)
    )
  }, [])
  const theme = resolveAppearance(appearance, systemDark)
  useEffect(() => {
    applyAppearance(document.documentElement, appearance, systemDark)
  }, [appearance, systemDark])
  return theme
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface TitlebarNavigationProps {
  collapsed: boolean
  canGoBack: boolean
  canGoForward: boolean
  toggleShortcutLabel: string
  onToggle(): void
  onBack(): void
  onForward(): void
}

function TitlebarNavigation({
  collapsed,
  canGoBack,
  canGoForward,
  toggleShortcutLabel,
  onToggle,
  onBack,
  onForward,
}: TitlebarNavigationProps) {
  const label = collapsed ? "Show Space Explorer" : "Collapse Space Explorer"

  return (
    <nav
      className="titlebar-navigation"
      aria-label="Document navigation"
      data-titlebar-navigation
    >
      <button
        type="button"
        className="icon-button sidebar-toggle-button"
        data-sidebar-toggle={collapsed ? "open" : "close"}
        onClick={onToggle}
        aria-label={label}
        aria-keyshortcuts={WORKSPACE_SHORTCUT_ARIA["toggle-sidebar"]}
        title={`${label} (${toggleShortcutLabel})`}
      >
        <PanelLeft />
      </button>
      <button
        type="button"
        className="icon-button"
        data-navigation-action="back"
        onClick={onBack}
        aria-label="Go back"
        title="Go back (⌘[ or Alt+Left)"
        disabled={!canGoBack}
      >
        <ArrowLeft />
      </button>
      <button
        type="button"
        className="icon-button"
        data-navigation-action="forward"
        onClick={onForward}
        aria-label="Go forward"
        title="Go forward (⌘] or Alt+Right)"
        disabled={!canGoForward}
      >
        <ArrowRight />
      </button>
    </nav>
  )
}

const DEFAULT_SIDEBAR_WIDTH = 280
const MIN_SIDEBAR_WIDTH = 208
const MAX_SIDEBAR_WIDTH = 480
const SIDEBAR_WIDTH_STORAGE_KEY = "eidos-lite:space-sidebar-width"
const MAX_CACHED_FILES = 3

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
}

function storedSidebarWidth(): number {
  const stored = Number.parseInt(
    window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ?? "",
    10
  )
  return Number.isFinite(stored)
    ? clampSidebarWidth(stored)
    : DEFAULT_SIDEBAR_WIDTH
}

function fileName(relativePath: string): string {
  return relativePath.split("/").at(-1) ?? relativePath
}

function syncQueueLabel(status: EidosSyncQueueStatus | null): string {
  if (!status || status.state === "idle") return "Eidos Sync"
  if (status.state === "running") return "Syncing…"
  if (status.state === "pending") return "Sync queued"
  if (status.state === "retry-wait") return "Sync retry pending"
  return "Sync paused"
}

function shortcutTitle(label: string, shortcut: string): string {
  return `${label} (${shortcut})`
}

type PathDialogAction =
  | "create-eidos"
  | "create-folder"
  | "rename"
  | "move"
  | "copy"
  | "delete"

interface PathDialogState {
  action: PathDialogAction
  entry: SpaceTreeEntry | null
}

function parentPath(entry: SpaceTreeEntry | null): string | null {
  if (!entry) return null
  if (entry.kind === "directory") return entry.relativePath
  const parent = entry.relativePath.split("/").slice(0, -1).join("/")
  return parent || null
}

function findSpaceEntry(
  entries: readonly SpaceTreeEntry[],
  relativePath: string
): SpaceTreeEntry | null {
  for (const entry of entries) {
    if (entry.relativePath === relativePath) return entry
    const nested = entry.children
      ? findSpaceEntry(entry.children, relativePath)
      : null
    if (nested) return nested
  }
  return null
}

function hasUnloadedDirectories(entries: readonly SpaceTreeEntry[]): boolean {
  return entries.some(
    (entry) =>
      entry.kind === "directory" &&
      (entry.childrenLoaded === false ||
        hasUnloadedDirectories(entry.children ?? []))
  )
}

function PathActionDialog({
  state,
  busy,
  onCancel,
  onSubmit,
}: {
  state: PathDialogState
  busy: boolean
  onCancel(): void
  onSubmit(value: string): void
}) {
  const config = {
    "create-eidos": {
      title: "New Eidos File",
      label: "File name",
      initial: "Untitled.eidos",
      action: "Create",
    },
    "create-folder": {
      title: "New folder",
      label: "Folder name",
      initial: "New folder",
      action: "Create",
    },
    rename: {
      title: `Rename ${state.entry?.name ?? "item"}`,
      label: "New name",
      initial: state.entry?.name ?? "",
      action: "Rename",
    },
    move: {
      title: `Move ${state.entry?.name ?? "item"}`,
      label: "Destination folder (blank for Space root)",
      initial: "",
      action: "Move",
    },
    copy: {
      title: `Copy ${state.entry?.name ?? "item"}`,
      label: "Destination folder (blank for Space root)",
      initial: "",
      action: "Copy",
    },
    delete: {
      title: `Move ${state.entry?.name ?? "item"} to Trash?`,
      label: "",
      initial: "",
      action: "Move to Trash",
    },
  }[state.action]
  const [value, setValue] = useState(config.initial)
  const destructive = state.action === "delete"

  return (
    <div className="path-dialog-backdrop" role="presentation">
      <form
        className="path-dialog"
        aria-label={config.title}
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(value)
        }}
      >
        <header>
          <strong>{config.title}</strong>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label="Cancel"
            disabled={busy}
          >
            <X />
          </button>
        </header>
        {destructive ? (
          <p>
            The item will leave this Space and can be recovered from the system
            Trash.
          </p>
        ) : (
          <label>
            <span>{config.label}</span>
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={busy}
            />
          </label>
        )}
        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className={destructive ? "danger-action" : "primary-action"}
            disabled={busy || (!destructive && !value.trim())}
          >
            {busy ? <LoaderCircle className="spin" /> : null}
            {busy ? "Working…" : config.action}
          </button>
        </footer>
      </form>
    </div>
  )
}

function Welcome({
  appInfo,
  opening,
  error,
  recents,
  onNew,
  onOpen,
  onOpenRecent,
  onRemoveRecent,
  onClone,
  onOpenSettings,
  onCopyDiagnostics,
  diagnosticsCopied,
}: {
  appInfo: EidosLiteAppInfo | null
  opening: boolean
  error: string | null
  recents: RecentSpaceEntry[]
  onNew(): void
  onOpen(): void
  onOpenRecent(id: string): void
  onRemoveRecent(id: string): void
  onClone(): void
  onOpenSettings(): void
  onCopyDiagnostics(): void
  diagnosticsCopied: boolean
}) {
  return (
    <main
      className="welcome-shell"
      data-platform={
        navigator.userAgent.includes("Macintosh") ? "darwin" : "other"
      }
      data-welcome-ready={appInfo ? "true" : "false"}
    >
      <header className="welcome-titlebar">
        <strong>Eidos Lite</strong>
        <button
          type="button"
          className="icon-button welcome-settings-button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings (⌘,)"
        >
          <Settings />
        </button>
      </header>
      <section className="welcome-copy" aria-labelledby="welcome-title">
        <p className="eyebrow">Local-first workspace</p>
        <h1 id="welcome-title">Choose a Space</h1>
        <p className="welcome-detail">
          Open an ordinary folder and work across its Eidos Files. Local work
          never requires an account.
        </p>
        <div className="welcome-actions">
          <button
            type="button"
            className="primary-action"
            onClick={onNew}
            disabled={opening}
          >
            {opening ? <LoaderCircle className="spin" /> : <FolderPlus />}
            {opening ? "Opening Space…" : "New Space"}
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={onOpen}
            disabled={opening}
          >
            <FolderOpen /> Open Space
          </button>
          <button type="button" className="secondary-action" onClick={onClone}>
            <CloudDownload /> Open Synced Space
          </button>
          <button
            type="button"
            className="secondary-action welcome-diagnostics"
            data-copy-diagnostics
            onClick={onCopyDiagnostics}
          >
            <Copy />{" "}
            {diagnosticsCopied ? "Diagnostics copied" : "Copy diagnostics"}
          </button>
        </div>
        {error ? (
          <p className="welcome-error" role="alert">
            <CircleAlert />
            {error}
          </p>
        ) : null}
      </section>
      <aside className="welcome-principles" aria-label="Recent Spaces">
        <header>
          <span>Recent Spaces</span>
          <small>{recents.length ? "Local folders" : "No recent Spaces"}</small>
        </header>
        <div className="recent-spaces">
          {recents.map((recent) => (
            <div className="recent-space" key={recent.id}>
              <button
                type="button"
                className="recent-space-open"
                disabled={opening || !recent.available}
                onClick={() => onOpenRecent(recent.id)}
                title={recent.path}
              >
                <HardDrive />
                <span>
                  <strong>{recent.name}</strong>
                  <small>
                    {recent.available ? recent.path : "Folder unavailable"}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="recent-space-remove"
                onClick={() => onRemoveRecent(recent.id)}
                aria-label={`Remove ${recent.name} from recent Spaces`}
                title="Remove from recents"
              >
                <X />
              </button>
            </div>
          ))}
        </div>
        <p className="recent-spaces-note">
          Spaces remain ordinary folders. Removing one here never deletes its
          files.
        </p>
      </aside>
    </main>
  )
}

function WorkspaceApp({ theme }: { theme: ResolvedAppearance }) {
  const macos = navigator.userAgent.includes("Macintosh")
  const sidebarShortcutLabel = workspaceShortcutLabel("toggle-sidebar", macos)
  const versionShortcutLabel = workspaceShortcutLabel("toggle-version", macos)
  const syncShortcutLabel = workspaceShortcutLabel("toggle-sync", macos)
  const [appInfo, setAppInfo] = useState<EidosLiteAppInfo | null>(null)
  const [space, setSpace] = useState<SpaceSnapshot | null>(null)
  const [cachedFiles, setCachedFiles] = useState<CachedFile[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [textPreview, setTextPreview] = useState<TextFilePreviewResult | null>(
    null
  )
  const [openingSpace, setOpeningSpace] = useState(false)
  const [recentSpaces, setRecentSpaces] = useState<RecentSpaceEntry[]>([])
  const [busyFile, setBusyFile] = useState<string | null>(null)
  const [versionPanelOpen, setVersionPanelOpen] = useState(false)
  const [versionInspection, setVersionInspection] =
    useState<VersionInspection | null>(null)
  const [syncPanelMode, setSyncPanelMode] = useState<"enable" | "clone" | null>(
    null
  )
  const [syncQueueStatus, setSyncQueueStatus] =
    useState<EidosSyncQueueStatus | null>(null)
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)
  const [fileMaterializationKey, setFileMaterializationKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fileIssue, setFileIssue] = useState<EidosFileIssue | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(storedSidebarWidth)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [navigationSnapshot, setNavigationSnapshot] =
    useState<NavigationSnapshot | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<SpaceTreeEntry | null>(
    null
  )
  const [contextMenu, setContextMenu] = useState<{
    entry: SpaceTreeEntry
    x: number
    y: number
  } | null>(null)
  const [pathDialog, setPathDialog] = useState<PathDialogState | null>(null)
  const [pathMutationBusy, setPathMutationBusy] = useState(false)
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false)
  const fileOpenInFlight = useRef(false)
  const navigationSnapshotRef = useRef<NavigationSnapshot | null>(null)

  const recordNavigationLocation = useCallback(
    (relativePath: string | null) => {
      const current = navigationSnapshotRef.current
      if (!current || !space) return
      const next = pushNavigationLocation(current, space.id, relativePath)
      navigationSnapshotRef.current = next
      setNavigationSnapshot(next)
    },
    [space]
  )

  const invalidateCachedSessions = useCallback((sessionIds: string[]) => {
    if (sessionIds.length === 0) return
    const invalidated = new Set(sessionIds)
    setCachedFiles((current) =>
      current.filter((file) => !invalidated.has(file.sessionId))
    )
    setActiveSession((current) =>
      current && invalidated.has(current) ? null : current
    )
  }, [])

  const acceptSpaceSnapshot = useCallback(
    (snapshot: SpaceSnapshot) => {
      setSpace(snapshot)
      const activeIssue = snapshot.fileIssues?.find(
        (issue) => issue.sessionId === activeSession
      )
      if (activeIssue) setFileIssue(activeIssue)
      invalidateCachedSessions(snapshot.invalidatedSessionIds)
    },
    [activeSession, invalidateCachedSessions]
  )

  const refreshMaterializedFiles = useCallback(
    async (snapshot: SpaceSnapshot) => {
      const invalidated = new Set(snapshot.invalidatedSessionIds)
      const results = await Promise.allSettled(
        cachedFiles
          .filter((file) => !invalidated.has(file.sessionId))
          .map(async (file) => ({
            sessionId: file.sessionId,
            source: file.source,
            snapshot: await file.source.getSnapshot(),
          }))
      )
      const refreshed = new Map(
        results.flatMap((result) =>
          result.status === "fulfilled"
            ? [[result.value.sessionId, result.value] as const]
            : []
        )
      )
      setCachedFiles((current) =>
        current.flatMap((file) => {
          if (invalidated.has(file.sessionId)) return []
          const next = refreshed.get(file.sessionId)
          if (!next || next.source !== file.source) return [file]
          return [
            {
              ...file,
              snapshot: next.snapshot,
              tableId: next.snapshot.tables.some(
                (table) => table.table.id === file.tableId
              )
                ? file.tableId
                : (next.snapshot.tables[0]?.table.id ?? file.tableId),
            },
          ]
        })
      )
      setFileMaterializationKey((current) => current + 1)
      const failure = results.find((result) => result.status === "rejected")
      if (failure?.status === "rejected") {
        setError(
          `Space restored, but an open Eidos File could not refresh. ${errorMessage(failure.reason)}`
        )
      }
    },
    [cachedFiles]
  )

  useEffect(() => {
    void window.eidosLite
      .getAppInfo()
      .then(setAppInfo, (cause) => setError(errorMessage(cause)))
    void window.eidosLite.getSpace().then(
      (snapshot) => {
        if (snapshot) acceptSpaceSnapshot(snapshot)
      },
      (cause) => setError(errorMessage(cause))
    )
    void window.eidosLite
      .listRecentSpaces()
      .then(setRecentSpaces, (cause) => setError(errorMessage(cause)))
    return window.eidosLite.onSpaceChanged(acceptSpaceSnapshot)
  }, [acceptSpaceSnapshot])

  useEffect(() => {
    if (!space) {
      setSyncQueueStatus(null)
      return
    }
    let active = true
    void window.eidosLite.getSyncQueueStatus().then(
      (status) => {
        if (active) setSyncQueueStatus(status)
      },
      (cause) => {
        if (active) setError(errorMessage(cause))
      }
    )
    const unsubscribe = window.eidosLite.onSyncQueueChanged((status) => {
      if (active && status.spaceId === space.id) setSyncQueueStatus(status)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [space?.id])

  useEffect(() => {
    setActiveSession(null)
    setTextPreview(null)
  }, [space?.id])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [contextMenu])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  const activeFile =
    cachedFiles.find((file) => file.sessionId === activeSession) ?? null
  const spaceTreeIncomplete = space
    ? hasUnloadedDirectories(space.entries)
    : false
  const activeDocumentPath =
    activeFile?.relativePath ?? textPreview?.relativePath ?? null

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (sidebarCollapsed || event.button !== 0) return
      event.preventDefault()
      const startX = event.clientX
      const startWidth = sidebarWidth
      document.documentElement.classList.add("resizing-space-sidebar")

      const move = (pointerEvent: PointerEvent) => {
        setSidebarWidth(
          clampSidebarWidth(startWidth + pointerEvent.clientX - startX)
        )
      }
      const stop = () => {
        document.documentElement.classList.remove("resizing-space-sidebar")
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", stop)
        window.removeEventListener("pointercancel", stop)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", stop)
      window.addEventListener("pointercancel", stop)
    },
    [sidebarCollapsed, sidebarWidth]
  )

  const adjustSidebarWidth = useCallback((delta: number) => {
    setSidebarWidth((current) => clampSidebarWidth(current + delta))
  }, [])

  const copyDiagnostics = useCallback(async () => {
    try {
      await window.eidosLite.copyDiagnostics()
      setDiagnosticsCopied(true)
      window.setTimeout(() => setDiagnosticsCopied(false), 2_000)
    } catch (cause) {
      setError(`Could not copy diagnostics. ${errorMessage(cause)}`)
    }
  }, [])

  const bindSpace = useCallback(
    async (open: () => Promise<SpaceSnapshot | null>) => {
      setOpeningSpace(true)
      setError(null)
      try {
        const opened = await open()
        if (opened) acceptSpaceSnapshot(opened)
        setRecentSpaces(await window.eidosLite.listRecentSpaces())
      } catch (cause) {
        setError(errorMessage(cause))
      } finally {
        setOpeningSpace(false)
      }
    },
    [acceptSpaceSnapshot]
  )

  const openSpace = useCallback(
    () => bindSpace(() => window.eidosLite.openSpace()),
    [bindSpace]
  )

  const newSpace = useCallback(
    () => bindSpace(() => window.eidosLite.newSpace()),
    [bindSpace]
  )

  const openRecentSpace = useCallback(
    (id: string) => bindSpace(() => window.eidosLite.openRecentSpace(id)),
    [bindSpace]
  )

  const removeRecentSpace = useCallback(async (id: string) => {
    try {
      setRecentSpaces(await window.eidosLite.removeRecentSpace(id))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [])

  const openEntry = useCallback(
    async (
      entry: SpaceTreeEntry,
      options: { recordHistory?: boolean } = {}
    ): Promise<boolean> => {
      if (entry.kind === "directory") return false
      setVersionInspection(null)
      if (entry.kind !== "eidos") {
        if (fileOpenInFlight.current) return false
        fileOpenInFlight.current = true
        setBusyFile(entry.relativePath)
        setError(null)
        setFileIssue(null)
        setActiveSession(null)
        setTextPreview(null)
        try {
          const preview = await window.eidosLite.previewTextFile(
            entry.relativePath
          )
          setTextPreview(preview)
          if (options.recordHistory !== false) {
            recordNavigationLocation(entry.relativePath)
          }
          return true
        } catch (cause) {
          setError(`Could not preview ${entry.name}. ${errorMessage(cause)}`)
          return false
        } finally {
          fileOpenInFlight.current = false
          setBusyFile(null)
        }
      }
      if (fileOpenInFlight.current) return false
      fileOpenInFlight.current = true
      setBusyFile(entry.relativePath)
      setError(null)
      setFileIssue(null)
      setTextPreview(null)
      try {
        let availableCachedFiles = cachedFiles
        const alreadyCached = cachedFiles.some(
          (file) => file.relativePath === entry.relativePath
        )
        if (!alreadyCached && cachedFiles.length >= MAX_CACHED_FILES) {
          const stale = cachedFiles[0]
          if (stale) {
            await window.eidosLite.closeEidosFile(stale.sessionId)
            availableCachedFiles = cachedFiles.slice(1)
            setCachedFiles(availableCachedFiles)
            setActiveSession((current) =>
              current === stale.sessionId ? null : current
            )
          }
        }
        const opened = await window.eidosLite.openEidosFile(entry.relativePath)
        const tableId = opened.snapshot.tables[0]?.table.id
        if (!tableId) throw new Error("This Eidos File has no tables")
        const existing = availableCachedFiles.find(
          (file) => file.sessionId === opened.sessionId
        )
        if (existing) {
          setCachedFiles((current) => {
            const next = current.find(
              (file) => file.sessionId === opened.sessionId
            )
            if (!next) return current
            return [
              ...current.filter((file) => file.sessionId !== opened.sessionId),
              {
                ...next,
                snapshot: opened.snapshot,
                tableId: opened.snapshot.tables.some(
                  (table) => table.table.id === next.tableId
                )
                  ? next.tableId
                  : tableId,
              },
            ]
          })
          setActiveSession(opened.sessionId)
          if (options.recordHistory !== false) {
            recordNavigationLocation(entry.relativePath)
          }
          return true
        }
        const source = new IpcEidosFileDataSource(
          opened.sessionId,
          opened.snapshot,
          (snapshot) =>
            setCachedFiles((current) =>
              current.map((file) => {
                if (file.sessionId !== opened.sessionId) return file
                const tableId = snapshot.tables.some(
                  (table) => table.table.id === file.tableId
                )
                  ? file.tableId
                  : (snapshot.tables[0]?.table.id ?? file.tableId)
                return { ...file, snapshot, tableId }
              })
            )
        )
        const file: CachedFile = {
          sessionId: opened.sessionId,
          relativePath: opened.relativePath,
          snapshot: opened.snapshot,
          source,
          tableId,
        }
        setCachedFiles((current) =>
          [
            ...current.filter(
              (cached) =>
                cached.sessionId !== file.sessionId &&
                cached.relativePath !== file.relativePath
            ),
            file,
          ].slice(-MAX_CACHED_FILES)
        )
        setActiveSession(opened.sessionId)
        if (options.recordHistory !== false) {
          recordNavigationLocation(entry.relativePath)
        }
        return true
      } catch (cause) {
        const issue = await window.eidosLite
          .inspectEidosFileIssue(entry.relativePath)
          .catch(() => null)
        if (issue) setFileIssue(issue)
        else setError(`Could not open ${entry.name}. ${errorMessage(cause)}`)
        return false
      } finally {
        fileOpenInFlight.current = false
        setBusyFile(null)
      }
    },
    [cachedFiles, recordNavigationLocation]
  )

  const launchSpace = useRef(space)
  const launchOpenEntry = useRef(openEntry)
  const launchAcceptSpaceSnapshot = useRef(acceptSpaceSnapshot)
  useEffect(() => {
    launchSpace.current = space
    launchOpenEntry.current = openEntry
    launchAcceptSpaceSnapshot.current = acceptSpaceSnapshot
  }, [acceptSpaceSnapshot, openEntry, space])

  useEffect(() => {
    if (!space) return
    let active = true
    let draining = false
    let drainRequested = true
    const drain = async () => {
      drainRequested = true
      if (draining || !active) return
      draining = true
      try {
        while (active && drainRequested) {
          drainRequested = false
          let relativePath = await window.eidosLite.takeLaunchEidosFile()
          while (relativePath && active) {
            const entry = findSpaceEntry(
              launchSpace.current?.entries ?? [],
              relativePath
            )
            if (!entry || entry.kind !== "eidos") {
              setError(
                `Could not open ${relativePath}. It is not an Eidos File in this Space.`
              )
            } else {
              while (active && fileOpenInFlight.current) {
                await new Promise((resolve) => window.setTimeout(resolve, 25))
              }
              if (!active) break
              setSelectedEntry(entry)
              await launchOpenEntry.current(entry)
            }
            relativePath = await window.eidosLite.takeLaunchEidosFile()
          }
        }
      } catch (cause) {
        if (active) setError(errorMessage(cause))
      } finally {
        draining = false
      }
    }
    const unsubscribe = window.eidosLite.onLaunchEidosFileAvailable(() => {
      void drain()
    })
    void drain()
    return () => {
      active = false
      unsubscribe()
    }
  }, [space?.id])

  const pendingNavigationLocation = useRef<NavigationLocation | undefined>(
    undefined
  )
  const applyingNavigationLocation = useRef(false)
  const applyNavigationLocation = useCallback(
    (location: NavigationLocation) => {
      pendingNavigationLocation.current = location
      if (applyingNavigationLocation.current) return
      applyingNavigationLocation.current = true

      const drain = async () => {
        try {
          while (pendingNavigationLocation.current !== undefined) {
            const target = pendingNavigationLocation.current
            pendingNavigationLocation.current = undefined
            while (fileOpenInFlight.current) {
              await new Promise((resolve) => window.setTimeout(resolve, 25))
            }

            let currentSpace = launchSpace.current
            if (!currentSpace) continue
            if (target === null) {
              setVersionInspection(null)
              setFileIssue(null)
              setActiveSession(null)
              setTextPreview(null)
              setSelectedEntry(null)
              continue
            }

            let directoryPath = ""
            for (const segment of target.split("/").slice(0, -1)) {
              directoryPath = directoryPath
                ? `${directoryPath}/${segment}`
                : segment
              const directory = findSpaceEntry(
                currentSpace.entries,
                directoryPath
              )
              if (directory?.kind !== "directory") break
              if (directory.childrenLoaded) continue
              currentSpace = await window.eidosLite.loadSpaceDirectory(
                directory.relativePath
              )
              launchSpace.current = currentSpace
              launchAcceptSpaceSnapshot.current(currentSpace)
            }

            const entry = findSpaceEntry(currentSpace.entries, target)
            if (!entry || entry.kind === "directory") {
              setError(`${target} is no longer available in this Space.`)
              const current = navigationSnapshotRef.current
              if (current) {
                const next = replaceNavigationLocation(
                  current,
                  currentSpace.id,
                  null
                )
                navigationSnapshotRef.current = next
                setNavigationSnapshot(next)
              }
              setVersionInspection(null)
              setFileIssue(null)
              setActiveSession(null)
              setTextPreview(null)
              setSelectedEntry(null)
              continue
            }

            setSelectedEntry(entry)
            await launchOpenEntry.current(entry, { recordHistory: false })
          }
        } catch (cause) {
          setError(`Could not follow browser history. ${errorMessage(cause)}`)
        } finally {
          applyingNavigationLocation.current = false
        }
      }
      void drain()
    },
    []
  )

  useEffect(() => {
    if (!space) {
      navigationSnapshotRef.current = null
      setNavigationSnapshot(null)
      return
    }

    const initial = initializeNavigationHistory(space.id)
    navigationSnapshotRef.current = initial
    setNavigationSnapshot(initial)
    applyNavigationLocation(initial.location)

    const handlePopState = () => {
      const next = readNavigationHistory(space.id)
      navigationSnapshotRef.current = next
      setNavigationSnapshot(next)
      applyNavigationLocation(next.location)
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [applyNavigationLocation, space?.id])

  const navigateHistory = useCallback(
    (offset: -1 | 1) => {
      if (
        !space ||
        fileOpenInFlight.current ||
        pathMutationBusy ||
        !canNavigateHistory(navigationSnapshotRef.current, offset)
      ) {
        return
      }
      window.history.go(offset)
    },
    [pathMutationBusy, space]
  )

  const toggleSidebar = useCallback(() => {
    if (!space) return
    setSidebarCollapsed((current) => !current)
  }, [space])

  const toggleVersionPanel = useCallback(() => {
    if (!space?.graft.available) return
    setSyncPanelMode(null)
    if (versionPanelOpen) setVersionInspection(null)
    setVersionPanelOpen((current) => !current)
  }, [space?.graft.available, versionPanelOpen])

  const toggleSyncPanel = useCallback(() => {
    if (!space) return
    setVersionPanelOpen(false)
    setVersionInspection(null)
    setSyncPanelMode((current) => (current === null ? "enable" : null))
  }, [space])

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches("input, textarea, select, [role='textbox']"))
      ) {
        return
      }
      const workspaceShortcut = workspaceShortcutForKeyboardEvent(event)
      if (workspaceShortcut && space) {
        if (workspaceShortcut === "toggle-version" && !space.graft.available) {
          return
        }
        event.preventDefault()
        if (workspaceShortcut === "toggle-sidebar") toggleSidebar()
        else if (workspaceShortcut === "toggle-version") toggleVersionPanel()
        else toggleSyncPanel()
        return
      }
      const offset = navigationOffsetForKeyboardShortcut(event)
      if (!offset) return
      event.preventDefault()
      navigateHistory(offset)
    }
    const handlePointerNavigation = (event: PointerEvent) => {
      const offset = navigationOffsetForPointerButton(event.button)
      if (!offset) return
      event.preventDefault()
      navigateHistory(offset)
    }
    const preventAuxiliaryNavigation = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) event.preventDefault()
    }
    window.addEventListener("keydown", handleKeyboardShortcut)
    window.addEventListener("pointerdown", handlePointerNavigation)
    window.addEventListener("auxclick", preventAuxiliaryNavigation)
    const unsubscribe = window.eidosLite.onNavigationCommand((direction) =>
      navigateHistory(direction === "back" ? -1 : 1)
    )
    return () => {
      window.removeEventListener("keydown", handleKeyboardShortcut)
      window.removeEventListener("pointerdown", handlePointerNavigation)
      window.removeEventListener("auxclick", preventAuxiliaryNavigation)
      unsubscribe()
    }
  }, [
    navigateHistory,
    space,
    toggleSidebar,
    toggleSyncPanel,
    toggleVersionPanel,
  ])

  const retryFileIssue = useCallback(async () => {
    if (!fileIssue || !space) return
    const entry = findSpaceEntry(space.entries, fileIssue.relativePath)
    if (!entry || entry.kind !== "eidos") {
      setError("The Eidos File is not currently available at this path.")
      return
    }
    await openEntry(entry)
  }, [fileIssue, openEntry, space])

  const closeFile = useCallback(
    async (sessionId: string) => {
      await window.eidosLite.closeEidosFile(sessionId)
      setCachedFiles((current) =>
        current.filter((file) => file.sessionId !== sessionId)
      )
      if (activeSession === sessionId) {
        setActiveSession(null)
      }
    },
    [activeSession]
  )

  const activeTable = useMemo(
    () =>
      activeFile?.snapshot.tables.find(
        (table) => table.table.id === activeFile.tableId
      ) ?? null,
    [activeFile]
  )

  const applyPathMutation = useCallback(
    (result: SpacePathMutationResult) => {
      acceptSpaceSnapshot(result.snapshot)
      invalidateCachedSessions(result.invalidatedSessionIds)
    },
    [acceptSpaceSnapshot, invalidateCachedSessions]
  )

  const closeActiveDocument = useCallback(async () => {
    try {
      if (activeFile) await closeFile(activeFile.sessionId)
      else setTextPreview(null)
      recordNavigationLocation(null)
    } catch (cause) {
      setError(`Could not close the active file. ${errorMessage(cause)}`)
    }
  }, [activeFile, closeFile, recordNavigationLocation])

  const moveTreeEntry = useCallback(
    async (relativePath: string, targetDirectory: string | null) => {
      setPathMutationBusy(true)
      setError(null)
      const activePathMoved = pathMatchesPrefix(
        activeDocumentPath,
        relativePath
      )
      try {
        const result = await window.eidosLite.movePath(
          relativePath,
          targetDirectory
        )
        applyPathMutation(result)
        if (result.relativePath) {
          setSelectedEntry(
            findSpaceEntry(result.snapshot.entries, result.relativePath)
          )
        }
        if (activePathMoved) {
          setActiveSession(null)
          setTextPreview(null)
          recordNavigationLocation(null)
        }
      } finally {
        setPathMutationBusy(false)
      }
    },
    [activeDocumentPath, applyPathMutation, recordNavigationLocation]
  )

  const submitPathDialog = useCallback(
    async (value: string) => {
      if (!pathDialog) return
      setPathMutationBusy(true)
      setError(null)
      try {
        let result: SpacePathMutationResult
        switch (pathDialog.action) {
          case "create-eidos":
            result = await window.eidosLite.createEidosFile(
              parentPath(pathDialog.entry),
              value
            )
            break
          case "create-folder":
            result = await window.eidosLite.createFolder(
              parentPath(pathDialog.entry),
              value
            )
            break
          case "rename":
            if (!pathDialog.entry) throw new Error("Choose a Space item")
            result = await window.eidosLite.renamePath(
              pathDialog.entry.relativePath,
              value
            )
            break
          case "move":
            if (!pathDialog.entry) throw new Error("Choose a Space item")
            result = await window.eidosLite.movePath(
              pathDialog.entry.relativePath,
              value.trim() || null
            )
            break
          case "copy":
            if (!pathDialog.entry) throw new Error("Choose a Space item")
            result = await window.eidosLite.copyPath(
              pathDialog.entry.relativePath,
              value.trim() || null
            )
            break
          case "delete":
            if (!pathDialog.entry) throw new Error("Choose a Space item")
            result = await window.eidosLite.deletePath(
              pathDialog.entry.relativePath
            )
            break
        }
        applyPathMutation(result)
        const changedPath = pathDialog.entry?.relativePath
        const activePathChanged =
          changedPath !== undefined &&
          pathMatchesPrefix(activeDocumentPath, changedPath)
        if (activePathChanged) {
          setActiveSession(null)
          setTextPreview(null)
          recordNavigationLocation(null)
        }
        setPathDialog(null)
        setSelectedEntry(
          result.relativePath
            ? findSpaceEntry(result.snapshot.entries, result.relativePath)
            : null
        )
        if (pathDialog.action === "create-eidos" && result.relativePath) {
          const created = findSpaceEntry(
            result.snapshot.entries,
            result.relativePath
          )
          if (created) await openEntry(created)
        }
      } catch (cause) {
        setError(errorMessage(cause))
      } finally {
        setPathMutationBusy(false)
      }
    },
    [
      activeDocumentPath,
      applyPathMutation,
      openEntry,
      pathDialog,
      recordNavigationLocation,
    ]
  )

  const importFiles = useCallback(async () => {
    setPathMutationBusy(true)
    setError(null)
    try {
      const result = await window.eidosLite.importFiles(
        parentPath(selectedEntry)
      )
      if (result) applyPathMutation(result)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPathMutationBusy(false)
    }
  }, [applyPathMutation, selectedEntry])
  const canGoBack = canNavigateHistory(navigationSnapshot, -1)
  const canGoForward = canNavigateHistory(navigationSnapshot, 1)
  if (!space) {
    return (
      <>
        <Welcome
          appInfo={appInfo}
          opening={openingSpace}
          error={error}
          recents={recentSpaces}
          onNew={newSpace}
          onOpen={openSpace}
          onOpenRecent={(id) => void openRecentSpace(id)}
          onRemoveRecent={(id) => void removeRecentSpace(id)}
          onClone={() => setSyncPanelMode("clone")}
          onOpenSettings={() => void window.eidosLite.openSettings()}
          onCopyDiagnostics={() => void copyDiagnostics()}
          diagnosticsCopied={diagnosticsCopied}
        />
        {syncPanelMode ? (
          <Suspense fallback={null}>
            <SyncPanel
              mode={syncPanelMode}
              cacheKey="welcome"
              hasUncheckpointedChanges={false}
              onClose={() => setSyncPanelMode(null)}
              onRequestClone={() => setSyncPanelMode("clone")}
              onClone={(snapshot) => {
                acceptSpaceSnapshot(snapshot)
                setSyncPanelMode(null)
                void window.eidosLite
                  .listRecentSpaces()
                  .then(setRecentSpaces, (cause) =>
                    setError(errorMessage(cause))
                  )
              }}
            />
          </Suspense>
        ) : null}
      </>
    )
  }

  const versionChangeCount =
    space.graft.initialized && space.graft.clean === false
      ? Math.max(1, space.graft.changedPaths ?? 1)
      : 0
  const versionChangeLabel =
    versionChangeCount > 99 ? "99+" : String(versionChangeCount)

  return (
    <div
      className="workbench"
      data-platform={
        navigator.userAgent.includes("Macintosh") ? "darwin" : "other"
      }
      data-service-environment={appInfo?.services.name ?? "unknown"}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      style={
        {
          "--space-sidebar-width": sidebarCollapsed
            ? "0px"
            : `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <aside className="space-sidebar" aria-hidden={sidebarCollapsed}>
        <header className="sidebar-header">
          <TitlebarNavigation
            collapsed={false}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            toggleShortcutLabel={sidebarShortcutLabel}
            onToggle={toggleSidebar}
            onBack={() => navigateHistory(-1)}
            onForward={() => navigateHistory(1)}
          />
        </header>
        <div className="space-heading">
          <strong title={space.displayPath}>{space.name}</strong>
          <span>
            {space.eidosFileCount} Eidos{" "}
            {spaceTreeIncomplete ? "loaded" : "Files"}
          </span>
          <div
            className="space-heading-actions"
            role="toolbar"
            aria-label="Space file actions"
          >
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setPathDialog({ action: "create-eidos", entry: selectedEntry })
              }
              aria-label="New Eidos File"
              title="New Eidos File"
              disabled={pathMutationBusy || space.operation.phase !== "ready"}
            >
              <FilePlus2 />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setPathDialog({ action: "create-folder", entry: selectedEntry })
              }
              aria-label="New folder"
              title="New folder"
              disabled={pathMutationBusy || space.operation.phase !== "ready"}
            >
              <FolderPlus />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => void importFiles()}
              aria-label="Import files"
              title="Import files"
              disabled={pathMutationBusy || space.operation.phase !== "ready"}
            >
              <Upload />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                void window.eidosLite.refreshSpace().then(setSpace)
              }
              aria-label="Refresh Space Explorer"
              title="Refresh Space Explorer"
            >
              <RefreshCw />
            </button>
          </div>
        </div>
        <nav className="explorer" aria-label={`${space.name} files`}>
          <Suspense
            fallback={
              <p className="explorer-busy" role="status">
                <LoaderCircle className="spin" /> Loading Space Explorer…
              </p>
            }
          >
            <SpaceFileTree
              entries={space.entries}
              activePath={activeDocumentPath}
              disabled={space.operation.phase !== "ready" || busyFile !== null}
              onSelect={setSelectedEntry}
              onOpen={(entry) => void openEntry(entry)}
              onLoadDirectory={(relativePath) => {
                void window.eidosLite
                  .loadSpaceDirectory(relativePath)
                  .then(acceptSpaceSnapshot)
                  .catch((error) => setError(errorMessage(error)))
              }}
              onMove={moveTreeEntry}
              onMoveError={(cause) =>
                setError(`Could not move item. ${errorMessage(cause)}`)
              }
              onContextMenu={(entry, x, y) =>
                setContextMenu({
                  entry,
                  x: Math.max(8, Math.min(x, window.innerWidth - 200)),
                  y: Math.max(8, Math.min(y, window.innerHeight - 260)),
                })
              }
            />
          </Suspense>
          {busyFile ? (
            <p className="explorer-busy">
              <LoaderCircle className="spin" /> Opening {busyFile}
            </p>
          ) : null}
        </nav>
      </aside>

      <div
        className="sidebar-resizer"
        data-sidebar-resizer
        role="separator"
        aria-label="Resize Space Explorer"
        aria-orientation="vertical"
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={sidebarCollapsed ? -1 : 0}
        onPointerDown={startSidebarResize}
        onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
          event.preventDefault()
          const step = event.shiftKey ? 32 : 16
          adjustSidebarWidth(event.key === "ArrowLeft" ? -step : step)
        }}
      />

      <main className="editor-region" id="main-content">
        <header className="file-titlebar">
          {sidebarCollapsed ? (
            <TitlebarNavigation
              collapsed
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              toggleShortcutLabel={sidebarShortcutLabel}
              onToggle={toggleSidebar}
              onBack={() => navigateHistory(-1)}
              onForward={() => navigateHistory(1)}
            />
          ) : null}
          <div className="file-titlebar-identity">
            <div>
              <strong>
                {activeDocumentPath ? fileName(activeDocumentPath) : space.name}
              </strong>
              {activeDocumentPath &&
              activeDocumentPath !== fileName(activeDocumentPath) ? (
                <small>{activeDocumentPath}</small>
              ) : null}
            </div>
            {activeDocumentPath ? (
              <button
                type="button"
                className="icon-button active-file-close"
                aria-label={`Close ${activeDocumentPath}`}
                title={`Close ${activeDocumentPath}`}
                onClick={() => void closeActiveDocument()}
              >
                <X />
              </button>
            ) : null}
          </div>
          <div
            className="file-titlebar-actions"
            role="toolbar"
            aria-label="Space actions"
          >
            <button
              type="button"
              className="icon-button titlebar-tool-button"
              data-titlebar-action="version"
              data-version-change-count={versionChangeCount}
              disabled={!space.graft.available}
              aria-pressed={versionPanelOpen}
              aria-keyshortcuts={WORKSPACE_SHORTCUT_ARIA["toggle-version"]}
              aria-label={
                space.graft.checking
                  ? "Checking version history"
                  : !space.graft.available
                    ? "Version history unavailable"
                    : versionChangeCount > 0
                      ? `Version history, ${versionChangeCount} changed ${versionChangeCount === 1 ? "file" : "files"}`
                      : space.graft.initialized
                        ? "Version history"
                        : "Set up version history"
              }
              onClick={toggleVersionPanel}
              title={shortcutTitle(
                space.graft.checking
                  ? "Checking version history"
                  : !space.graft.available
                    ? (space.graft.error ?? "Version history unavailable")
                    : versionChangeCount > 0
                      ? `${versionChangeCount} changed ${versionChangeCount === 1 ? "file" : "files"}`
                      : space.graft.initialized
                        ? "Version history"
                        : "Set up version history",
                versionShortcutLabel
              )}
            >
              <History />
              {versionChangeCount > 0 ? (
                <span className="version-change-badge" aria-hidden="true">
                  {versionChangeLabel}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="icon-button titlebar-tool-button"
              data-titlebar-action="sync"
              data-sync-queue-state={syncQueueStatus?.state ?? "idle"}
              aria-pressed={syncPanelMode === "enable"}
              aria-label={syncQueueLabel(syncQueueStatus)}
              aria-keyshortcuts={WORKSPACE_SHORTCUT_ARIA["toggle-sync"]}
              onClick={toggleSyncPanel}
              title={shortcutTitle(
                syncQueueLabel(syncQueueStatus),
                syncShortcutLabel
              )}
            >
              {syncQueueStatus?.state === "running" ? (
                <LoaderCircle className="spin" />
              ) : (
                <Cloud />
              )}
            </button>
          </div>
        </header>

        <div className="open-file-runtime-state" hidden>
          {cachedFiles.map((file) => (
            <span
              key={file.sessionId}
              data-cached-file-path={file.relativePath}
            />
          ))}
        </div>

        {error ? (
          <div className="inline-error" role="alert">
            <CircleAlert />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              <X />
            </button>
          </div>
        ) : null}

        {fileIssue ? (
          <FileRecoveryNotice
            issue={fileIssue}
            canRetry={Boolean(
              findSpaceEntry(space.entries, fileIssue.relativePath)?.kind ===
              "eidos"
            )}
            canReviewHistory={space.graft.initialized}
            onRetry={() => void retryFileIssue()}
            onReveal={() => {
              void window.eidosLite
                .revealPath(fileIssue.relativePath)
                .catch((cause) => setError(errorMessage(cause)))
            }}
            onReviewHistory={() => {
              setVersionInspection(null)
              setVersionPanelOpen(true)
            }}
            onDismiss={() => setFileIssue(null)}
          />
        ) : null}

        <div
          className={`editor-work-area${versionPanelOpen ? " with-version-panel" : ""}`}
        >
          <div className="editor-work-content">
            {versionPanelOpen && versionInspection ? (
              <Suspense
                fallback={
                  <div className="editor-empty" role="status">
                    <LoaderCircle className="spin" aria-hidden="true" />
                    <p>Loading change details…</p>
                  </div>
                }
              >
                <VersionDiffPreview
                  inspection={versionInspection}
                  onClose={() => setVersionInspection(null)}
                />
              </Suspense>
            ) : textPreview ? (
              <TextFilePreview
                preview={textPreview}
                onReveal={() =>
                  void window.eidosLite
                    .revealPath(textPreview.relativePath)
                    .catch((cause) => setError(errorMessage(cause)))
                }
              />
            ) : activeFile && activeTable ? (
              <section
                className="file-editor"
                aria-label={activeFile.relativePath}
                data-eidos-file-relative-path={activeFile.relativePath}
                data-eidos-file-row-count={activeTable.rowCount}
              >
                <Suspense
                  fallback={
                    <div className="editor-empty" role="status">
                      <LoaderCircle className="spin" aria-hidden="true" />
                      <p>Loading Eidos File editor…</p>
                    </div>
                  }
                >
                  <EidosFileWorkbench
                    key={`${activeFile.sessionId}:${fileMaterializationKey}`}
                    relativePath={activeFile.relativePath}
                    snapshot={activeFile.snapshot}
                    source={activeFile.source}
                    activeTableId={activeFile.tableId}
                    disabled={space.operation.phase !== "ready"}
                    theme={theme}
                    onTableSelect={(tableId) =>
                      setCachedFiles((current) =>
                        current.map((file) =>
                          file.sessionId === activeFile.sessionId
                            ? { ...file, tableId }
                            : file
                        )
                      )
                    }
                    onSnapshot={(snapshot) =>
                      setCachedFiles((current) =>
                        current.map((file) =>
                          file.sessionId === activeFile.sessionId
                            ? { ...file, snapshot }
                            : file
                        )
                      )
                    }
                    onError={(cause) => setError(errorMessage(cause))}
                  />
                </Suspense>
              </section>
            ) : space.eidosFileCount === 0 && !spaceTreeIncomplete ? (
              <section
                className="editor-empty editor-empty-onboarding"
                data-empty-space-onboarding
              >
                <Database aria-hidden="true" />
                <h2>Create your first Eidos File</h2>
                <p>
                  Start with a local <code>.eidos</code> file inside this Space.
                  It remains an ordinary file you own and can move or back up.
                </p>
                <button
                  type="button"
                  className="editor-empty-action"
                  data-create-first-eidos
                  disabled={
                    pathMutationBusy || space.operation.phase !== "ready"
                  }
                  onClick={() =>
                    setPathDialog({ action: "create-eidos", entry: null })
                  }
                >
                  <FilePlus2 /> New Eidos File
                </button>
              </section>
            ) : (
              <section className="editor-empty">
                <Database aria-hidden="true" />
                <h2>Open an Eidos File</h2>
                <p>
                  Choose any <code>.eidos</code> file in this Space. Recently
                  used files reopen from a small in-memory runtime cache.
                </p>
              </section>
            )}
          </div>
          {versionPanelOpen && space.graft.available ? (
            <Suspense fallback={null}>
              <VersionPanel
                space={space}
                refreshKey={versionRefreshKey}
                onClose={() => {
                  setVersionPanelOpen(false)
                  setVersionInspection(null)
                }}
                onSpaceChange={acceptSpaceSnapshot}
                onFilesMaterialized={refreshMaterializedFiles}
                onRefresh={() => setVersionRefreshKey((current) => current + 1)}
                onInspectionChange={setVersionInspection}
              />
            </Suspense>
          ) : null}
        </div>
      </main>
      {syncPanelMode ? (
        <Suspense fallback={null}>
          <SyncPanel
            mode={syncPanelMode}
            cacheKey={space.id}
            hasUncheckpointedChanges={
              space.graft.initialized && space.graft.clean === false
            }
            onClose={() => setSyncPanelMode(null)}
            onRequestClone={() => setSyncPanelMode("clone")}
            onReviewLocal={() => {
              setSyncPanelMode(null)
              setVersionPanelOpen(true)
              setVersionInspection(null)
            }}
            onSpaceChange={acceptSpaceSnapshot}
          />
        </Suspense>
      ) : null}
      {contextMenu ? (
        <div
          className="space-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseLeave={() => setContextMenu(null)}
        >
          {contextMenu.entry.kind !== "directory" ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void openEntry(contextMenu.entry)
                setContextMenu(null)
              }}
            >
              <FolderOpen />
              {contextMenu.entry.kind === "eidos" ? "Open" : "Preview"}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPathDialog({ action: "rename", entry: contextMenu.entry })
              setContextMenu(null)
            }}
          >
            <Pencil /> Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPathDialog({ action: "move", entry: contextMenu.entry })
              setContextMenu(null)
            }}
          >
            <FolderInput /> Move
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPathDialog({ action: "copy", entry: contextMenu.entry })
              setContextMenu(null)
            }}
          >
            <Copy /> Copy
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void window.eidosLite.revealPath(contextMenu.entry.relativePath)
              setContextMenu(null)
            }}
          >
            <FolderOpen /> Reveal in Finder
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger-menu-item"
            onClick={() => {
              setPathDialog({ action: "delete", entry: contextMenu.entry })
              setContextMenu(null)
            }}
          >
            <Trash2 /> Move to Trash
          </button>
        </div>
      ) : null}
      {pathDialog ? (
        <PathActionDialog
          key={`${pathDialog.action}:${pathDialog.entry?.relativePath ?? "root"}`}
          state={pathDialog}
          busy={pathMutationBusy}
          onCancel={() => setPathDialog(null)}
          onSubmit={(value) => void submitPathDialog(value)}
        />
      ) : null}
    </div>
  )
}

export function App() {
  const theme = useAppTheme()
  return window.location.hash === "#/settings" ? (
    <SettingsPage />
  ) : (
    <WorkspaceApp theme={theme} />
  )
}
