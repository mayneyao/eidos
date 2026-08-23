import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { flushSync } from "react-dom"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  ClipboardCopy,
  Cloud,
  CloudDownload,
  Copy,
  Database,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  GitMerge,
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
  EidosLiteUpdateStatus,
  EidosPublicationBinding,
  EidosSyncMergeStatus,
  EidosSyncQueueStatus,
  RecentSpaceEntry,
  SpacePathMutationResult,
  SpaceSnapshot,
  SpaceTreeEntry,
  TextFilePreviewResult,
} from "../shared/contracts"
import { eidosLiteNewFileKind } from "../shared/new-file"
import { fileManagerMessage } from "../shared/platform-copy"
import {
  DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
  type EidosLiteKeyboardShortcuts,
  type EidosLiteShortcutCommand,
} from "../shared/keyboard-shortcuts"
import {
  applyAppearance,
  DEFAULT_RENDERER_PREFERENCES,
  resolveAppearance,
  toggledAppearance,
  type ResolvedAppearance,
} from "./app-appearance"
import { FileRecoveryNotice } from "./file-recovery-notice"
import { fileTitlebarPresentation } from "./file-titlebar-presentation"
import type { EidosFileWorkbench as EidosFileWorkbenchImplementation } from "./eidos-file-workbench"
import { IpcEidosFileDataSource } from "./ipc-data-source"
import { useEidosLiteI18n } from "./i18n"
import {
  canNavigateHistory,
  initializeNavigationHistory,
  pathMatchesPrefix,
  pushNavigationLocation,
  readNavigationHistory,
  replaceNavigationLocation,
  type NavigationLocation,
  type NavigationSnapshot,
} from "./navigation-history"
import { RecentFilesEmptyState } from "./recent-files-empty-state"
import { rendererPlatform } from "./renderer-platform"
import { QuickOpen } from "./quick-open"
import {
  isPublishableEntry,
  PublishPanel,
  type PublishPanelSubmission,
} from "./publish-panel"
import {
  PublishTaskDock,
  updatePublishTaskProgress,
  type PublishTaskState,
} from "./publish-task-dock"
import {
  isSidebarUpdateReady,
  SidebarUpdateAction,
} from "./sidebar-update-action"
import { findSpaceEntry, resolveSpaceEntry } from "./space-entry-resolution"
import {
  loadRecentFiles,
  rememberRecentFile,
  remapRecentFiles,
  storeRecentFiles,
  type RecentFileEntry,
} from "./recent-files"
import { blocksLocalInteraction } from "./space-operation-availability"
import { MediaFilePreview } from "./media-file-preview"
import {
  prepareTextFilePreview,
  TextFilePreview,
  type TextFileDraft,
} from "./text-file-preview"
import { SettingsPage } from "./settings-page"
import type { VersionInspection } from "./version-change-tree"
import {
  workspaceShortcutAriaKeyShortcuts,
  workspaceShortcutLabel,
} from "./workspace-shortcuts"

let eidosFileWorkbenchModule:
  | Promise<{
      EidosFileWorkbench: typeof EidosFileWorkbenchImplementation
    }>
  | undefined

let LoadedEidosFileWorkbench:
  | typeof EidosFileWorkbenchImplementation
  | undefined

async function loadEidosFileWorkbench() {
  eidosFileWorkbenchModule ??= import("./eidos-file-workbench")
  const module = await eidosFileWorkbenchModule
  LoadedEidosFileWorkbench = module.EidosFileWorkbench
  return { default: module.EidosFileWorkbench }
}

const LazyEidosFileWorkbench = lazy(loadEidosFileWorkbench)

function EidosFileWorkbench(
  props: ComponentProps<typeof LazyEidosFileWorkbench>
) {
  const Loaded = LoadedEidosFileWorkbench
  return Loaded ? <Loaded {...props} /> : <LazyEidosFileWorkbench {...props} />
}

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
const SyncMergeWorkbench = lazy(async () => {
  const module = await import("./sync-merge-workspace")
  return { default: module.SyncMergeWorkbench }
})

interface CachedFile {
  sessionId: string
  relativePath: string
  snapshot: EidosFileSnapshot
  source: IpcEidosFileDataSource
  tableId: string
}

interface RecentFileState {
  spaceId: string | null
  files: RecentFileEntry[]
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
  keyboardShortcuts: EidosLiteKeyboardShortcuts
  macos: boolean
  onToggle(): void
  onBack(): void
  onForward(): void
}

