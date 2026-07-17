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
  UpdateBaseViewInput,
} from "@eidos.space/base"
import {
  BaseEditorContent,
  BaseEditorRoot,
  BaseEditorWorkbar,
  BaseSheetTabStrip,
  BaseViewTabStrip,
} from "@eidos.space/base-ui/base-editor-chrome"
import { BaseQueryToolbar } from "@eidos.space/base-ui/base-query-toolbar"
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
  ShieldCheck,
  Sun,
  X,
} from "lucide-react"

import { LiveBaseDemo } from "./components/live-base-demo"
import { SharedBaseEditorGrid } from "./components/shared-base-editor-grid"
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
import { registerPwaBaseFileHandler } from "./files/pwa-file-handler"
import { useI18n, type Translator } from "./i18n"
import { BaseWorkerClient } from "./runtime/worker-client"
import { loadSampleBaseFile } from "./sample-base"
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
  mode: FileAccessMode | null,
  t: Translator
): { label: string; tone: string; icon: typeof Check } {
  switch (phase) {
    case "opening":
      return {
        label: t("editorOpening"),
        tone: "neutral",
        icon: LoaderCircle,
      }
    case "dirty":
      return {
        label: mode === "copy" ? t("editorBrowserChanges") : t("editorUnsaved"),
        tone: "warning",
        icon: CloudOff,
      }
    case "saving":
      return { label: t("editorSaving"), tone: "neutral", icon: LoaderCircle }
    case "saved":
      return {
        label:
          mode === "copy" ? t("editorDownloaded") : t("editorSavedOriginal"),
        tone: "success",
        icon: Check,
      }
    case "error":
      return {
        label: t("editorAttention"),
        tone: "danger",
        icon: AlertTriangle,
      }
    case "conflict":
      return { label: t("editorConflict"), tone: "danger", icon: AlertTriangle }
    default:
      return {
        label: mode === "copy" ? t("editorImported") : t("editorSaved"),
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
  const { locale, setLocale, t } = useI18n()
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

  useEffect(
    () =>
      registerPwaBaseFileHandler({
        onOpen: async (opened) => {
          if (!confirmSwitch()) return
          setNotice(null)
          await openPreparedFile(opened)
        },
        onError: (error) => setNotice(errorMessage(error)),
      }),
    [confirmSwitch, openPreparedFile]
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
      const file = await loadSampleBaseFile()
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

  const onStructureSnapshot = useCallback(
    (next: BaseSnapshot) => {
      setSnapshot(next)
      setPropertyField((current) => {
        if (!current || !activeTable) return null
        return (
          next.tables
            .find((table) => table.table.id === activeTable.table.id)
            ?.fields.find(
              (field) => field.tableColumnName === current.tableColumnName
            ) ?? null
        )
      })
      markCommitted()
    },
    [activeTable, markCommitted]
  )

  const updateActiveView = useCallback(
    async (changes: UpdateBaseViewInput) => {
      const client = clientRef.current
      if (!client || !activeView) return
      try {
        onStructureSnapshot(await client.updateView(activeView.id, changes))
      } catch (error) {
        setNotice(errorMessage(error))
      }
    },
    [activeView, onStructureSnapshot]
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

  const status = statusPresentation(saveState.phase, saveState.mode, t)
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
          <div className="launch-header-actions">
            <button
              className="language-button"
              type="button"
              aria-label={t("languageAction")}
              onClick={() => setLocale(locale === "en" ? "zh" : "en")}
            >
              {locale === "en" ? "中文" : "EN"}
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <section className="launch-content" aria-labelledby="launch-title">
          <div className="launch-index" aria-hidden="true">
            <span>.base</span>
            <span>local / private</span>
          </div>
          <div className="launch-copy">
            <p className="eyebrow">{t("heroEyebrow")}</p>
            <h1 id="launch-title">
              {t("heroTitleOne")}
              <br />
              {t("heroTitleTwo")}
            </h1>
            <p className="launch-lede">{t("heroLede")}</p>
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
                  ? t("openingBase")
                  : t("openBase")}
                <span className="button-shortcut">⌘ O</span>
              </button>
              <button
                className="secondary-button sample-button"
                type="button"
                disabled={saveState.phase === "opening"}
                onClick={() => void openSample()}
              >
                <FileSpreadsheet size={16} aria-hidden="true" />
                {t("openSample")}
              </button>
            </div>
            <div className="privacy-line">
              <ShieldCheck size={15} aria-hidden="true" />
              <span>
                {directSupported ? t("privacyDirect") : t("privacyCopy")}
              </span>
            </div>
          </div>
        </section>

        {recovery ? (
          <section className="recovery-strip" aria-label="Recover unsaved Base">
            <RotateCcw size={16} aria-hidden="true" />
            <div>
              <strong>
                {t("recoveryAvailable", { file: recovery.fileName })}
              </strong>
              <span>{t("recoveryPrivate")}</span>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void restoreRecovery()}
            >
              {t("recoverEdits")}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => void discardRecovery()}
            >
              {t("discardCopy")}
            </button>
          </section>
        ) : null}

        <section
          className="landing-section format-section"
          aria-labelledby="format-title"
        >
          <div className="section-rail" aria-hidden="true">
            <span>01</span>
            <span>open format</span>
          </div>
          <div className="format-story">
            <header className="format-heading">
              <p className="eyebrow">{t("formatEyebrow")}</p>
              <h2 id="format-title">
                {t("formatTitleOne")}
                <br />
                {t("formatTitleTwo")}
              </h2>
              <p>
                {t("formatIntro").split(".base")[0]}
                <code>.base</code>
                {t("formatIntro").split(".base").slice(1).join(".base")}
              </p>
            </header>

            <ol className="format-stack" aria-label="Base format layers">
              <li>
                <span>{t("formatFile")}</span>
                <strong>{t("formatFileTitle")}</strong>
                <p>{t("formatFileBody")}</p>
                <code>project-tracker.base</code>
              </li>
              <li>
                <span>{t("formatMeaning")}</span>
                <strong>{t("formatMeaningTitle")}</strong>
                <p>{t("formatMeaningBody")}</p>
                <code>eidos__meta · columns · views</code>
              </li>
              <li>
                <span>{t("formatBehavior")}</span>
                <strong>{t("formatBehaviorTitle")}</strong>
                <p>{t("formatBehaviorBody")}</p>
                <code>BaseConnection → BaseRuntime</code>
              </li>
              <li>
                <span>{t("formatExperience")}</span>
                <strong>{t("formatExperienceTitle")}</strong>
                <p>{t("formatExperienceBody")}</p>
                <code>data + view config → UI</code>
              </li>
            </ol>

            <div
              className="format-principles"
              aria-label="Open format principles"
            >
              <span>{t("principleOwned")}</span>
              <span>{t("principleAccount")}</span>
              <span>{t("principleDrivers")}</span>
              <span>{t("principleLocal")}</span>
            </div>
          </div>
        </section>

        <section
          className="landing-section stack-section"
          aria-labelledby="stack-title"
        >
          <div className="section-rail" aria-hidden="true">
            <span>02</span>
            <span>full stack</span>
          </div>
          <div className="stack-story">
            <header className="stack-heading">
              <p className="eyebrow">{t("stackEyebrow")}</p>
              <h2 id="stack-title">{t("stackTitle")}</h2>
              <p>{t("graftIntro")}</p>
            </header>

            <div className="stack-layers" aria-label="Eidos technology stack">
              <article>
                <span>01</span>
                <div>
                  <strong>Graft</strong>
                  <h3>{t("stackGraft")}</h3>
                  <p>{t("stackGraftBody")}</p>
                </div>
              </article>
              <article>
                <span>02</span>
                <div>
                  <strong>Base</strong>
                  <h3>{t("stackBase")}</h3>
                  <p>{t("stackBaseBody")}</p>
                </div>
              </article>
              <article>
                <span>03</span>
                <div>
                  <strong>Eidos Desktop</strong>
                  <h3>{t("stackEidos")}</h3>
                  <p>{t("stackEidosBody")}</p>
                </div>
              </article>
            </div>

            <div className="graft-workflow">
              <article>
                <span>commit -m</span>
                <strong>{t("graftCommit")}</strong>
                <p>{t("graftCommitBody")}</p>
              </article>
              <article>
                <span>diff HEAD WORKTREE</span>
                <strong>{t("graftDiff")}</strong>
                <p>{t("graftDiffBody")}</p>
              </article>
              <article>
                <span>branch / checkout</span>
                <strong>{t("graftBranch")}</strong>
                <p>{t("graftBranchBody")}</p>
              </article>
              <article>
                <span>push / pull / merge</span>
                <strong>{t("graftSync")}</strong>
                <p>{t("graftSyncBody")}</p>
              </article>
            </div>

            <p className="graft-boundary">{t("graftBoundary")}</p>
          </div>
        </section>

        <LiveBaseDemo
          theme={theme}
          onOpenFullEditor={() => void openSample()}
        />

        <footer className="launch-footer">
          <span>Eidos Base</span>
          <span>{t("launchFooter")}</span>
        </footer>

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
              {t("grantWrite")}
            </button>
          ) : null}
          <button
            className="toolbar-button"
            type="button"
            onClick={() => void chooseFile()}
          >
            <FolderOpen size={15} aria-hidden="true" />
            <span>{t("open")}</span>
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
            <span>
              {canSaveToOriginal(saveState) ? t("save") : t("saveAs")}
            </span>
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={t("saveAs")}
            onClick={() => void saveAs()}
          >
            <Download size={15} />
          </button>
          <button
            className="language-button"
            type="button"
            aria-label={t("languageAction")}
            onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          >
            {locale === "en" ? "中文" : "EN"}
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
              {t("saveAs")}
            </button>
            <button
              className="secondary-button danger"
              type="button"
              onClick={() => void saveOriginal(true)}
            >
              {t("overwriteOriginal")}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => void reloadOriginal()}
            >
              {t("reloadOriginal")}
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
              {t("saveRecoverable")}
            </button>
          </section>
        ) : null}
      </div>

      <BaseEditorRoot className="min-h-0 flex-1 !h-auto">
        <BaseEditorWorkbar>
          <BaseViewTabStrip
            views={activeTable.views}
            activeViewId={activeView?.id}
            disabled={saveState.phase === "saving"}
            onSelect={(viewId) =>
              setActiveViews((current) => ({
                ...current,
                [activeTable.table.id]: viewId,
              }))
            }
          />
          <div className="base-workbar-actions flex h-9 min-w-0 shrink-0 items-center gap-1 pl-2">
            <BaseQueryToolbar
              fields={activeTable.fields}
              filter={activeView?.filter ?? null}
              sorts={activeView?.sorts ?? []}
              search={search}
              disabled={saveState.phase === "saving"}
              onSearchChange={setSearch}
              onFilterChange={(filter) => updateActiveView({ filter })}
              onSortsChange={(sorts) => updateActiveView({ sorts })}
            />
            <div className="add-property-wrap">
              <button
                className="base-workbar-action inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                type="button"
                onClick={() => setAddPropertyOpen((open) => !open)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="base-workbar-action-label">
                  {t("property")}
                </span>
              </button>
              {addPropertyOpen ? (
                <AddPropertyPopover
                  onClose={() => setAddPropertyOpen(false)}
                  onAdd={addProperty}
                />
              ) : null}
            </div>
          </div>
        </BaseEditorWorkbar>

        <BaseEditorContent className="base-content" id="base-grid">
          {activeView?.type && activeView.type !== "grid" ? (
            <div className="unsupported-view">
              <span className="unsupported-index">{activeView.type}</span>
              <div>
                <p className="eyebrow">{t("viewPreserved")}</p>
                <h2>{t("viewRemains", { view: activeView.name })}</h2>
                <p>{t("viewUnavailableBody")}</p>
              </div>
            </div>
          ) : (
            <SharedBaseEditorGrid
              key={`${activeTable.table.id}:${activeView?.id ?? "default"}`}
              theme={theme}
              source={clientRef.current!}
              table={activeTable}
              view={activeView}
              search={search}
              disabled={saveState.phase === "saving"}
              propertyField={propertyField}
              onMutation={onRowMutation}
              onSnapshot={onStructureSnapshot}
              onFieldOpen={setPropertyField}
              onFieldClose={() => setPropertyField(null)}
              onFieldAdd={() => setAddPropertyOpen(true)}
              onError={(error) => setNotice(errorMessage(error))}
            />
          )}
        </BaseEditorContent>

        <BaseSheetTabStrip
          tables={snapshot.tables.map((table) => table.table)}
          activeTableId={activeTable.table.id}
          disabled={saveState.phase === "saving"}
          onSelect={(tableId) => {
            setActiveTableId(tableId)
            setPropertyField(null)
          }}
          status={
            <span className="flex items-center gap-1.5">
              <StatusIcon
                className={saveState.phase === "saving" ? "spin" : ""}
                size={13}
                aria-hidden="true"
              />
              <span>{status.label}</span>
              {session.mode === "copy" && saveState.phase === "clean" ? null : (
                <>
                  <span className="status-separator" aria-hidden="true">
                    /
                  </span>
                  <span>
                    {session.mode === "direct"
                      ? t("originalFile")
                      : t("editorImported")}
                  </span>
                </>
              )}
              <span className="status-separator" aria-hidden="true">
                /
              </span>
              <span>SQLite {snapshot.metadata.schemaVersion}</span>
            </span>
          }
        />
      </BaseEditorRoot>

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

interface AddPropertyPopoverProps {
  onClose: () => void
  onAdd: (name: string, type: CreateBaseFieldInput["type"]) => Promise<void>
}

function AddPropertyPopover({ onClose, onAdd }: AddPropertyPopoverProps) {
  const { t } = useI18n()
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
        <strong>{t("newProperty")}</strong>
        <button type="button" aria-label={t("close")} onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <label>
        <span>{t("name")}</span>
        <input
          autoFocus
          value={name}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        <span>{t("type")}</span>
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
        {t("addProperty")}
      </button>
    </form>
  )
}
