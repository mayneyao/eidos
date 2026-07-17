import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import type {
  BaseFieldInfo,
  BaseFieldType,
  BaseRowMutationResult,
  BaseSnapshot,
  CreateBaseFieldInput,
} from "@eidos.space/base"
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CloudOff,
  Download,
  FileKey,
  FileSpreadsheet,
  FolderOpen,
  LoaderCircle,
  Moon,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react"

import { BaseGrid } from "./components/base-grid"
import {
  deleteRecoverySession,
  getLatestRecoverySession,
  storeRecoverySession,
  type RecoverySession,
} from "./files/recovery-store"
import {
  downloadBaseCopy,
  openImportedBaseFile,
  pickDirectBaseFile,
  pickSaveHandle,
  queryWritePermission,
  readHandleVersion,
  requestWritePermission,
  sameFileVersion,
  supportsDirectFileAccess,
  supportsSavePicker,
  writeAndVerifyHandle,
  type BaseFileVersion,
  type FileAccessMode,
  type FileWritePermission,
  type OpenedBrowserFile,
} from "./files/browser-file-adapter"
import { BaseWorkerClient } from "./runtime/worker-client"
import {
  canSaveToOriginal,
  hasUnsavedChanges,
  initialSaveState,
  saveReducer,
} from "./state/save-machine"

interface OpenSession {
  id: string
  fileName: string
  mode: FileAccessMode
  permission: FileWritePermission
  sourceVersion: BaseFileVersion
  handle?: FileSystemFileHandle
  storage: "opfs-sahpool" | "memory"
}

type Theme = "light" | "dark"

const SAMPLE_BASE_URL = new URL(
  "../fixtures/project-tracker.base",
  import.meta.url
).href

const MUTABLE_FIELD_TYPES: Array<{
  value: Exclude<
    BaseFieldType,
    | "title"
    | "formula"
    | "link"
    | "lookup"
    | "created-time"
    | "created-by"
    | "last-edited-time"
    | "last-edited-by"
    | "row-id"
  >
  label: string
}> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "url", label: "URL" },
  { value: "rating", label: "Rating" },
  { value: "select", label: "Select" },
  { value: "multi-select", label: "Multi-select" },
  { value: "file", label: "File" },
]

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The operation did not complete. Your recoverable working copy is unchanged."
}

function initialTheme(): Theme {
  const stored = localStorage.getItem("eidos-base-theme")
  if (stored === "light" || stored === "dark") return stored
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function statusPresentation(
  phase: ReturnType<typeof saveReducer>["phase"],
  mode: FileAccessMode | null
): { label: string; tone: string; icon: typeof Check } {
  switch (phase) {
    case "opening":
      return {
        label: "Opening local file…",
        tone: "neutral",
        icon: LoaderCircle,
      }
    case "dirty":
      return {
        label: mode === "copy" ? "Changes stay in browser" : "Unsaved changes",
        tone: "warning",
        icon: CloudOff,
      }
    case "saving":
      return { label: "Saving Base…", tone: "neutral", icon: LoaderCircle }
    case "saved":
      return {
        label: mode === "copy" ? "Downloaded a copy" : "Saved to original",
        tone: "success",
        icon: Check,
      }
    case "error":
      return {
        label: "Save needs attention",
        tone: "danger",
        icon: AlertTriangle,
      }
    case "conflict":
      return { label: "Original changed", tone: "danger", icon: AlertTriangle }
    default:
      return {
        label: mode === "copy" ? "Imported copy" : "Saved",
        tone: "success",
        icon: Check,
      }
  }
}

function updateSnapshotRowCount(
  snapshot: BaseSnapshot,
  result: BaseRowMutationResult
): BaseSnapshot {
  return {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      updatedAt: result.revision ?? snapshot.metadata.updatedAt,
    },
    tables: snapshot.tables.map((table) =>
      table.table.id === result.tableId
        ? { ...table, rowCount: result.rowCount }
        : table
    ),
  }
}