function TitlebarNavigation({
  collapsed,
  canGoBack,
  canGoForward,
  keyboardShortcuts,
  macos,
  onToggle,
  onBack,
  onForward,
}: TitlebarNavigationProps) {
  const { t } = useEidosLiteI18n()
  const label = collapsed
    ? t("Show Space Explorer")
    : t("Collapse Space Explorer")
  const toggleShortcutLabel = workspaceShortcutLabel(
    "toggle-sidebar",
    macos,
    keyboardShortcuts
  )
  return (
    <nav
      className="titlebar-navigation"
      aria-label={t("Document navigation")}
      data-titlebar-navigation
    >
      <button
        type="button"
        className="icon-button sidebar-toggle-button"
        data-sidebar-toggle={collapsed ? "open" : "close"}
        onClick={onToggle}
        aria-label={label}
        aria-keyshortcuts={workspaceShortcutAriaKeyShortcuts(
          "toggle-sidebar",
          macos,
          keyboardShortcuts
        )}
        title={shortcutTitle(label, toggleShortcutLabel)}
      >
        <PanelLeft />
      </button>
      <button
        type="button"
        className="icon-button"
        data-navigation-action="back"
        onClick={onBack}
        aria-label={t("Go back")}
        title={t("Go back")}
        disabled={!canGoBack}
      >
        <ArrowLeft />
      </button>
      <button
        type="button"
        className="icon-button"
        data-navigation-action="forward"
        onClick={onForward}
        aria-label={t("Go forward")}
        title={t("Go forward")}
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
const SIDEBAR_COLLAPSED_STORAGE_KEY = "eidos-lite:space-sidebar-collapsed"
const DEFAULT_UTILITY_PANEL_WIDTH = 352
const MIN_UTILITY_PANEL_WIDTH = 304
const MAX_UTILITY_PANEL_WIDTH = 640
const MIN_EDITOR_WORK_WIDTH = 304
const UTILITY_PANEL_WIDTH_STORAGE_KEY = "eidos-lite:utility-panel-width"
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

function storedSidebarCollapsed(): boolean {
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
}

function clampUtilityPanelWidth(
  width: number,
  maximum = MAX_UTILITY_PANEL_WIDTH
): number {
  return Math.min(
    Math.max(MIN_UTILITY_PANEL_WIDTH, maximum),
    Math.max(MIN_UTILITY_PANEL_WIDTH, width)
  )
}

function maximumUtilityPanelWidth(container: HTMLElement | null): number {
  if (!container) return MAX_UTILITY_PANEL_WIDTH
  return Math.min(
    MAX_UTILITY_PANEL_WIDTH,
    Math.max(
      MIN_UTILITY_PANEL_WIDTH,
      container.getBoundingClientRect().width - MIN_EDITOR_WORK_WIDTH
    )
  )
}

function storedUtilityPanelWidth(): number {
  const stored = Number.parseInt(
    window.localStorage.getItem(UTILITY_PANEL_WIDTH_STORAGE_KEY) ?? "",
    10
  )
  return Number.isFinite(stored)
    ? clampUtilityPanelWidth(stored)
    : DEFAULT_UTILITY_PANEL_WIDTH
}

function syncQueueLabel(status: EidosSyncQueueStatus | null): string {
  if (!status || status.state === "idle") return "Eidos Sync"
  if (status.state === "running") return "Syncing…"
  if (status.state === "pending") return "Sync queued"
  if (status.state === "retry-wait") return "Sync retry pending"
  return "Sync paused"
}

function shortcutTitle(label: string, shortcut: string): string {
  return shortcut === "—" ? label : `${label} (${shortcut})`
}

type PathDialogAction = "create-file" | "create-folder" | "delete"

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
  const { t } = useEidosLiteI18n()
  const config = {
    "create-file": {
      title: t("New File"),
      label: t("File name"),
      initial: "Untitled.eidos",
      action: t("Create"),
    },
    "create-folder": {
      title: t("New folder"),
      label: t("Folder name"),
      initial: t("New folder"),
      action: t("Create"),
    },
    delete: {
      title: t("Move {name} to Trash?", {
        name: state.entry?.name ?? t("item"),
      }),
      label: "",
      initial: "",
      action: t("Move to Trash"),
    },
  }[state.action]
  const [value, setValue] = useState(config.initial)
  const destructive = state.action === "delete"
  const description =
    state.action === "create-file"
      ? t(
          "Use .eidos for an Eidos File. Another extension, such as .md or .txt, creates an empty text file. Names without an extension use .eidos."
        )
      : null

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
            aria-label={t("Cancel")}
            disabled={busy}
          >
            <X />
          </button>
        </header>
        {destructive ? (
          <p>
            {t(
              "The item will leave this Space and can be recovered from the system Trash."
            )}
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
            {description ? (
              <small className="path-dialog-description">{description}</small>
            ) : null}
          </label>
        )}
        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>
            {t("Cancel")}
          </button>
          <button
            type="submit"
            className={destructive ? "danger-action" : "primary-action"}
            disabled={busy || (!destructive && !value.trim())}
          >
            {busy ? <LoaderCircle className="spin" /> : null}
            {busy ? t("Working…") : config.action}
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
  const { t } = useEidosLiteI18n()
  const platform = appInfo?.platform ?? rendererPlatform()
  const settingsShortcut = platform === "darwin" ? "⌘," : "Ctrl+,"
  return (
    <main
      className="welcome-shell"
      data-platform={platform}
      data-welcome-ready={appInfo ? "true" : "false"}
    >
      <header className="welcome-titlebar">
        <strong>Eidos Lite</strong>
        <button
          type="button"
          className="icon-button welcome-settings-button"
          onClick={onOpenSettings}
          aria-label={t("Settings")}
          aria-keyshortcuts={platform === "darwin" ? "Meta+," : "Control+,"}
          title={`${t("Settings")} (${settingsShortcut})`}
        >
          <Settings />
        </button>
      </header>
      <section className="welcome-copy" aria-labelledby="welcome-title">
        <p className="eyebrow">{t("Local-first workspace")}</p>
        <h1 id="welcome-title">{t("Choose a Space")}</h1>
        <p className="welcome-detail">
          {t(
            "Open an ordinary folder and work across its Eidos Files. Local work never requires an account."
          )}
        </p>
        <div className="welcome-actions">
          <button
            type="button"
            className="primary-action"
            onClick={onNew}
            disabled={opening}
          >
            {opening ? <LoaderCircle className="spin" /> : <FolderPlus />}
            {opening ? t("Opening Space…") : t("New Space")}
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={onOpen}
            disabled={opening}
          >
            <FolderOpen /> {t("Open Space")}
          </button>
          <button type="button" className="secondary-action" onClick={onClone}>
            <CloudDownload /> {t("Open Synced Space")}
          </button>
          <button
            type="button"
            className="secondary-action welcome-diagnostics"
            data-copy-diagnostics
            onClick={onCopyDiagnostics}
          >
            <Copy />{" "}
            {diagnosticsCopied
              ? t("Diagnostics copied")
              : t("Copy diagnostics")}
          </button>
        </div>
        {error ? (
          <p className="welcome-error" role="alert">
            <CircleAlert />
            {error}
          </p>
        ) : null}
      </section>
      <aside className="welcome-principles" aria-label={t("Recent Spaces")}>
        <header>
          <span>{t("Recent Spaces")}</span>
          <small>
            {recents.length ? t("Local folders") : t("No recent Spaces")}
          </small>
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
                    {recent.available ? recent.path : t("Folder unavailable")}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="recent-space-remove"
                onClick={() => onRemoveRecent(recent.id)}
                aria-label={t("Remove {name} from recent Spaces", {
                  name: recent.name,
                })}
                title={t("Remove from recents")}
              >
                <X />
              </button>
            </div>
          ))}
        </div>
        <p className="recent-spaces-note">
          {t(
            "Spaces remain ordinary folders. Removing one here never deletes its files."
          )}
        </p>
      </aside>
    </main>
  )
}

