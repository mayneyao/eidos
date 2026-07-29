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
  CircleAlert,
  Cloud,
  CloudDownload,
  Copy,
  Database,
  FilePlus2,
  FolderInput,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitCommitHorizontal,
  HardDrive,
  History,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react"

import type {
  EidosFileIssue,
  EidosLiteAppInfo,
  EidosSyncQueueStatus,
  RecentSpaceEntry,
  SpacePathMutationResult,
  SpaceSnapshot,
  SpaceTreeEntry,
} from "../shared/contracts"
import { FileRecoveryNotice } from "./file-recovery-notice"
import { IpcEidosFileDataSource } from "./ipc-data-source"

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

interface CachedFile {
  sessionId: string
  relativePath: string
  snapshot: EidosFileSnapshot
  source: IpcEidosFileDataSource
  tableId: string
}

function useSystemTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  )
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const update = () => setTheme(media.matches ? "dark" : "light")
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return theme
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
        {appInfo?.services.name === "staging" ? (
          <span
            className="environment-badge"
            data-service-environment="staging"
          >
            Staging
          </span>
        ) : null}
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
            <CloudDownload /> Clone Synced Space
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

export function App() {
  const theme = useSystemTheme()
  const [appInfo, setAppInfo] = useState<EidosLiteAppInfo | null>(null)
  const [space, setSpace] = useState<SpaceSnapshot | null>(null)
  const [cachedFiles, setCachedFiles] = useState<CachedFile[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [openingSpace, setOpeningSpace] = useState(false)
  const [recentSpaces, setRecentSpaces] = useState<RecentSpaceEntry[]>([])
  const [busyFile, setBusyFile] = useState<string | null>(null)
  const [versionBusy, setVersionBusy] = useState<
    "enable" | "checkpoint" | null
  >(null)
  const [versionPanelOpen, setVersionPanelOpen] = useState(false)
  const [syncPanelMode, setSyncPanelMode] = useState<"enable" | "clone" | null>(
    null
  )
  const [syncQueueStatus, setSyncQueueStatus] =
    useState<EidosSyncQueueStatus | null>(null)
  const [versionRefreshKey, setVersionRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fileIssue, setFileIssue] = useState<EidosFileIssue | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(storedSidebarWidth)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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
    async (entry: SpaceTreeEntry) => {
      if (entry.kind !== "eidos") {
        await window.eidosLite.openPath(entry.relativePath)
        return
      }
      if (fileOpenInFlight.current) return
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
          return
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
      } catch (cause) {
        const issue = await window.eidosLite
          .inspectEidosFileIssue(entry.relativePath)
          .catch(() => null)
        if (issue) setFileIssue(issue)
        else setError(`Could not open ${entry.name}. ${errorMessage(cause)}`)
      } finally {
        fileOpenInFlight.current = false
        setBusyFile(null)
      }
    },
    [cachedFiles]
  )

  const launchSpace = useRef(space)
  const launchOpenEntry = useRef(openEntry)
  useEffect(() => {
    launchSpace.current = space
    launchOpenEntry.current = openEntry
  }, [openEntry, space])

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
    [applyPathMutation, openEntry, pathDialog]
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
  const runVersionAction = useCallback(
    async (action: "enable" | "checkpoint") => {
      setVersionBusy(action)
      setError(null)
      try {
        const snapshot =
          action === "enable"
            ? await window.eidosLite.enableVersioning()
            : await window.eidosLite.createCheckpoint()
        setSpace(snapshot)
        setVersionRefreshKey((current) => current + 1)
      } catch (cause) {
        setError(errorMessage(cause))
      } finally {
        setVersionBusy(null)
      }
    },
    []
  )

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
          onCopyDiagnostics={() => void copyDiagnostics()}
          diagnosticsCopied={diagnosticsCopied}
        />
        {syncPanelMode ? (
          <Suspense fallback={null}>
            <SyncPanel
              mode={syncPanelMode}
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
          <span>Explorer</span>
          <div>
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
            <button
              type="button"
              className="icon-button"
              data-sidebar-toggle="close"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Collapse Space Explorer"
              title="Collapse Space Explorer"
            >
              <PanelLeftClose />
            </button>
          </div>
        </header>
        <div className="space-heading">
          <strong>{space.name}</strong>
          <span>{space.eidosFileCount} Eidos Files</span>
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
              activePath={activeFile?.relativePath ?? null}
              disabled={space.operation.phase !== "ready" || busyFile !== null}
              onSelect={setSelectedEntry}
              onOpen={(entry) => void openEntry(entry)}
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
        <footer className="space-switcher">
          <HardDrive />
          <span>
            <strong>{space.name}</strong>
            <small title={space.displayPath}>{space.displayPath}</small>
          </span>
        </footer>
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
          <div className="file-titlebar-identity">
            {sidebarCollapsed ? (
              <button
                type="button"
                className="icon-button sidebar-open-button"
                data-sidebar-toggle="open"
                onClick={() => setSidebarCollapsed(false)}
                aria-label="Show Space Explorer"
                title="Show Space Explorer"
              >
                <PanelLeftOpen />
              </button>
            ) : null}
            <div>
              <strong>
                {activeFile ? fileName(activeFile.relativePath) : space.name}
              </strong>
              {activeFile &&
              activeFile.relativePath !== fileName(activeFile.relativePath) ? (
                <small>{activeFile.relativePath}</small>
              ) : null}
            </div>
            {activeFile ? (
              <button
                type="button"
                className="icon-button active-file-close"
                aria-label={`Close ${activeFile.relativePath}`}
                title={`Close ${activeFile.relativePath}`}
                onClick={() => void closeFile(activeFile.sessionId)}
              >
                <X />
              </button>
            ) : null}
          </div>
          <div className="file-titlebar-actions">
            {appInfo?.services.name === "staging" ? (
              <span
                className="environment-badge"
                data-service-environment="staging"
              >
                Staging
              </span>
            ) : null}
            <span className="local-state">Local files safe</span>
            <span className="status-separator">·</span>
            <span>
              {space.operation.phase === "ready"
                ? "Ready"
                : (space.operation.detail ?? space.operation.phase)}
            </span>
            <span className="status-separator">·</span>
            <span>
              {space.graft.initialized
                ? space.graft.clean
                  ? "Space version clean"
                  : "Local changes"
                : "Versioning off"}
            </span>
            {space.graft.available && !space.graft.initialized ? (
              <button
                type="button"
                className="version-action"
                disabled={
                  versionBusy !== null || space.operation.phase !== "ready"
                }
                onClick={() => void runVersionAction("enable")}
                title="Create a local Graft repository and checkpoint the whole Space. No account required."
              >
                {versionBusy === "enable" ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <GitBranch />
                )}
                {versionBusy === "enable" ? "Enabling…" : "Enable Versioning"}
              </button>
            ) : null}
            {space.graft.available &&
            space.graft.initialized &&
            space.graft.clean === false ? (
              <button
                type="button"
                className="version-action"
                disabled={
                  versionBusy !== null || space.operation.phase !== "ready"
                }
                onClick={() => void runVersionAction("checkpoint")}
                title="Checkpoint all local changes in this Space. No sync or account is involved."
              >
                {versionBusy === "checkpoint" ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <GitCommitHorizontal />
                )}
                {versionBusy === "checkpoint"
                  ? "Creating…"
                  : "Create Checkpoint"}
              </button>
            ) : null}
            {space.graft.initialized ? (
              <button
                type="button"
                className="version-action"
                aria-pressed={versionPanelOpen}
                onClick={() => setVersionPanelOpen((current) => !current)}
                title="View whole-Space changes and checkpoint history"
              >
                <History />
                {versionPanelOpen ? "Close History" : "Version History"}
              </button>
            ) : null}
            <button
              type="button"
              className="version-action"
              data-sync-queue-state={syncQueueStatus?.state ?? "idle"}
              aria-pressed={syncPanelMode === "enable"}
              onClick={() => {
                setVersionPanelOpen(false)
                setSyncPanelMode((current) =>
                  current === "enable" ? null : "enable"
                )
              }}
              title="Connect the whole Space to the official Eidos Hosted Remote"
            >
              {syncQueueStatus?.state === "running" ? (
                <LoaderCircle className="spin" />
              ) : (
                <Cloud />
              )}
              {syncQueueLabel(syncQueueStatus)}
            </button>
            <button
              type="button"
              className="icon-button"
              data-copy-diagnostics
              onClick={() => void copyDiagnostics()}
              aria-label={
                diagnosticsCopied ? "Diagnostics copied" : "Copy diagnostics"
              }
              title={
                diagnosticsCopied
                  ? "Diagnostics copied"
                  : "Copy privacy-safe diagnostics"
              }
            >
              <Copy />
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
            onReviewHistory={() => setVersionPanelOpen(true)}
            onDismiss={() => setFileIssue(null)}
          />
        ) : null}

        <div
          className={`editor-work-area${versionPanelOpen ? " with-version-panel" : ""}`}
        >
          <div className="editor-work-content">
            {activeFile && activeTable ? (
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
                    key={activeFile.sessionId}
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
            ) : space.eidosFileCount === 0 ? (
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
          {versionPanelOpen && space.graft.initialized ? (
            <Suspense fallback={null}>
              <VersionPanel
                space={space}
                refreshKey={versionRefreshKey}
                onClose={() => setVersionPanelOpen(false)}
                onSpaceChange={setSpace}
                onRefresh={() => setVersionRefreshKey((current) => current + 1)}
              />
            </Suspense>
          ) : null}
        </div>
      </main>
      {syncPanelMode ? (
        <Suspense fallback={null}>
          <SyncPanel
            mode={syncPanelMode}
            onClose={() => setSyncPanelMode(null)}
            onRequestClone={() => setSyncPanelMode("clone")}
            onReviewLocal={() => {
              setSyncPanelMode(null)
              setVersionPanelOpen(true)
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
              <FolderOpen /> Open
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