export function App() {
  const [saveState, dispatch] = useReducer(saveReducer, initialSaveState)
  const [snapshot, setSnapshot] = useState<BaseSnapshot | null>(null)
  const [session, setSession] = useState<OpenSession | null>(null)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [activeViews, setActiveViews] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<RecoverySession | null>(null)
  const [propertyField, setPropertyField] = useState<BaseFieldInfo | null>(null)
  const [addPropertyOpen, setAddPropertyOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const clientRef = useRef<BaseWorkerClient | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeTable = useMemo(
    () =>
      snapshot?.tables.find((table) => table.table.id === activeTableId) ??
      snapshot?.tables[0] ??
      null,
    [activeTableId, snapshot]
  )
  const activeView = useMemo(() => {
    if (!activeTable) return undefined
    const requested = activeViews[activeTable.table.id]
    return (
      activeTable.views.find((view) => view.id === requested) ??
      activeTable.views.find((view) => view.type === "grid") ??
      activeTable.views[0]
    )
  }, [activeTable, activeViews])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.dataset.theme = theme
    localStorage.setItem("eidos-base-theme", theme)
  }, [theme])

  useEffect(() => {
    void getLatestRecoverySession()
      .then(setRecovery)
      .catch((error) =>
        console.warn("Unable to read Base recovery metadata", error)
      )
  }, [])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges(saveState)) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => window.removeEventListener("beforeunload", beforeUnload)
  }, [saveState])

  useEffect(() => {
    if (saveState.phase !== "saved") return
    const timer = setTimeout(() => dispatch({ type: "SAVE_SETTLED" }), 1800)
    return () => clearTimeout(timer)
  }, [saveState.phase])

  const rememberRecovery = useCallback(async (current: OpenSession) => {
    const record: RecoverySession = {
      id: current.id,
      fileName: current.fileName,
      sourceVersion: current.sourceVersion,
      mode: current.mode,
      dirty: true,
      updatedAt: Date.now(),
      ...(current.handle ? { handle: current.handle } : {}),
    }
    try {
      await storeRecoverySession(record)
      setRecovery(record)
    } catch (error) {
      console.warn("Unable to persist Base recovery metadata", error)
    }
  }, [])

  const markCommitted = useCallback(
    (currentSession = session) => {
      dispatch({ type: "MUTATION_COMMITTED" })
      if (currentSession?.storage === "opfs-sahpool") {
        void rememberRecovery(currentSession)
      }
    },
    [rememberRecovery, session]
  )

  const confirmSwitch = useCallback(() => {
    if (!hasUnsavedChanges(saveState)) return true
    return window.confirm(
      "Open another Base and keep this recoverable working copy? The original file has not been updated."
    )
  }, [saveState])

  const installOpenResult = useCallback(
    async (
      client: BaseWorkerClient,
      opened: Omit<OpenSession, "storage">,
      result: Awaited<ReturnType<BaseWorkerClient["openSource"]>>
    ) => {
      const previous = clientRef.current
      clientRef.current = client
      previous?.terminate()
      const nextSession: OpenSession = { ...opened, storage: result.storage }
      setSession(nextSession)
      setSnapshot(result.snapshot)
      setActiveTableId(
        result.snapshot.metadata.defaultTableId ??
          result.snapshot.tables[0]?.table.id ??
          null
      )
      setActiveViews({})
      setSearch("")
      setPropertyField(null)
      setNotice(null)
      dispatch({
        type: "OPEN_SUCCESS",
        mode: nextSession.mode,
        permission: nextSession.permission,
        dirty: result.migrated || result.recovered,
      })
      if (result.migrated || result.recovered) {
        await rememberRecovery(nextSession)
      }
    },
    [rememberRecovery]
  )

  const openPreparedFile = useCallback(
    async (opened: OpenedBrowserFile) => {
      dispatch({ type: "OPEN_START" })
      const client = new BaseWorkerClient()
      const id = crypto.randomUUID()
      try {
        const result = await client.openSource(
          opened.fileName,
          id,
          opened.bytes
        )
        await installOpenResult(
          client,
          {
            id,
            fileName: opened.fileName,
            mode: opened.mode,
            permission: opened.permission,
            sourceVersion: opened.version,
            ...(opened.handle ? { handle: opened.handle } : {}),
          },
          result
        )
      } catch (error) {
        client.terminate()
        const message = errorMessage(error)
        setNotice(message)
        dispatch({ type: "OPEN_FAILURE", message })
      }
    },
    [installOpenResult]
  )

  const chooseFile = useCallback(async () => {
    if (!confirmSwitch()) return
    setNotice(null)
    if (!supportsDirectFileAccess()) {
      inputRef.current?.click()
      return
    }
    try {
      const opened = await pickDirectBaseFile()
      if (opened) await openPreparedFile(opened)
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }, [confirmSwitch, openPreparedFile])

  const openSample = useCallback(async () => {
    if (!confirmSwitch()) return
    setNotice(null)
    try {
      const response = await fetch(SAMPLE_BASE_URL)
      if (!response.ok) {
        throw new Error(
          `The sample Base could not be loaded (${response.status})`
        )
      }
      const file = new File(
        [await response.arrayBuffer()],
        "project-tracker.base",
        { type: "application/vnd.eidos.base+sqlite3" }
      )
      await openPreparedFile(await openImportedBaseFile(file))
    } catch (error) {
      const message = errorMessage(error)
      setNotice(message)
      dispatch({ type: "OPEN_FAILURE", message })
    }
  }, [confirmSwitch, openPreparedFile])

  const restoreRecovery = useCallback(async () => {
    if (!recovery || !confirmSwitch()) return
    dispatch({ type: "OPEN_START" })
    const client = new BaseWorkerClient()
    try {
      const permission = recovery.handle
        ? await queryWritePermission(recovery.handle)
        : "denied"
      const result = await client.openRecovery(recovery.fileName, recovery.id)
      await installOpenResult(
        client,
        {
          id: recovery.id,
          fileName: recovery.fileName,
          mode: recovery.mode,
          permission,
          sourceVersion: recovery.sourceVersion,
          ...(recovery.handle ? { handle: recovery.handle } : {}),
        },
        result
      )
      if (recovery.handle) {
        const disk = await readHandleVersion(recovery.handle)
        if (!sameFileVersion(disk.version, recovery.sourceVersion)) {
          dispatch({
            type: "CONFLICT",
            message:
              "The original file changed after this recovery copy was created. Save As, reload the original, or explicitly overwrite it.",
          })
        }
      }
    } catch (error) {
      client.terminate()
      const message = errorMessage(error)
      setNotice(message)
      dispatch({ type: "OPEN_FAILURE", message })
    }
  }, [confirmSwitch, installOpenResult, recovery])

  const discardRecovery = useCallback(async () => {
    if (!recovery) return
    const client = new BaseWorkerClient()
    try {
      await client.discardRecovery(recovery.id)
      await deleteRecoverySession(recovery.id)
      setRecovery(null)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      client.terminate()
    }
  }, [recovery])

  const clearRecoveryAfterSave = useCallback(async (id: string) => {
    try {
      await deleteRecoverySession(id)
      setRecovery((current) => (current?.id === id ? null : current))
    } catch (error) {
      console.warn("Unable to clear Base recovery metadata", error)
    }
  }, [])

  const saveAs = useCallback(async () => {
    const client = clientRef.current
    if (!client || !session) return
    let handle: FileSystemFileHandle | null = null
    if (supportsSavePicker()) {
      handle = await pickSaveHandle(session.fileName)
      if (!handle) return
    }
    dispatch({ type: "SAVE_START" })
    try {
      const exported = await client.exportFile()
      if (handle) {
        const version = await writeAndVerifyHandle(handle, exported.bytes)
        const permission = await queryWritePermission(handle)
        const next: OpenSession = {
          ...session,
          fileName: handle.name,
          mode: "direct",
          permission,
          sourceVersion: version,
          handle,
        }
        setSession(next)
        setSnapshot((current) =>
          current ? { ...current, path: handle?.name ?? current.path } : current
        )
        dispatch({ type: "PERMISSION", permission })
        dispatch({ type: "SAVE_SUCCESS", at: Date.now(), mode: "direct" })
      } else {
        downloadBaseCopy(exported.bytes, session.fileName)
        dispatch({ type: "SAVE_SUCCESS", at: Date.now(), mode: "copy" })
      }
      await clearRecoveryAfterSave(session.id)
    } catch (error) {
      dispatch({ type: "SAVE_FAILURE", message: errorMessage(error) })
      await rememberRecovery(session)
    }
  }, [clearRecoveryAfterSave, rememberRecovery, session])

  const saveOriginal = useCallback(
    async (overwrite = false) => {
      const client = clientRef.current
      if (!client || !session) return
      if (!session.handle || session.permission !== "granted") {
        await saveAs()
        return
      }
      dispatch({ type: "SAVE_START" })
      try {
        if (!overwrite) {
          const disk = await readHandleVersion(session.handle)
          if (!sameFileVersion(disk.version, session.sourceVersion)) {
            dispatch({
              type: "CONFLICT",
              message:
                "The original Base changed outside this tab. Your edits remain recoverable; choose Save As, reload the original, or explicitly overwrite it.",
            })
            await rememberRecovery(session)
            return
          }
        }
        const exported = await client.exportFile()
        const version = await writeAndVerifyHandle(
          session.handle,
          exported.bytes
        )
        setSession({ ...session, sourceVersion: version })
        dispatch({ type: "SAVE_SUCCESS", at: Date.now(), mode: "direct" })
        await clearRecoveryAfterSave(session.id)
      } catch (error) {
        dispatch({ type: "SAVE_FAILURE", message: errorMessage(error) })
        await rememberRecovery(session)
      }
    },
    [clearRecoveryAfterSave, rememberRecovery, saveAs, session]
  )

  const reloadOriginal = useCallback(async () => {
    if (!session?.handle) return
    if (
      !window.confirm(
        "Reload the original Base and discard the current working edits? This cannot be undone after the recovery copy is removed."
      )
    ) {
      return
    }
    try {
      const read = await readHandleVersion(session.handle)
      const oldId = session.id
      await openPreparedFile({
        ...read,
        fileName: session.handle.name,
        mode: "direct",
        permission: await queryWritePermission(session.handle),
        handle: session.handle,
      })
      await deleteRecoverySession(oldId)
    } catch (error) {
      dispatch({ type: "SAVE_FAILURE", message: errorMessage(error) })
    }
  }, [openPreparedFile, session])

  const reauthorize = useCallback(async () => {
    if (!session?.handle) return
    const permission = await requestWritePermission(session.handle)
    setSession({ ...session, permission })
    dispatch({ type: "PERMISSION", permission })
    if (permission !== "granted") {
      setNotice(
        "Write access was not granted. You can keep editing this recoverable copy and use Save As."
      )
    }
  }, [session])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return
      if (event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (event.shiftKey) void saveAs()
        else void saveOriginal()
      } else if (event.key.toLowerCase() === "o") {
        event.preventDefault()
        void chooseFile()
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [chooseFile, saveAs, saveOriginal])

  useEffect(() => {
    if (!session?.handle || saveState.phase === "saving") return
    let active = true
    const check = async () => {
      try {
        const file = await session.handle?.getFile()
        if (!active || !file) return
        if (
          file.size === session.sourceVersion.size &&
          file.lastModified === session.sourceVersion.lastModified
        ) {
          return
        }
        const disk = await readHandleVersion(session.handle!)
        if (active && !sameFileVersion(disk.version, session.sourceVersion)) {
          dispatch({
            type: "CONFLICT",
            message:
              "The original Base changed outside this tab. Saving is paused until you choose how to resolve it.",
          })
        }
      } catch (error) {
        if (active) {
          dispatch({
            type: "CONFLICT",
            message: `The original file is no longer readable: ${errorMessage(error)}`,
          })
        }
      }
    }
    const timer = setInterval(() => void check(), 10_000)
    const visibility = () =>
      document.visibilityState === "visible" && void check()
    document.addEventListener("visibilitychange", visibility)
    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [saveState.phase, session])

  const onRowMutation = useCallback(
    (result: BaseRowMutationResult) => {
      setSnapshot((current) =>
        current ? updateSnapshotRowCount(current, result) : current
      )
      markCommitted()
    },
    [markCommitted]
  )

  const updateProperty = useCallback(
    async (name: string, type: BaseFieldType) => {
      const client = clientRef.current
      if (!client || !activeTable || !propertyField) return
      try {
        const next = await client.updateField(
          activeTable.table.id,
          propertyField.tableColumnName,
          {
            name,
            ...(type !== propertyField.type ? { type } : {}),
          }
        )
        setSnapshot(next)
        setPropertyField(
          next.tables
            .find((table) => table.table.id === activeTable.table.id)
            ?.fields.find(
              (field) => field.tableColumnName === propertyField.tableColumnName
            ) ?? null
        )
        markCommitted()
      } catch (error) {
        setNotice(errorMessage(error))
      }
    },
    [activeTable, markCommitted, propertyField]
  )

  const addProperty = useCallback(
    async (name: string, type: CreateBaseFieldInput["type"]) => {
      const client = clientRef.current
      if (!client || !activeTable) return
      try {
        const next = await client.addField(activeTable.table.id, {
          name,
          columnName: `field_${crypto.randomUUID().replace(/-/g, "")}`,
          type,
          ...(type === "select" || type === "multi-select"
            ? { property: { options: [] } }
            : {}),
        } as CreateBaseFieldInput)
        setSnapshot(next)
        setAddPropertyOpen(false)
        markCommitted()
      } catch (error) {
        setNotice(errorMessage(error))
      }
    },
    [activeTable, markCommitted]
  )

  const status = statusPresentation(saveState.phase, saveState.mode)
  const StatusIcon = status.icon
  const directSupported = supportsDirectFileAccess()

  if (!snapshot || !session || !activeTable) {
    return (
      <main className="launch-shell" id="main-content">
        <a className="skip-link" href="#open-base">
          Skip to open file
        </a>
        <header className="launch-header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              E
            </span>
            <span>Eidos Base</span>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <section className="launch-content" aria-labelledby="launch-title">
          <div className="launch-index" aria-hidden="true">
            <span>.base</span>
            <span>local / private</span>
          </div>
          <div className="launch-copy">
            <p className="eyebrow">A file is the workspace</p>
            <h1 id="launch-title">
              Open the Base.
              <br />
              Work where it lives.
            </h1>
            <p className="launch-lede">
              View and edit a local Eidos Base without an account, upload, or
              server. Your SQLite file stays on this device.
            </p>
            <div className="launch-actions">
              <button
                id="open-base"
                className="primary-button open-button"
                type="button"
                disabled={saveState.phase === "opening"}
                onClick={() => void chooseFile()}
              >
                {saveState.phase === "opening" ? (
                  <LoaderCircle className="spin" size={17} aria-hidden="true" />
                ) : (
                  <FolderOpen size={17} aria-hidden="true" />
                )}
                {saveState.phase === "opening"
                  ? "Opening Base…"
                  : "Open .base file"}
                <span className="button-shortcut">⌘ O</span>
              </button>
              <button
                className="secondary-button sample-button"
                type="button"
                disabled={saveState.phase === "opening"}
                onClick={() => void openSample()}
              >
                <FileSpreadsheet size={16} aria-hidden="true" />
                Open sample Base
              </button>
            </div>
            <div className="privacy-line">
              <ShieldCheck size={15} aria-hidden="true" />
              <span>
                {directSupported
                  ? "This browser can save changes back to the original file after you grant access."
                  : "This browser imports a private working copy. Save creates a new download; it cannot replace the original."}
              </span>
            </div>
          </div>
        </section>

        {recovery ? (
          <section className="recovery-strip" aria-label="Recover unsaved Base">
            <RotateCcw size={16} aria-hidden="true" />
            <div>
              <strong>Unsaved work is available for {recovery.fileName}</strong>
              <span>Recovered from this browser’s private storage.</span>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void restoreRecovery()}
            >
              Recover edits
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => void discardRecovery()}
            >
              Discard copy
            </button>
          </section>
        ) : null}

        {notice || saveState.error ? (
          <div className="launch-error" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{notice ?? saveState.error}</span>
          </div>
        ) : null}

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".base,application/vnd.eidos.base+sqlite3"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.currentTarget.value = ""
            if (file) {
              void openImportedBaseFile(file)
                .then(openPreparedFile)
                .catch((error) => setNotice(errorMessage(error)))
            }
          }}
        />
      </main>
    )
  }

  return (
    <main className="editor-shell" id="main-content">
      <a className="skip-link" href="#base-grid">
        Skip to Base grid
      </a>
      <header className="editor-titlebar">
        <div className="brand-lockup compact">
          <span className="brand-mark" aria-hidden="true">
            E
          </span>
          <span>Eidos Base</span>
        </div>
        <div className="file-identity" title={session.fileName}>
          <FileSpreadsheet size={15} aria-hidden="true" />
          <strong>{session.fileName}</strong>
          <ChevronRight size={13} aria-hidden="true" />
          <span>{activeTable.table.name}</span>
        </div>
        <div className="title-actions">
          <div
            className={`save-status ${status.tone}`}
            role="status"
            aria-live="polite"
          >
            <StatusIcon
              className={
                saveState.phase === "saving" || saveState.phase === "opening"
                  ? "spin"
                  : ""
              }
              size={14}
              aria-hidden="true"
            />
            <span>{status.label}</span>
          </div>
          {session.mode === "direct" && session.permission !== "granted" ? (
            <button
              className="permission-button"
              type="button"
              onClick={() => void reauthorize()}
            >
              <FileKey size={14} aria-hidden="true" />
              Grant write access
            </button>
          ) : null}
          <button
            className="toolbar-button"
            type="button"
            onClick={() => void chooseFile()}
          >
            <FolderOpen size={15} aria-hidden="true" />
            <span>Open</span>
          </button>
          <button
            className="toolbar-button"
            type="button"
            disabled={
              !hasUnsavedChanges(saveState) || saveState.phase === "saving"
            }
            onClick={() => void saveOriginal()}
          >
            <Save size={15} aria-hidden="true" />
            <span>{canSaveToOriginal(saveState) ? "Save" : "Save As"}</span>
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Save As"
            onClick={() => void saveAs()}
          >
            <Download size={15} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      <div className="alert-slot">
        {saveState.phase === "conflict" ? (
          <section className="conflict-bar" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <p>{saveState.error}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void saveAs()}
            >
              Save As
            </button>
            <button
              className="secondary-button danger"
              type="button"
              onClick={() => void saveOriginal(true)}
            >
              Overwrite original
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => void reloadOriginal()}
            >
              Reload original
            </button>
          </section>
        ) : saveState.phase === "error" && saveState.error ? (
          <section className="conflict-bar error-bar" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <p>{saveState.error}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void saveAs()}
            >
              Save recoverable copy
            </button>
          </section>
        ) : null}
      </div>

      <nav className="sheet-tabs" aria-label="Base sheets" role="tablist">
        {snapshot.tables.map((table) => (
          <button
            type="button"
            role="tab"
            aria-selected={table.table.id === activeTable.table.id}
            className={table.table.id === activeTable.table.id ? "active" : ""}
            key={table.table.id}
            onClick={() => {
              setActiveTableId(table.table.id)
              setPropertyField(null)
            }}
          >
            {table.table.icon ? (
              <span aria-hidden="true">{table.table.icon}</span>
            ) : null}
            {table.table.name}
            <span className="tab-count">{table.rowCount.toLocaleString()}</span>
          </button>
        ))}
      </nav>

      <div className="base-workbar">
        <nav className="view-tabs" aria-label="Base views" role="tablist">
          {activeTable.views.map((view) => (
            <button
              type="button"
              role="tab"
              aria-selected={view.id === activeView?.id}
              className={view.id === activeView?.id ? "active" : ""}
              key={view.id}
              onClick={() =>
                setActiveViews((current) => ({
                  ...current,
                  [activeTable.table.id]: view.id,
                }))
              }
            >
              {view.name}
              {view.type !== "grid" ? (
                <span className="view-kind">{view.type}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="workbar-actions">
          <label className="search-field">
            <Search size={14} aria-hidden="true" />
            <span className="visually-hidden">Search records</span>
            <input
              value={search}
              placeholder="Search records"
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <X size={13} />
              </button>
            ) : null}
          </label>
          <div className="add-property-wrap">
            <button
              className="toolbar-button"
              type="button"
              onClick={() => setAddPropertyOpen((open) => !open)}
            >
              <Plus size={14} aria-hidden="true" />
              <span>Property</span>
            </button>
            {addPropertyOpen ? (
              <AddPropertyPopover
                onClose={() => setAddPropertyOpen(false)}
                onAdd={addProperty}
              />
            ) : null}
          </div>
        </div>
      </div>

      <section className="base-content" id="base-grid">
        {activeView?.type && activeView.type !== "grid" ? (
          <div className="unsupported-view">
            <span className="unsupported-index">{activeView.type}</span>
            <div>
              <p className="eyebrow">View preserved, renderer unavailable</p>
              <h2>{activeView.name} remains in your Base.</h2>
              <p>
                This standalone app does not recreate private Gallery or Kanban
                UI. Choose a Grid view now; this layout can plug into the
                publishable Base UI package when its public contract lands.
              </p>
            </div>
          </div>
        ) : (
          <BaseGrid
            key={`${activeTable.table.id}:${activeView?.id ?? "default"}`}
            source={clientRef.current!}
            table={activeTable}
            view={activeView}
            search={search}
            disabled={saveState.phase === "saving"}
            onMutation={onRowMutation}
            onFieldOpen={setPropertyField}
            onError={(error) => setNotice(errorMessage(error))}
          />
        )}

        {propertyField ? (
          <PropertyPanel
            field={propertyField}
            onClose={() => setPropertyField(null)}
            onSave={updateProperty}
          />
        ) : null}
      </section>

      <footer className="editor-statusbar">
        <div>
          {session.mode === "direct" ? (
            <>
              <FileKey size={13} aria-hidden="true" /> Original file
            </>
          ) : (
            <>
              <CloudOff size={13} aria-hidden="true" /> Imported copy
            </>
          )}
          <span className="status-separator" aria-hidden="true">
            /
          </span>
          <span>
            {session.storage === "opfs-sahpool" ? "Recovery on" : "Memory only"}
          </span>
        </div>
        <div>
          <span>SQLite {snapshot.metadata.schemaVersion}</span>
          <span className="status-separator" aria-hidden="true">
            /
          </span>
          <span>All processing local</span>
        </div>
      </footer>

      {notice ? (
        <div className="toast" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice(null)}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept=".base,application/vnd.eidos.base+sqlite3"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ""
          if (file) void openImportedBaseFile(file).then(openPreparedFile)
        }}
      />
    </main>
  )
}