function WorkspaceApp({ theme }: { theme: ResolvedAppearance }) {
  const { t } = useEidosLiteI18n()
  const [appInfo, setAppInfo] = useState<EidosLiteAppInfo | null>(null)
  const platform = appInfo?.platform ?? rendererPlatform()
  const macos = platform === "darwin"
  const [keyboardShortcuts, setKeyboardShortcuts] =
    useState<EidosLiteKeyboardShortcuts>({
      ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
    })
  const [weekStartsOnMonday, setWeekStartsOnMonday] = useState(
    DEFAULT_RENDERER_PREFERENCES.weekStartsOnMonday
  )
  const [timeZone, setTimeZone] = useState(
    DEFAULT_RENDERER_PREFERENCES.timeZone
  )
  const versionShortcutLabel = workspaceShortcutLabel(
    "toggle-version",
    macos,
    keyboardShortcuts
  )
  const syncShortcutLabel = workspaceShortcutLabel(
    "toggle-sync",
    macos,
    keyboardShortcuts
  )
  const newFileShortcutLabel = workspaceShortcutLabel(
    "new-file",
    macos,
    keyboardShortcuts
  )
  const [space, setSpace] = useState<SpaceSnapshot | null>(null)
  const [cachedFiles, setCachedFiles] = useState<CachedFile[]>([])
  const [recentFileState, setRecentFileState] = useState<RecentFileState>({
    spaceId: null,
    files: [],
  })
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [textPreview, setTextPreview] = useState<TextFilePreviewResult | null>(
    null
  )
  const [textFileDrafts, setTextFileDrafts] = useState<
    Record<string, TextFileDraft | undefined>
  >({})
  const [openingSpace, setOpeningSpace] = useState(false)
  const [recentSpaces, setRecentSpaces] = useState<RecentSpaceEntry[]>([])
  const [busyFile, setBusyFile] = useState<string | null>(null)
  const [versionPanelOpen, setVersionPanelOpen] = useState(false)
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [versionInspection, setVersionInspection] =
    useState<VersionInspection | null>(null)
  const [syncPanelMode, setSyncPanelMode] = useState<"enable" | "clone" | null>(
    null
  )
  const [syncQueueStatus, setSyncQueueStatus] =
    useState<EidosSyncQueueStatus | null>(null)
  const [syncMergeStatus, setSyncMergeStatus] = useState<EidosSyncMergeStatus>({
    state: "none",
  })
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)
  const [fileMaterializationKey, setFileMaterializationKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fileIssue, setFileIssue] = useState<EidosFileIssue | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(storedSidebarWidth)
  const [sidebarResizing, setSidebarResizing] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    storedSidebarCollapsed
  )
  const [utilityPanelWidth, setUtilityPanelWidth] = useState(
    storedUtilityPanelWidth
  )
  const [utilityPanelResizing, setUtilityPanelResizing] = useState(false)
  const [updateStatus, setUpdateStatus] =
    useState<EidosLiteUpdateStatus | null>(null)

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
  const [publishPanel, setPublishPanel] = useState<{
    entry: SpaceTreeEntry
    x: number
    y: number
  } | null>(null)
  const [publishTask, setPublishTask] = useState<PublishTaskState | null>(null)
  const [publishTaskExpanded, setPublishTaskExpanded] = useState(false)
  const [publicationBindings, setPublicationBindings] = useState<
    EidosPublicationBinding[]
  >([])
  const [pathDialog, setPathDialog] = useState<PathDialogState | null>(null)
  const [pathMutationBusy, setPathMutationBusy] = useState(false)
  const [treeRenameRequest, setTreeRenameRequest] = useState<{
    treePath: string
    nonce: number
  } | null>(null)
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false)
  const fileOpenInFlight = useRef(false)
  const navigationSnapshotRef = useRef<NavigationSnapshot | null>(null)

  const refreshPublicationBindings = useCallback(async () => {
    if (!space) {
      setPublicationBindings([])
      return []
    }
    try {
      const bindings = await window.eidosLite.listPublicationBindings()
      setPublicationBindings(bindings)
      return bindings
    } catch {
      setPublicationBindings([])
      return []
    }
  }, [space?.id])

  useEffect(() => {
    void refreshPublicationBindings()
  }, [refreshPublicationBindings])

  const collectPublicationBinding = useCallback(
    async (binding: EidosPublicationBinding) => {
      const response = await window.eidosLite.collectPublishedForm({
        requestId: crypto.randomUUID(),
        relativePath: binding.relativePath,
        publicationId: binding.publicationId,
      })
      await refreshPublicationBindings()
      return response
    },
    [refreshPublicationBindings]
  )

  const startPublish = useCallback(
    (
      entry: SpaceTreeEntry,
      anchorX: number,
      anchorY: number,
      options: PublishPanelSubmission
    ) => {
      const requestId = crypto.randomUUID()
      setPublishPanel(null)
      setPublishTaskExpanded(false)
      setPublishTask({
        requestId,
        entry,
        anchorX,
        anchorY,
        slug: options.slug,
        status: "running",
        progress: {
          requestId,
          kind: "stage",
          message: "starting Publish",
        },
      })
      void window.eidosLite
        .publishFile({
          requestId,
          relativePath: entry.relativePath,
          slug: options.slug,
          accessMode: options.accessMode,
          ...(options.formView ? { formView: options.formView } : {}),
          ...(options.password ? { password: options.password } : {}),
        })
        .then((response) => {
          if (response.ok) void refreshPublicationBindings()
          setPublishTask((current) => {
            if (!current || current.requestId !== requestId) return current
            return response.ok
              ? {
                  ...current,
                  status: "succeeded",
                  result: response.result,
                  failure: undefined,
                }
              : {
                  ...current,
                  status: "failed",
                  failure: response.failure,
                  result: undefined,
                }
          })
        })
        .catch((cause: unknown) => {
          setPublishTask((current) =>
            !current || current.requestId !== requestId
              ? current
              : {
                  ...current,
                  status: "failed",
                  failure: {
                    code: "publish-failed",
                    message:
                      cause instanceof Error ? cause.message : String(cause),
                  },
                  result: undefined,
                }
          )
        })
    },
    [refreshPublicationBindings]
  )

  useEffect(() => {
    void window.eidosLite.getPreferences().then((preferences) => {
      setKeyboardShortcuts(preferences.keyboardShortcuts)
      setWeekStartsOnMonday(preferences.weekStartsOnMonday)
      setTimeZone(preferences.timeZone)
    })
    return window.eidosLite.onPreferencesChanged((preferences) => {
      setKeyboardShortcuts(preferences.keyboardShortcuts)
      setWeekStartsOnMonday(preferences.weekStartsOnMonday)
      setTimeZone(preferences.timeZone)
    })
  }, [])

  useEffect(
    () =>
      window.eidosLite.onPublishProgress((progress) => {
        setPublishTask((current) =>
          updatePublishTaskProgress(current, progress)
        )
      }),
    []
  )

  useEffect(() => {
    let active = true
    let receivedChange = false
    const unsubscribe = window.eidosLite.onUpdateStatusChanged((status) => {
      receivedChange = true
      if (active) setUpdateStatus(status)
    })
    void window.eidosLite.getUpdateStatus().then(
      (status) => {
        if (active && !receivedChange) setUpdateStatus(status)
      },
      () => undefined
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

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

  const updateRecentFiles = useCallback(
    (update: (files: readonly RecentFileEntry[]) => RecentFileEntry[]) => {
      const spaceId = space?.id
      if (!spaceId) return
      setRecentFileState((current) => {
        const files = update(
          current.spaceId === spaceId
            ? current.files
            : loadRecentFiles(window.localStorage, spaceId)
        )
        storeRecentFiles(window.localStorage, spaceId, files)
        return { spaceId, files }
      })
    },
    [space?.id]
  )

  const rememberOpenedEntry = useCallback(
    (entry: SpaceTreeEntry) => {
      if (entry.kind === "directory") return
      updateRecentFiles((files) => rememberRecentFile(files, entry))
    },
    [updateRecentFiles]
  )

  const updateRecentFilePaths = useCallback(
    (sourcePath: string, destinationPath: string | null) => {
      updateRecentFiles((files) =>
        remapRecentFiles(files, sourcePath, destinationPath)
      )
    },
    [updateRecentFiles]
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
    async (
      snapshot: SpaceSnapshot,
      materializedPaths: readonly string[] | null = []
    ) => {
      // Sync and merge materialization return an authoritative Space snapshot.
      // Keep the shell's Graft/Sync relationship and open file snapshots in
      // step with the files that were replaced on disk.
      acceptSpaceSnapshot(snapshot)
      const invalidated = new Set(snapshot.invalidatedSessionIds)
      const materialized = materializedPaths ? new Set(materializedPaths) : null
      if (materialized && materialized.size > 0) {
        setTextFileDrafts((current) => {
          const next = { ...current }
          for (const relativePath of materialized) delete next[relativePath]
          return next
        })
      }
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
      if (
        textPreview &&
        (!materialized || materialized.has(textPreview.relativePath))
      ) {
        try {
          const preview = await window.eidosLite.previewTextFile(
            textPreview.relativePath
          )
          await prepareTextFilePreview(preview)
          setTextPreview(preview)
        } catch {
          // Discarding a newly added or renamed file can intentionally remove
          // the path that was being previewed. Return to the Space landing
          // state instead of keeping stale text or surfacing a false error.
          setTextPreview(null)
        }
      }
      const failure = results.find((result) => result.status === "rejected")
      if (failure?.status === "rejected") {
        setError(
          `Space files changed, but an open Eidos File could not refresh. ${errorMessage(failure.reason)}`
        )
      }
    },
    [acceptSpaceSnapshot, cachedFiles, textPreview]
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
    if (!space || typeof window.eidosLite.getSyncMergeStatus !== "function") {
      setSyncMergeStatus({ state: "none" })
      return
    }
    let active = true
    setSyncMergeStatus({ state: "none" })
    void window.eidosLite.getSyncMergeStatus().then(
      (response) => {
        if (!active || !response.ok) return
        setSyncMergeStatus(response.value)
        if (response.value.state === "merging") {
          setSyncPanelMode(null)
          setVersionInspection(null)
          setVersionPanelOpen(true)
        }
      },
      () => undefined
    )
    return () => {
      active = false
    }
  }, [space?.id])

  useEffect(() => {
    setActiveSession(null)
    setTextPreview(null)
    setTextFileDrafts({})
  }, [space?.id])

  useEffect(() => {
    const spaceId = space?.id ?? null
    setRecentFileState({
      spaceId,
      files: spaceId ? loadRecentFiles(window.localStorage, spaceId) : [],
    })
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

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(sidebarCollapsed)
    )
  }, [sidebarCollapsed])

  useEffect(() => {
    window.localStorage.setItem(
      UTILITY_PANEL_WIDTH_STORAGE_KEY,
      String(utilityPanelWidth)
    )
  }, [utilityPanelWidth])

  const activeFile =
    cachedFiles.find((file) => file.sessionId === activeSession) ?? null
  const recentFiles =
    recentFileState.spaceId === space?.id ? recentFileState.files : []
  const spaceTreeIncomplete = space
    ? hasUnloadedDirectories(space.entries)
    : false
  const activeDocumentPath =
    activeFile?.relativePath ?? textPreview?.relativePath ?? null
  const activeDocumentDirty = Boolean(
    activeDocumentPath && textFileDrafts[activeDocumentPath]
  )

  useEffect(() => {
    void window.eidosLite.setActivePublicationSource(
      activeFile?.relativePath ?? null
    )
    return () => {
      void window.eidosLite.setActivePublicationSource(null)
    }
  }, [activeFile?.relativePath, space?.id])

  const updateTextFileDraft = useCallback(
    (relativePath: string, draft: TextFileDraft | null) => {
      setTextFileDrafts((current) => {
        if (draft) return { ...current, [relativePath]: draft }
        if (!(relativePath in current)) return current
        const next = { ...current }
        delete next[relativePath]
        return next
      })
    },
    []
  )

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (sidebarCollapsed || event.button !== 0) return
      event.preventDefault()
      const startX = event.clientX
      const startWidth = sidebarWidth
      const pointerId = event.pointerId
      const resizer = event.currentTarget
      resizer.setPointerCapture(pointerId)
      flushSync(() => setSidebarResizing(true))
      document.documentElement.classList.add("resizing-space-sidebar")

      const move = (pointerEvent: PointerEvent) => {
        setSidebarWidth(
          clampSidebarWidth(startWidth + pointerEvent.clientX - startX)
        )
      }
      const cleanup = () => {
        document.documentElement.classList.remove("resizing-space-sidebar")
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", stop)
        window.removeEventListener("pointercancel", stop)
        resizer.removeEventListener("lostpointercapture", cleanup)
        setSidebarResizing(false)
      }
      const stop = () => {
        cleanup()
        if (resizer.hasPointerCapture(pointerId)) {
          resizer.releasePointerCapture(pointerId)
        }
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", stop)
      window.addEventListener("pointercancel", stop)
      resizer.addEventListener("lostpointercapture", cleanup)
    },
    [sidebarCollapsed, sidebarWidth]
  )

  const adjustSidebarWidth = useCallback((delta: number) => {
    setSidebarWidth((current) => clampSidebarWidth(current + delta))
  }, [])

  const startUtilityPanelResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      const pointerId = event.pointerId
      const resizer = event.currentTarget
      const maximum = maximumUtilityPanelWidth(resizer.parentElement)
      const startX = event.clientX
      const startWidth = clampUtilityPanelWidth(utilityPanelWidth, maximum)
      resizer.setPointerCapture(pointerId)
      flushSync(() => setUtilityPanelResizing(true))
      document.documentElement.classList.add("resizing-utility-panel")

      const move = (pointerEvent: PointerEvent) => {
        setUtilityPanelWidth(
          clampUtilityPanelWidth(
            startWidth + startX - pointerEvent.clientX,
            maximum
          )
        )
      }
      const cleanup = () => {
        document.documentElement.classList.remove("resizing-utility-panel")
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", stop)
        window.removeEventListener("pointercancel", stop)
        resizer.removeEventListener("lostpointercapture", cleanup)
        setUtilityPanelResizing(false)
      }
      const stop = () => {
        cleanup()
        if (resizer.hasPointerCapture(pointerId)) {
          resizer.releasePointerCapture(pointerId)
        }
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", stop)
      window.addEventListener("pointercancel", stop)
      resizer.addEventListener("lostpointercapture", cleanup)
    },
    [utilityPanelWidth]
  )

  const adjustUtilityPanelWidth = useCallback(
    (delta: number, container: HTMLElement | null) => {
      const maximum = maximumUtilityPanelWidth(container)
      setUtilityPanelWidth((current) =>
        clampUtilityPanelWidth(current + delta, maximum)
      )
    },
    []
  )

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
        try {
          const preview = await window.eidosLite.previewTextFile(
            entry.relativePath
          )
          await prepareTextFilePreview(preview)
          setActiveSession(null)
          setTextPreview(preview)
          rememberOpenedEntry(entry)
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
        await loadEidosFileWorkbench()
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
          setTextPreview(null)
          setActiveSession(opened.sessionId)
          rememberOpenedEntry(entry)
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
        setTextPreview(null)
        setActiveSession(opened.sessionId)
        rememberOpenedEntry(entry)
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
    [cachedFiles, recordNavigationLocation, rememberOpenedEntry]
  )

  const openRecentFile = useCallback(
    async (recent: RecentFileEntry) => {
      if (!space) return
      setError(null)
      try {
        let currentSpace = space
        let directoryPath = ""
        for (const segment of recent.relativePath.split("/").slice(0, -1)) {
          directoryPath = directoryPath
            ? `${directoryPath}/${segment}`
            : segment
          const directory = findSpaceEntry(currentSpace.entries, directoryPath)
          if (directory?.kind !== "directory") break
          if (directory.childrenLoaded) continue
          currentSpace = await window.eidosLite.loadSpaceDirectory(
            directory.relativePath
          )
          acceptSpaceSnapshot(currentSpace)
        }

        const entry = findSpaceEntry(currentSpace.entries, recent.relativePath)
        if (!entry || entry.kind === "directory") {
          updateRecentFilePaths(recent.relativePath, null)
          setError(
            t("{name} is no longer available in this Space.", {
              name: recent.name,
            })
          )
          return
        }
        setSelectedEntry(entry)
        await openEntry(entry)
      } catch (cause) {
        setError(errorMessage(cause))
      }
    },
    [acceptSpaceSnapshot, openEntry, space, t, updateRecentFilePaths]
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
            const currentSpace = launchSpace.current
            const resolved = currentSpace
              ? await resolveSpaceEntry(
                  currentSpace,
                  relativePath,
                  (directoryPath) =>
                    window.eidosLite.loadSpaceDirectory(directoryPath),
                  () => window.eidosLite.refreshExplorer()
                )
              : null
            if (resolved && resolved.snapshot !== currentSpace) {
              launchSpace.current = resolved.snapshot
              launchAcceptSpaceSnapshot.current(resolved.snapshot)
            }
            const entry = resolved?.entry ?? null
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

  const toggleTheme = useCallback(() => {
    setError(null)
    void window.eidosLite
      .updatePreferences({ appearance: toggledAppearance(theme) })
      .catch((cause) => setError(errorMessage(cause)))
  }, [theme])

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
    const handleKeyboardShortcut = (
      workspaceShortcut: EidosLiteShortcutCommand
    ) => {
      if (workspaceShortcut === "new-file" && space) {
        if (
          !pathDialog &&
          !pathMutationBusy &&
          !blocksLocalInteraction(space.operation.phase)
        ) {
          setPathDialog({ action: "create-file", entry: selectedEntry })
        }
        return
      }
      if (workspaceShortcut === "quick-open" && space) {
        setQuickOpenVisible((current) => !current)
        return
      }
      if (workspaceShortcut === "toggle-theme") {
        toggleTheme()
        return
      }
      if (space) {
        if (workspaceShortcut === "toggle-version" && !space.graft.available) {
          return
        }
        if (workspaceShortcut === "toggle-sidebar") toggleSidebar()
        else if (workspaceShortcut === "toggle-version") toggleVersionPanel()
        else if (workspaceShortcut === "toggle-sync") toggleSyncPanel()
      }
    }
    const unsubscribeShortcut = window.eidosLite.onWorkspaceShortcutCommand(
      handleKeyboardShortcut
    )
    const unsubscribeNavigation = window.eidosLite.onNavigationCommand(
      (direction) => navigateHistory(direction === "back" ? -1 : 1)
    )
    return () => {
      unsubscribeShortcut()
      unsubscribeNavigation()
    }
  }, [
    navigateHistory,
    pathDialog,
    pathMutationBusy,
    selectedEntry,
    space,
    toggleSidebar,
    toggleSyncPanel,
    toggleTheme,
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
          updateRecentFilePaths(relativePath, result.relativePath)
        }
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
    [
      activeDocumentPath,
      applyPathMutation,
      recordNavigationLocation,
      updateRecentFilePaths,
    ]
  )

  const renameTreeEntry = useCallback(
    async (entry: SpaceTreeEntry, name: string) => {
      setPathMutationBusy(true)
      setError(null)
      const activePathMoved = pathMatchesPrefix(
        activeDocumentPath,
        entry.relativePath
      )
      try {
        const result = await window.eidosLite.renamePath(
          entry.relativePath,
          name
        )
        applyPathMutation(result)
        if (result.relativePath) {
          updateRecentFilePaths(entry.relativePath, result.relativePath)
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
    [
      activeDocumentPath,
      applyPathMutation,
      recordNavigationLocation,
      updateRecentFilePaths,
    ]
  )

  const submitPathDialog = useCallback(
    async (value: string) => {
      if (!pathDialog) return
      setPathMutationBusy(true)
      setError(null)
      try {
        let result: SpacePathMutationResult
        switch (pathDialog.action) {
          case "create-file":
            result =
              eidosLiteNewFileKind(value) === "text"
                ? await window.eidosLite.createTextFile(
                    parentPath(pathDialog.entry),
                    value
                  )
                : await window.eidosLite.createEidosFile(
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
          case "delete":
            if (!pathDialog.entry) throw new Error("Choose a Space item")
            result = await window.eidosLite.deletePath(
              pathDialog.entry.relativePath
            )
            break
        }
        applyPathMutation(result)
        if (pathDialog.entry && pathDialog.action === "delete") {
          updateRecentFilePaths(pathDialog.entry.relativePath, null)
        }
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
        if (pathDialog.action === "create-file" && result.relativePath) {
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
      updateRecentFilePaths,
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
              platform={platform}
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

  const mergeConflictCount =
    syncMergeStatus.state === "merging" ? syncMergeStatus.unmergedCount : 0
  const versionChangeCount =
    mergeConflictCount > 0
      ? mergeConflictCount
      : space.graft.initialized && space.graft.clean === false
        ? Math.max(1, space.graft.changedPaths ?? 1)
        : 0
  const versionChangeLabel =
    versionChangeCount > 99 ? "99+" : String(versionChangeCount)
  const localInteractionBlocked = blocksLocalInteraction(space.operation.phase)
  const titlebarPresentation = fileTitlebarPresentation(
    space.name,
    activeDocumentPath,
    busyFile
  )

  return (
    <div
      className="workbench"
      data-platform={platform}
      data-service-environment={appInfo?.services.name ?? "unknown"}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      style={
        {
          "--space-sidebar-width": `${sidebarWidth}px`,
          "--space-sidebar-track-width": sidebarCollapsed
            ? "0px"
            : `${sidebarWidth}px`,
          "--utility-panel-width": `${utilityPanelWidth}px`,
        } as CSSProperties
      }
    >
      <aside className="space-sidebar" aria-hidden={sidebarCollapsed}>
        <header className="sidebar-header">
          <TitlebarNavigation
            collapsed={false}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            keyboardShortcuts={keyboardShortcuts}
            macos={macos}
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
            aria-label={t("Space file actions")}
          >
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setPathDialog({ action: "create-file", entry: selectedEntry })
              }
              aria-label={t("New File")}
              aria-keyshortcuts={workspaceShortcutAriaKeyShortcuts(
                "new-file",
                macos,
                keyboardShortcuts
              )}
              title={shortcutTitle(t("New File"), newFileShortcutLabel)}
              disabled={pathMutationBusy || localInteractionBlocked}
            >
              <FilePlus2 />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setPathDialog({ action: "create-folder", entry: selectedEntry })
              }
              aria-label={t("New folder")}
              title={t("New folder")}
              disabled={pathMutationBusy || localInteractionBlocked}
            >
              <FolderPlus />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => void importFiles()}
              aria-label={t("Import files")}
              title={t("Import files")}
              disabled={pathMutationBusy || localInteractionBlocked}
            >
              <Upload />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                void window.eidosLite.refreshExplorer().then(setSpace)
              }
              aria-label={t("Refresh Space Explorer")}
              title={t("Refresh Space Explorer")}
            >
              <RefreshCw />
            </button>
          </div>
        </div>
        <nav className="explorer" aria-label={`${space.name} files`}>
          <Suspense
            fallback={
              <p className="explorer-busy" role="status">
                <LoaderCircle className="spin" /> {t("Loading Space Explorer…")}
              </p>
            }
          >
            <SpaceFileTree
              key={space.id}
              entries={space.entries}
              activePath={activeDocumentPath}
              disabled={localInteractionBlocked || busyFile !== null}
              renameRequest={treeRenameRequest}
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
              onRename={renameTreeEntry}
              onRenameError={(cause) =>
                setError(`Could not rename item. ${errorMessage(cause)}`)
              }
              onContextMenu={(entry, x, y) => {
                void refreshPublicationBindings()
                setContextMenu({
                  entry,
                  x: Math.max(8, Math.min(x, window.innerWidth - 200)),
                  y: Math.max(8, Math.min(y, window.innerHeight - 260)),
                })
              }}
            />
          </Suspense>
          {busyFile ? (
            <p className="explorer-busy">
              <LoaderCircle className="spin" /> Opening {busyFile}
            </p>
          ) : null}
        </nav>
        <footer className="sidebar-footer">
          {isSidebarUpdateReady(updateStatus) ? (
            <SidebarUpdateAction
              label={t("Restart to update")}
              description={t("Version {version} is ready to install.", {
                version: updateStatus.version ?? "",
              })}
              onRestart={() => void window.eidosLite.restartToInstallUpdate()}
            />
          ) : null}
          <button
            type="button"
            className="sidebar-settings-button"
            data-sidebar-action="settings"
            aria-label={t("Settings")}
            aria-keyshortcuts={macos ? "Meta+," : "Control+,"}
            onClick={() => void window.eidosLite.openSettings()}
            title={`${t("Settings")} (${macos ? "⌘," : "Ctrl+,"})`}
          >
            <Settings aria-hidden="true" />
            <span>{t("Settings")}</span>
            <kbd aria-hidden="true">{macos ? "⌘," : "Ctrl+,"}</kbd>
          </button>
        </footer>
      </aside>

      <div
        className="sidebar-resizer"
        data-sidebar-resizer
        role="separator"
        aria-label={t("Resize Space Explorer")}
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
              keyboardShortcuts={keyboardShortcuts}
              macos={macos}
              onToggle={toggleSidebar}
              onBack={() => navigateHistory(-1)}
              onForward={() => navigateHistory(1)}
            />
          ) : null}
          <div className="file-titlebar-identity">
            <div>
              <strong>{titlebarPresentation.title}</strong>
              {activeDocumentDirty && !titlebarPresentation.pending ? (
                <span
                  className="file-titlebar-dirty"
                  aria-label={t("Unsaved changes")}
                  title={t("Unsaved changes")}
                />
              ) : null}
            </div>
            {activeDocumentPath && !titlebarPresentation.pending ? (
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
            aria-label={t("Space actions")}
          >
            <button
              type="button"
              className="icon-button titlebar-tool-button"
              data-titlebar-action="version"
              data-version-change-count={versionChangeCount}
              disabled={!space.graft.available}
              aria-pressed={versionPanelOpen}
              aria-keyshortcuts={workspaceShortcutAriaKeyShortcuts(
                "toggle-version",
                macos,
                keyboardShortcuts
              )}
              aria-label={
                space.graft.checking
                  ? "Checking version history"
                  : !space.graft.available
                    ? "Version history unavailable"
                    : mergeConflictCount > 0
                      ? `Changes, ${mergeConflictCount} unresolved merge ${mergeConflictCount === 1 ? "conflict" : "conflicts"}`
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
                    : mergeConflictCount > 0
                      ? `${mergeConflictCount} unresolved merge ${mergeConflictCount === 1 ? "conflict" : "conflicts"}`
                      : versionChangeCount > 0
                        ? `${versionChangeCount} changed ${versionChangeCount === 1 ? "file" : "files"}`
                        : space.graft.initialized
                          ? "Version history"
                          : "Set up version history",
                versionShortcutLabel
              )}
            >
              {syncMergeStatus.state === "merging" ? <GitMerge /> : <History />}
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
              aria-keyshortcuts={workspaceShortcutAriaKeyShortcuts(
                "toggle-sync",
                macos,
                keyboardShortcuts
              )}
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
              aria-label={t("Dismiss error")}
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
          className={`editor-work-area${versionPanelOpen || syncPanelMode ? " with-utility-panel" : ""}`}
        >
          {versionPanelOpen && syncMergeStatus.state === "merging" ? (
            <Suspense
              fallback={
                <div className="editor-empty" role="status">
                  <LoaderCircle className="spin" aria-hidden="true" />
                  <p>{t("Loading merge conflicts…")}</p>
                </div>
              }
            >
              <SyncMergeWorkbench
                initialStatus={syncMergeStatus}
                theme={theme}
                onClose={() => setVersionPanelOpen(false)}
                onStatusChange={(merge) => {
                  setSyncMergeStatus(merge)
                  if (merge.state === "none") {
                    setVersionInspection(null)
                    setVersionRefreshKey((current) => current + 1)
                  }
                }}
                onFilesMaterialized={refreshMaterializedFiles}
              />
            </Suspense>
          ) : (
            <>
              <div className="editor-work-content">
                {versionPanelOpen && versionInspection ? (
                  <Suspense
                    fallback={
                      <div className="editor-empty" role="status">
                        <LoaderCircle className="spin" aria-hidden="true" />
                        <p>{t("Loading change details…")}</p>
                      </div>
                    }
                  >
                    <VersionDiffPreview
                      inspection={versionInspection}
                      theme={theme}
                      onClose={() => setVersionInspection(null)}
                      onNavigate={setVersionInspection}
                    />
                  </Suspense>
                ) : textPreview ? (
                  textPreview.type === "media" ? (
                    <MediaFilePreview
                      preview={textPreview}
                      platform={platform}
                      onReveal={() =>
                        void window.eidosLite
                          .revealPath(textPreview.relativePath)
                          .catch((cause) => setError(errorMessage(cause)))
                      }
                    />
                  ) : (
                    <TextFilePreview
                      preview={textPreview}
                      draft={textFileDrafts[textPreview.relativePath]}
                      theme={theme}
                      platform={platform}
                      nativePreviewSuppressed={
                        quickOpenVisible ||
                        Boolean(pathDialog) ||
                        sidebarResizing ||
                        utilityPanelResizing
                      }
                      onSaved={(file) =>
                        setTextPreview((current) =>
                          current?.relativePath === file.relativePath
                            ? file
                            : current
                        )
                      }
                      onReload={(preview) =>
                        setTextPreview((current) =>
                          current?.relativePath === preview.relativePath
                            ? preview
                            : current
                        )
                      }
                      onDraftChange={updateTextFileDraft}
                      onReveal={() =>
                        void window.eidosLite
                          .revealPath(textPreview.relativePath)
                          .catch((cause) => setError(errorMessage(cause)))
                      }
                    />
                  )
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
                          <p>{t("Loading Eidos File editor…")}</p>
                        </div>
                      }
                    >
                      <EidosFileWorkbench
                        key={`${activeFile.sessionId}:${fileMaterializationKey}`}
                        relativePath={activeFile.relativePath}
                        snapshot={activeFile.snapshot}
                        source={activeFile.source}
                        activeTableId={activeFile.tableId}
                        disabled={localInteractionBlocked}
                        theme={theme}
                        weekStartsOnMonday={weekStartsOnMonday}
                        timeZone={timeZone === "system" ? undefined : timeZone}
                        keyboardShortcuts={keyboardShortcuts}
                        macos={macos}
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
                ) : recentFiles.length === 0 &&
                  space.eidosFileCount === 0 &&
                  !spaceTreeIncomplete ? (
                  <section
                    className="editor-empty editor-empty-onboarding"
                    data-empty-space-onboarding
                  >
                    <Database aria-hidden="true" />
                    <h2>{t("Create your first Eidos File")}</h2>
                    <p>
                      {t(
                        "Start with a local {extension} file inside this Space. It remains an ordinary file you own and can move or back up.",
                        { extension: ".eidos" }
                      )}
                    </p>
                    <button
                      type="button"
                      className="editor-empty-action"
                      data-create-first-eidos
                      disabled={pathMutationBusy || localInteractionBlocked}
                      onClick={() =>
                        setPathDialog({ action: "create-file", entry: null })
                      }
                    >
                      <FilePlus2 /> {t("New Eidos File")}
                    </button>
                  </section>
                ) : (
                  <RecentFilesEmptyState
                    files={recentFiles}
                    busyPath={busyFile}
                    onOpen={(file) => void openRecentFile(file)}
                  />
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
                    onRefresh={() =>
                      setVersionRefreshKey((current) => current + 1)
                    }
                    onInspectionChange={setVersionInspection}
                  />
                </Suspense>
              ) : null}
            </>
          )}
          {syncPanelMode ? (
            <Suspense fallback={null}>
              <SyncPanel
                mode={syncPanelMode}
                variant="inspector"
                platform={platform}
                cacheKey={space.id}
                hasUncheckpointedChanges={
                  syncMergeStatus.state !== "merging" &&
                  space.graft.initialized &&
                  space.graft.clean === false
                }
                syncHistory={space.graft.sync}
                onClose={() => setSyncPanelMode(null)}
                onRequestClone={() => setSyncPanelMode("clone")}
                onReviewLocal={() => {
                  setSyncPanelMode(null)
                  setVersionPanelOpen(true)
                  setVersionInspection(null)
                }}
                onMergeStatusChange={setSyncMergeStatus}
                onReviewMerge={() => {
                  setSyncPanelMode(null)
                  setVersionInspection(null)
                  setVersionPanelOpen(true)
                }}
                onSpaceChange={acceptSpaceSnapshot}
                onFilesMaterialized={refreshMaterializedFiles}
              />
            </Suspense>
          ) : null}
          {versionPanelOpen || syncPanelMode ? (
            <div
              className="utility-panel-resizer"
              data-utility-panel-resizer
              role="separator"
              aria-label={t(
                syncPanelMode ? "Resize Sync panel" : "Resize Versions panel"
              )}
              aria-orientation="vertical"
              aria-valuemin={MIN_UTILITY_PANEL_WIDTH}
              aria-valuemax={MAX_UTILITY_PANEL_WIDTH}
              aria-valuenow={utilityPanelWidth}
              tabIndex={0}
              onPointerDown={startUtilityPanelResize}
              onDoubleClick={(event) =>
                setUtilityPanelWidth(
                  clampUtilityPanelWidth(
                    DEFAULT_UTILITY_PANEL_WIDTH,
                    maximumUtilityPanelWidth(event.currentTarget.parentElement)
                  )
                )
              }
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                  return
                }
                event.preventDefault()
                const step = event.shiftKey ? 32 : 16
                adjustUtilityPanelWidth(
                  event.key === "ArrowLeft" ? step : -step,
                  event.currentTarget.parentElement
                )
              }}
            />
          ) : null}
        </div>
      </main>
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
              {contextMenu.entry.kind === "eidos" ? t("Open") : t("Preview")}
            </button>
          ) : null}
          {isPublishableEntry(contextMenu.entry) ? (
            <button
              type="button"
              role="menuitem"
              disabled={localInteractionBlocked}
              onClick={() => {
                if (publishTask?.status === "running") {
                  setPublishTaskExpanded(true)
                } else {
                  setPublishTask(null)
                  setPublishPanel({
                    entry: contextMenu.entry,
                    x: contextMenu.x,
                    y: contextMenu.y,
                  })
                }
                setContextMenu(null)
              }}
            >
              {publishTask?.status === "running" ? (
                <LoaderCircle className="spin" />
              ) : (
                <Upload />
              )}{" "}
              {publishTask?.status === "running"
                ? t("View Publish progress")
                : publicationBindings.some(
                      (binding) =>
                        binding.relativePath === contextMenu.entry.relativePath
                    )
                  ? t("Manage Publish…")
                  : t("Publish…")}
            </button>
          ) : null}
          {contextMenu.entry.kind === "directory" ? (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={pathMutationBusy || localInteractionBlocked}
                onClick={() => {
                  setPathDialog({
                    action: "create-file",
                    entry: contextMenu.entry,
                  })
                  setContextMenu(null)
                }}
              >
                <FilePlus2 /> {t("New File")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={pathMutationBusy || localInteractionBlocked}
                onClick={() => {
                  setPathDialog({
                    action: "create-folder",
                    entry: contextMenu.entry,
                  })
                  setContextMenu(null)
                }}
              >
                <FolderPlus /> {t("New folder")}
              </button>
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setTreeRenameRequest({
                treePath:
                  contextMenu.entry.kind === "directory"
                    ? `${contextMenu.entry.relativePath}/`
                    : contextMenu.entry.relativePath,
                nonce: Date.now(),
              })
              setContextMenu(null)
            }}
          >
            <Pencil /> {t("Rename")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void window.eidosLite.copyPathText(
                contextMenu.entry.relativePath,
                "absolute"
              )
              setContextMenu(null)
            }}
          >
            <Copy /> {t("Copy Path")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void window.eidosLite.copyPathText(
                contextMenu.entry.relativePath,
                "relative"
              )
              setContextMenu(null)
            }}
          >
            <ClipboardCopy /> {t("Copy Relative Path")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void window.eidosLite.revealPath(contextMenu.entry.relativePath)
              setContextMenu(null)
            }}
          >
            <FolderOpen /> {t(fileManagerMessage(platform))}
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
            <Trash2 /> {t("Move to Trash")}
          </button>
        </div>
      ) : null}
      {publishPanel ? (
        <PublishPanel
          key={publishPanel.entry.relativePath}
          entry={publishPanel.entry}
          formViews={
            activeFile?.relativePath === publishPanel.entry.relativePath
              ? activeFile.snapshot.tables.flatMap((table) =>
                  table.views
                    .filter((view) => view.type === "form")
                    .map((view) => ({
                      id: view.id,
                      name: view.name,
                      tableName: table.table.name,
                    }))
                )
              : []
          }
          bindings={publicationBindings.filter(
            (binding) =>
              binding.relativePath === publishPanel.entry.relativePath
          )}
          x={publishPanel.x}
          y={publishPanel.y}
          onPublish={(options) =>
            startPublish(
              publishPanel.entry,
              publishPanel.x,
              publishPanel.y,
              options
            )
          }
          onCollect={collectPublicationBinding}
          onClose={() => setPublishPanel(null)}
        />
      ) : null}
      {publishTask ? (
        <PublishTaskDock
          task={publishTask}
          expanded={publishTaskExpanded}
          onExpandedChange={setPublishTaskExpanded}
          onDismiss={() => {
            setPublishTask(null)
            setPublishTaskExpanded(false)
          }}
          onRetry={() => {
            setPublishPanel({
              entry: publishTask.entry,
              x: publishTask.anchorX,
              y: publishTask.anchorY,
            })
            setPublishTask(null)
            setPublishTaskExpanded(false)
          }}
          onCollect={() => {
            const result = publishTask.result
            if (!result || result.driverId !== "org.eidos.driver.form") return
            const requestId = crypto.randomUUID()
            setPublishTask((current) =>
              current
                ? { ...current, collection: { status: "running" } }
                : current
            )
            void window.eidosLite
              .collectPublishedForm({
                requestId,
                relativePath: publishTask.entry.relativePath,
                publicationId: result.publicationId,
              })
              .then((response) => {
                void refreshPublicationBindings()
                setPublishTask((current) =>
                  !current ||
                  current.result?.publicationId !== result.publicationId
                    ? current
                    : response.ok
                      ? {
                          ...current,
                          collection: {
                            status: "succeeded",
                            imported: response.result.importedSubmissions,
                          },
                        }
                      : {
                          ...current,
                          collection: {
                            status: "failed",
                            message: response.failure.message,
                          },
                        }
                )
              })
              .catch((cause: unknown) => {
                setPublishTask((current) =>
                  !current ||
                  current.result?.publicationId !== result.publicationId
                    ? current
                    : {
                        ...current,
                        collection: {
                          status: "failed",
                          message:
                            cause instanceof Error
                              ? cause.message
                              : String(cause),
                        },
                      }
                )
              })
          }}
        />
      ) : null}
      {quickOpenVisible && space ? (
        <QuickOpen
          recentFiles={recentFiles}
          activeTableSource={
            activeFile
              ? {
                  relativePath: activeFile.relativePath,
                  tables: activeFile.snapshot.tables.map((table) => ({
                    tableId: table.table.id,
                    name: table.table.name,
                  })),
                }
              : null
          }
          onClose={() => setQuickOpenVisible(false)}
          onOpen={(selection) => {
            setQuickOpenVisible(false)
            void openEntry({
              ...selection,
              size: 0,
              modifiedAtMs: 0,
            })
          }}
          onOpenTable={(tableId) => {
            setQuickOpenVisible(false)
            const sessionId = activeFile?.sessionId
            if (!sessionId) return
            setCachedFiles((current) =>
              current.map((file) =>
                file.sessionId === sessionId ? { ...file, tableId } : file
              )
            )
          }}
        />
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