interface PropertyPanelProps {
  field: BaseFieldInfo
  onClose: () => void
  onSave: (name: string, type: BaseFieldType) => Promise<void>
}

function PropertyPanel({ field, onClose, onSave }: PropertyPanelProps) {
  const [name, setName] = useState(field.name)
  const [type, setType] = useState<BaseFieldType>(field.type)
  const [saving, setSaving] = useState(false)
  const mutable =
    field.valueKind === "source" &&
    field.type !== "title" &&
    MUTABLE_FIELD_TYPES.some((candidate) => candidate.value === field.type)
  return (
    <aside className="property-panel" aria-label={`${field.name} property`}>
      <header>
        <div>
          <p className="eyebrow">Property</p>
          <h2>{field.name}</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close property panel"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setSaving(true)
          void onSave(name, type).finally(() => setSaving(false))
        }}
      >
        <label>
          <span>Name</span>
          <input
            value={name}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>Type</span>
          <select
            value={type}
            disabled={!mutable}
            onChange={(event) => setType(event.target.value as BaseFieldType)}
          >
            {mutable ? (
              MUTABLE_FIELD_TYPES.map((candidate) => (
                <option key={candidate.value} value={candidate.value}>
                  {candidate.label}
                </option>
              ))
            ) : (
              <option value={field.type}>{field.type}</option>
            )}
          </select>
        </label>
        {!mutable ? (
          <p className="field-note">
            System, relation, and derived types keep their shared runtime
            definition here.
          </p>
        ) : (
          <p className="field-note">
            Changing type uses the shared Base conversion rules and may
            normalize existing values.
          </p>
        )}
        <button
          className="primary-button compact-button"
          type="submit"
          disabled={saving || !name.trim()}
        >
          {saving ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <Check size={14} />
          )}
          Save property
        </button>
      </form>
    </aside>
  )
}

interface AddPropertyPopoverProps {
  onClose: () => void
  onAdd: (name: string, type: CreateBaseFieldInput["type"]) => Promise<void>
}

function AddPropertyPopover({ onClose, onAdd }: AddPropertyPopoverProps) {
  const [name, setName] = useState("")
  const [type, setType] = useState<CreateBaseFieldInput["type"]>("text")
  const [saving, setSaving] = useState(false)
  return (
    <form
      className="add-property-popover"
      onSubmit={(event) => {
        event.preventDefault()
        setSaving(true)
        void onAdd(name, type).finally(() => setSaving(false))
      }}
    >
      <header>
        <strong>New property</strong>
        <button type="button" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <label>
        <span>Name</span>
        <input
          autoFocus
          value={name}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        <span>Type</span>
        <select
          value={type}
          onChange={(event) =>
            setType(event.target.value as CreateBaseFieldInput["type"])
          }
        >
          {MUTABLE_FIELD_TYPES.map((candidate) => (
            <option key={candidate.value} value={candidate.value}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="primary-button compact-button"
        type="submit"
        disabled={saving || !name.trim()}
      >
        {saving ? (
          <LoaderCircle className="spin" size={14} />
        ) : (
          <Plus size={14} />
        )}
        Add property
      </button>
    </form>
  )
}
