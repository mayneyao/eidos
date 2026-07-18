import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileFieldType,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRowRange,
  EidosFileSnapshot,
  CreateEidosFileFieldInput,
  CreateEidosFileTableInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import {
  EidosFileEditorContent,
  EidosFileEditorRoot,
  EidosFileEditorWorkbar,
  EidosFileSheetTabStrip,
} from "@eidos.space/eidos-file-ui/eidos-file-editor-chrome"
import { EidosFileSheetCreatePopover } from "@eidos.space/eidos-file-ui/eidos-file-sheet-create-popover"
import { EidosFileViewTabs } from "@eidos.space/eidos-file-ui/eidos-file-view-tabs"
import {
  createEidosFilePluginRegistry,
  EidosFilePluginSlot,
  type EidosFilePlugin,
  type EidosFilePluginContext,
} from "@eidos.space/eidos-file-ui/plugin"
import {
  createEidosFileCsvImportPlugin,
  type EidosFileCsvImportSource,
} from "@eidos.space/eidos-file-ui/plugins/csv-import"
import { eidosFileGalleryPlugin } from "@eidos.space/eidos-file-ui/plugins/gallery"
import { eidosFileKanbanPlugin } from "@eidos.space/eidos-file-ui/plugins/kanban"
import { EidosFileQueryToolbar } from "@eidos.space/eidos-file-ui/eidos-file-query-toolbar"
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
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

import { LiveEidosFileDemo } from "./components/live-eidos-file-demo"
import { SharedEidosFileEditorView } from "./components/shared-eidos-file-editor-view"
import {
  deleteRecoverySession,
  getLatestRecoverySession,
  storeRecoverySession,
  type RecoverySession,
} from "./files/recovery-store"
import {
  downloadEidosFileCopy,
  openImportedEidosFile,
  pickDirectEidosFile,
  pickSaveHandle,
  queryWritePermission,
  readHandleVersion,
  requestWritePermission,
  sameFileVersion,
  supportsDirectFileAccess,
  supportsSavePicker,
  writeAndVerifyHandle,
  type EidosFileVersion,
  type FileAccessMode,
  type FileWritePermission,
  type OpenedBrowserFile,
} from "./files/browser-file-adapter"
import { registerPwaEidosFileHandler } from "./files/pwa-file-handler"
import { useI18n, type Translator } from "./i18n"
import { EidosFileWorkerClient } from "./runtime/worker-client"
import { loadSampleEidosFile } from "./sample-eidos-file"
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
  sourceVersion: EidosFileVersion
  handle?: FileSystemFileHandle
  storage: "opfs-sahpool" | "memory"
}

type Theme = "light" | "dark"

const EidosFileDocs = lazy(() =>
  import("./components/eidos-file-docs").then((module) => ({
    default: module.EidosFileDocs,
  }))
)

function docsSlugFromHash(hash: string): string | null {
  const match = /^#\/docs(?:\/([^#?]+))?/.exec(hash)
  if (!match) return null
  return decodeURIComponent(match[1] ?? "overview")
}

const MUTABLE_FIELD_TYPES: Array<{
  value: Exclude<
    EidosFileFieldType,
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
  const stored = localStorage.getItem("eidos-file-theme")
  if (stored === "light" || stored === "dark") return stored
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function pickBrowserCsvFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".csv,text/csv,text/plain"
    input.addEventListener(
      "change",
      () => resolve(input.files?.item(0) ?? null),
      { once: true }
    )
    input.addEventListener("cancel", () => resolve(null), { once: true })
    input.click()
  })
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
  snapshot: EidosFileSnapshot,
  result: Pick<EidosFileRowMutationResult, "tableId" | "rowCount" | "revision">
): EidosFileSnapshot {
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
  const [snapshot, setSnapshot] = useState<EidosFileSnapshot | null>(null)
  const [session, setSession] = useState<OpenSession | null>(null)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [activeViews, setActiveViews] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<RecoverySession | null>(null)
  const [propertyField, setPropertyField] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [addPropertyOpen, setAddPropertyOpen] = useState(false)
  const [fieldInsertIndex, setFieldInsertIndex] = useState<number | null>(null)
  const [viewReloadToken, setViewReloadToken] = useState(0)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [docsSlug, setDocsSlug] = useState<string | null>(() =>
    docsSlugFromHash(window.location.hash)
  )
  const clientRef = useRef<EidosFileWorkerClient | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const csvFilesRef = useRef(new Map<string, File>())
  const editorPlugins = useMemo(
    () => [
      eidosFileGalleryPlugin,
      eidosFileKanbanPlugin,
      createEidosFileCsvImportPlugin(
        {
          async pickFile() {
            const file = await pickBrowserCsvFile()
            if (!file) return null
            const source: EidosFileCsvImportSource = {
              id: crypto.randomUUID(),
              fileName: file.name,
            }
            csvFilesRef.current.set(source.id, file)
            return source
          },
          async preview(source, options) {
            const client = clientRef.current
            const file = csvFilesRef.current.get(source.id)
            if (!client || !file) throw new Error(t("csvUnavailable"))
            return client.previewCsv(
              source.fileName,
              await file.arrayBuffer(),
              options
            )
          },
          async import(source, options) {
            const client = clientRef.current
            const file = csvFilesRef.current.get(source.id)
            if (!client || !file) throw new Error(t("csvUnavailable"))
            return client.importCsv(
              source.fileName,
              await file.arrayBuffer(),
              options
            )
          },
          release(source) {
            csvFilesRef.current.delete(source.id)
          },
        },
        {
          copy: {
            actionAriaLabel: t("csvActionAriaLabel"),
            actionLabel: t("csvActionLabel"),
            cancel: t("csvCancel"),
            chooseAnother: t("csvChooseAnother"),
            choosePrompt: t("csvChoosePrompt"),
            dialogTitle: t("csvDialogTitle"),
            fieldName: t("csvFieldName"),
            fieldType: t("csvFieldType"),
            fileSummary: t("csvFileSummary"),
            importRows: t("csvImportRows"),
            importing: t("csvImporting"),
            localOnly: t("csvLocalOnly"),
            parsing: t("csvParsing"),
            preview: t("csvPreview"),
            tableName: t("csvTableName"),
            titleType: t("csvTitleType"),
            typeCheckbox: t("csvTypeCheckbox"),
            typeDate: t("csvTypeDate"),
            typeDatetime: t("csvTypeDatetime"),
            typeNumber: t("csvTypeNumber"),
            typeText: t("csvTypeText"),
            typeUrl: t("csvTypeUrl"),
            unableToImport: t("csvUnableToImport"),
            unableToRead: t("csvUnableToRead"),
          },
        }
      ),
    ],
    [t]
  )

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
    localStorage.setItem("eidos-file-theme", theme)
  }, [theme])

  useEffect(() => {
    const updateRoute = () => setDocsSlug(docsSlugFromHash(location.hash))
    window.addEventListener("hashchange", updateRoute)
    return () => window.removeEventListener("hashchange", updateRoute)
  }, [])

  useEffect(() => {
    void getLatestRecoverySession()
      .then(setRecovery)
      .catch((error) =>
        console.warn("Unable to read Eidos File recovery metadata", error)
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
      console.warn("Unable to persist Eidos File recovery metadata", error)
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
      "Open another Eidos File and keep this recoverable working copy? The original file has not been updated."
    )
  }, [saveState])

  const installOpenResult = useCallback(
    async (
      client: EidosFileWorkerClient,
      opened: Omit<OpenSession, "storage">,
      result: Awaited<ReturnType<EidosFileWorkerClient["openSource"]>>
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
      const client = new EidosFileWorkerClient()
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

  // Chromium may drain launchQueue synchronously during registration. A layout
  // effect lets React finish StrictMode's cleanup/re-register cycle before the
  // file handle promise resumes, so the launch reaches the live App instance.
  useLayoutEffect(
    () =>
      registerPwaEidosFileHandler({
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
      const opened = await pickDirectEidosFile()
      if (opened) await openPreparedFile(opened)
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }, [confirmSwitch, openPreparedFile])

  const openSample = useCallback(async () => {
    if (!confirmSwitch()) return
    setNotice(null)
    try {
      const file = await loadSampleEidosFile()
      await openPreparedFile(await openImportedEidosFile(file))
    } catch (error) {
      const message = errorMessage(error)
      setNotice(message)
      dispatch({ type: "OPEN_FAILURE", message })
    }
  }, [confirmSwitch, openPreparedFile])

  const returnHome = useCallback(() => {
    if (hasUnsavedChanges(saveState)) {
      const message =
        session?.storage === "opfs-sahpool"
          ? t("returnHomeRecoverable")
          : t("returnHomeDiscard")
      if (!window.confirm(message)) return
    }

    clientRef.current?.terminate()
    clientRef.current = null
    setSession(null)
    setSnapshot(null)
    setActiveTableId(null)
    setActiveViews({})
    setSearch("")
    setPropertyField(null)
    setAddPropertyOpen(false)
    setNotice(null)
    dispatch({ type: "RESET" })
    window.location.hash = "#/"
  }, [saveState, session, t])

  const restoreRecovery = useCallback(async () => {
    if (!recovery || !confirmSwitch()) return
    dispatch({ type: "OPEN_START" })
    const client = new EidosFileWorkerClient()
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
    const client = new EidosFileWorkerClient()
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
      console.warn("Unable to clear Eidos File recovery metadata", error)
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
        downloadEidosFileCopy(exported.bytes, session.fileName)
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
                "The original Eidos File changed outside this tab. Your edits remain recoverable; choose Save As, reload the original, or explicitly overwrite it.",
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
        "Reload the original Eidos File and discard the current working edits? This cannot be undone after the recovery copy is removed."
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
              "The original Eidos File changed outside this tab. Saving is paused until you choose how to resolve it.",
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
    (result: EidosFileRowMutationResult) => {
      setSnapshot((current) =>
        current ? updateSnapshotRowCount(current, result) : current
      )
      markCommitted()
    },
    [markCommitted]
  )

  const onStructureSnapshot = useCallback(
    (next: EidosFileSnapshot) => {
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
    async (changes: UpdateEidosFileViewInput) => {
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
    async (name: string, type: CreateEidosFileFieldInput["type"]) => {
      const client = clientRef.current
      if (!client || !activeTable) return
      try {
        const next = await client.addField(
          activeTable.table.id,
          {
            name,
            columnName: `field_${crypto.randomUUID().replace(/-/g, "")}`,
            type,
            ...(type === "select" || type === "multi-select"
              ? { property: { options: [] } }
              : {}),
          } as CreateEidosFileFieldInput,
          activeView && fieldInsertIndex !== null
            ? { viewId: activeView.id, index: fieldInsertIndex }
            : undefined
        )
        setSnapshot(next)
        setAddPropertyOpen(false)
        setFieldInsertIndex(null)
        markCommitted()
      } catch (error) {
        setNotice(errorMessage(error))
      }
    },
    [activeTable, activeView, fieldInsertIndex, markCommitted]
  )

  const createTable = useCallback(
    async (input: CreateEidosFileTableInput) => {
      const client = clientRef.current
      if (!client || !snapshot) return
      const previousIds = new Set(
        snapshot.tables.map((table) => table.table.id)
      )
      const next = await client.createTable(input)
      const created = next.tables.find(
        (table) => !previousIds.has(table.table.id)
      )
      onStructureSnapshot(next)
      if (created) {
        setActiveTableId(created.table.id)
        setPropertyField(null)
      }
    },
    [onStructureSnapshot, snapshot]
  )

  const createView = useCallback(
    async (name: string, type: string) => {
      const client = clientRef.current
      if (!client || !activeTable) return
      const contribution = createEidosFilePluginRegistry(
        editorPlugins as EidosFilePlugin[]
      ).views[type]
      const next = await client.createView(activeTable.table.id, {
        name,
        type,
        properties: contribution?.create?.properties?.(activeTable.fields),
      })
      const previousIds = new Set(activeTable.views.map((view) => view.id))
      const created = next.tables
        .find((table) => table.table.id === activeTable.table.id)
        ?.views.find((view) => !previousIds.has(view.id))
      onStructureSnapshot(next)
      if (created) {
        setActiveViews((current) => ({
          ...current,
          [activeTable.table.id]: created.id,
        }))
      }
    },
    [activeTable, editorPlugins, onStructureSnapshot]
  )

  const renameView = useCallback(
    async (viewId: string, name: string) => {
      const client = clientRef.current
      if (!client) return
      onStructureSnapshot(await client.updateView(viewId, { name }))
    },
    [onStructureSnapshot]
  )

  const duplicateView = useCallback(
    async (viewId: string) => {
      const client = clientRef.current
      if (!client || !activeTable) return
      const previousIds = new Set(activeTable.views.map((view) => view.id))
      const next = await client.duplicateView(viewId)
      const duplicate = next.tables
        .find((table) => table.table.id === activeTable.table.id)
        ?.views.find((view) => !previousIds.has(view.id))
      onStructureSnapshot(next)
      if (duplicate) {
        setActiveViews((current) => ({
          ...current,
          [activeTable.table.id]: duplicate.id,
        }))
      }
    },
    [activeTable, onStructureSnapshot]
  )

  const deleteView = useCallback(
    async (viewId: string) => {
      const client = clientRef.current
      if (!client || !activeTable) return
      const next = await client.deleteView(viewId)
      const remaining = next.tables.find(
        (table) => table.table.id === activeTable.table.id
      )?.views
      onStructureSnapshot(next)
      if (activeView?.id === viewId && remaining?.[0]) {
        setActiveViews((current) => ({
          ...current,
          [activeTable.table.id]: remaining[0].id,
        }))
      }
    },
    [activeTable, activeView?.id, onStructureSnapshot]
  )

  const reorderViews = useCallback(
    async (viewIds: string[]) => {
      const client = clientRef.current
      if (!client || !activeTable) return
      onStructureSnapshot(
        await client.reorderViews(activeTable.table.id, viewIds)
      )
    },
    [activeTable, onStructureSnapshot]
  )

  const deleteSingleRow = useCallback(
    async (row: EidosFileRow) => {
      const client = clientRef.current
      if (!client || !activeTable || row._id == null) return
      const result = await client.deleteRows(activeTable.table.id, [
        String(row._id),
      ])
      setSnapshot((current) =>
        current ? updateSnapshotRowCount(current, result) : current
      )
      setViewReloadToken((current) => current + 1)
      markCommitted()
    },
    [activeTable, markCommitted]
  )

  const deleteRowRanges = useCallback(
    async (
      ranges: EidosFileRowRange[],
      query: Parameters<EidosFileWorkerClient["deleteRowRanges"]>[2]
    ) => {
      const client = clientRef.current
      if (!client || !activeTable) return
      const count = ranges.reduce(
        (total, range) => total + range.endIndex - range.startIndex,
        0
      )
      if (!window.confirm(t("deleteRowsConfirm", { count }))) return
      const result = await client.deleteRowRanges(
        activeTable.table.id,
        ranges,
        query
      )
      setSnapshot((current) =>
        current ? updateSnapshotRowCount(current, result) : current
      )
      setViewReloadToken((current) => current + 1)
      markCommitted()
    },
    [activeTable, markCommitted, t]
  )

  const pluginContext = useMemo<EidosFilePluginContext | null>(() => {
    const source = clientRef.current
    if (!source || !snapshot) return null
    return {
      source,
      snapshot,
      activeTable,
      activeView,
      disabled: saveState.phase === "saving",
      onSnapshot: onStructureSnapshot,
      onTableSelect: (tableId) => {
        setActiveTableId(tableId)
        setPropertyField(null)
      },
      onError: (error) => setNotice(errorMessage(error)),
    }
  }, [activeTable, activeView, onStructureSnapshot, saveState.phase, snapshot])

  const status = statusPresentation(saveState.phase, saveState.mode, t)
  const StatusIcon = status.icon
  const directSupported = supportsDirectFileAccess()

  if (docsSlug) {
    return (
      <Suspense
        fallback={
          <main className="docs-loading" role="status">
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
            {t("loadingDocs")}
          </main>
        }
      >
        <EidosFileDocs
          slug={docsSlug}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        />
      </Suspense>
    )
  }

  if (!snapshot || !session || !activeTable) {
    return (
      <main className="launch-shell" id="main-content">
        <a className="skip-link" href="#open-eidos-file">
          Skip to open file
        </a>
        <header className="launch-header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              E
            </span>
            <span>Eidos File</span>
          </div>
          <nav className="site-nav" aria-label="Eidos File">
            <a className="is-active" href="#/">
              {t("navEditor")}
            </a>
            <a href="#/docs/overview">
              <BookOpen size={13} aria-hidden="true" />
              {t("navDocs")}
            </a>
            <a href="https://graft.eidos.space/">
              {t("navGraft")}
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </nav>
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

        <section className="launch-workbench" aria-labelledby="launch-title">
          <div className="launch-panel">
            <div className="launch-panel-kicker">
              <span aria-hidden="true" />
              {t("heroEyebrow")}
            </div>
            <div className="launch-copy">
              <h1 id="launch-title">
                {t("heroTitleOne")}
                <br />
                {t("heroTitleTwo")}
              </h1>
              <p className="launch-lede">{t("heroLede")}</p>
              <div className="launch-actions">
                <button
                  id="open-eidos-file"
                  className="primary-button open-button"
                  type="button"
                  disabled={saveState.phase === "opening"}
                  onClick={() => void chooseFile()}
                >
                  {saveState.phase === "opening" ? (
                    <LoaderCircle
                      className="spin"
                      size={17}
                      aria-hidden="true"
                    />
                  ) : (
                    <FolderOpen size={17} aria-hidden="true" />
                  )}
                  {saveState.phase === "opening"
                    ? t("openingEidosFile")
                    : t("openEidosFile")}
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
            <dl className="launch-details">
              <div>
                <dt>{t("launchFormatLabel")}</dt>
                <dd>.eidos · SQLite</dd>
              </div>
              <div>
                <dt>{t("launchViewsLabel")}</dt>
                <dd>Grid · Gallery · Kanban</dd>
              </div>
              <div>
                <dt>{t("launchRuntimeLabel")}</dt>
                <dd>WASM · Web Worker</dd>
              </div>
            </dl>
          </div>
          <LiveEidosFileDemo
            embedded
            theme={theme}
            onOpenFullEditor={() => void openSample()}
          />
        </section>

        {recovery ? (
          <section
            className="recovery-strip"
            aria-label="Recover unsaved Eidos File"
          >
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
          <header className="section-intro">
            <div>
              <p className="eyebrow">01 · {t("formatEyebrow")}</p>
              <h2 id="format-title">
                {t("formatTitleOne")}
                <br />
                {t("formatTitleTwo")}
              </h2>
            </div>
            <p>
              {t("formatIntro").split(".eidos")[0]}
              <code>.eidos</code>
              {t("formatIntro").split(".eidos").slice(1).join(".eidos")}
            </p>
          </header>

          <figure className="file-model-figure">
            <img
              src="/eidos-file-model.png"
              width="1200"
              height="630"
              loading="lazy"
              alt={t("fileModelAlt")}
            />
            <figcaption>
              <div>
                <span>{t("fileModelLabel")}</span>
                <strong>{t("fileModelTitle")}</strong>
              </div>
              <p>{t("fileModelBody")}</p>
            </figcaption>
          </figure>

          <ol className="format-ledger" aria-label="Eidos File format layers">
            <li>
              <span>{t("formatFile")}</span>
              <div>
                <strong>{t("formatFileTitle")}</strong>
                <code>project-tracker.eidos</code>
              </div>
              <p>{t("formatFileBody")}</p>
            </li>
            <li>
              <span>{t("formatMeaning")}</span>
              <div>
                <strong>{t("formatMeaningTitle")}</strong>
                <code>eidos__meta · columns · views</code>
              </div>
              <p>{t("formatMeaningBody")}</p>
            </li>
            <li>
              <span>{t("formatBehavior")}</span>
              <div>
                <strong>{t("formatBehaviorTitle")}</strong>
                <code>EidosFileConnection → EidosFileRuntime</code>
              </div>
              <p>{t("formatBehaviorBody")}</p>
            </li>
            <li>
              <span>{t("formatExperience")}</span>
              <div>
                <strong>{t("formatExperienceTitle")}</strong>
                <code>data + view config → UI</code>
              </div>
              <p>{t("formatExperienceBody")}</p>
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
          <a className="section-link" href="#/docs/format">
            <BookOpen size={14} aria-hidden="true" />
            {t("readEidosFileDocs")}
            <ChevronRight size={13} aria-hidden="true" />
          </a>
        </section>

        <section
          className="landing-section stack-section"
          aria-labelledby="stack-title"
        >
          <header className="section-intro stack-intro">
            <div>
              <p className="eyebrow">02 · {t("stackEyebrow")}</p>
              <h2 id="stack-title">{t("stackTitle")}</h2>
            </div>
            <p>{t("graftIntro")}</p>
          </header>

          <div className="stack-layers" aria-label="Eidos technology stack">
            <article>
              <span>01</span>
              <div className="stack-layer-name">
                <strong>Graft</strong>
                <h3>{t("stackGraft")}</h3>
              </div>
              <p>{t("stackGraftBody")}</p>
              <a className="stack-layer-link" href="https://graft.eidos.space/">
                {t("openGraft")}
                <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            </article>
            <article>
              <span>02</span>
              <div className="stack-layer-name">
                <strong>Eidos File</strong>
                <h3>{t("stackEidosFile")}</h3>
              </div>
              <p>{t("stackEidosFileBody")}</p>
            </article>
            <article>
              <span>03</span>
              <div className="stack-layer-name">
                <strong>Eidos Desktop</strong>
                <h3>{t("stackEidos")}</h3>
              </div>
              <p>{t("stackEidosBody")}</p>
            </article>
          </div>

          <div className="stack-boundary">
            <code>commit · diff · branch · checkout · merge · sync</code>
            <div>
              <p>{t("graftBoundary")}</p>
              <a href="https://graft.eidos.space/">
                {t("navGraft")}
                <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <footer className="launch-footer">
          <span>Eidos File</span>
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
          accept=".eidos,application/vnd.eidos+sqlite3"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.currentTarget.value = ""
            if (file) {
              void openImportedEidosFile(file)
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
      <a className="skip-link" href="#eidos-file-grid">
        Skip to Eidos File grid
      </a>
      <header className="editor-titlebar">
        <a
          className="brand-lockup compact"
          href="#/"
          aria-label={t("returnHome")}
          onClick={(event) => {
            event.preventDefault()
            returnHome()
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            E
          </span>
          <span>Eidos File</span>
        </a>
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

      <EidosFileEditorRoot className="min-h-0 flex-1 !h-auto">
        <EidosFileEditorWorkbar>
          <EidosFileViewTabs
            views={activeTable.views}
            fields={activeTable.fields}
            activeView={activeView}
            disabled={saveState.phase === "saving"}
            onSelect={(viewId) =>
              setActiveViews((current) => ({
                ...current,
                [activeTable.table.id]: viewId,
              }))
            }
            onCreate={createView}
            onRename={renameView}
            onDuplicate={duplicateView}
            onDelete={deleteView}
            onReorder={reorderViews}
            onUpdate={async (viewId, changes) => {
              const client = clientRef.current
              if (!client) return
              onStructureSnapshot(await client.updateView(viewId, changes))
            }}
          />
          <div
            data-eidos-file-workbar-actions
            className="eidos-file-workbar-actions flex h-9 min-w-0 shrink-0 items-center gap-1 pl-2"
          >
            <EidosFileQueryToolbar
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
                className="eidos-file-workbar-action inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                type="button"
                onClick={() => {
                  setFieldInsertIndex(null)
                  setAddPropertyOpen((open) => !open)
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="eidos-file-workbar-action-label">
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
        </EidosFileEditorWorkbar>

        <EidosFileEditorContent
          className="eidos-file-content"
          id="eidos-file-grid"
        >
          <SharedEidosFileEditorView
            key={`${activeTable.table.id}:${activeView?.id ?? "default"}`}
            theme={theme}
            plugins={editorPlugins}
            source={clientRef.current!}
            table={activeTable}
            view={activeView}
            search={search}
            disabled={saveState.phase === "saving"}
            reloadToken={viewReloadToken}
            propertyField={propertyField}
            onMutation={onRowMutation}
            onSnapshot={onStructureSnapshot}
            onDeleteRow={deleteSingleRow}
            onDeleteRows={deleteRowRanges}
            onFieldOpen={setPropertyField}
            onFieldClose={() => setPropertyField(null)}
            onFieldAdd={(position) => {
              setFieldInsertIndex(position ?? null)
              setAddPropertyOpen(true)
            }}
            onError={(error) => setNotice(errorMessage(error))}
          />
        </EidosFileEditorContent>

        <EidosFileSheetTabStrip
          tables={snapshot.tables.map((table) => table.table)}
          activeTableId={activeTable.table.id}
          disabled={saveState.phase === "saving"}
          createAction={
            <EidosFileSheetCreatePopover
              disabled={saveState.phase === "saving"}
              onCreate={createTable}
              importAction={
                pluginContext ? (
                  <EidosFilePluginSlot
                    context={pluginContext}
                    plugins={editorPlugins}
                    slot="sheet-create"
                  />
                ) : undefined
              }
            />
          }
          onSelect={(tableId) => {
            setActiveTableId(tableId)
            setPropertyField(null)
          }}
          status={
            <span
              className="flex items-center gap-1.5"
              aria-label={`${status.label}, ${session.mode === "direct" ? t("originalFile") : t("editorImported")}, SQLite ${snapshot.metadata.schemaVersion}`}
              title={`${status.label} · ${session.mode === "direct" ? t("originalFile") : t("editorImported")} · SQLite ${snapshot.metadata.schemaVersion}`}
            >
              <StatusIcon
                className={saveState.phase === "saving" ? "spin" : ""}
                size={13}
                aria-hidden="true"
              />
              <span
                data-eidos-file-sheet-status-copy
                className="eidos-file-sheet-status-copy"
                aria-hidden="true"
              >
                <span>{status.label}</span>
                {session.mode === "copy" &&
                saveState.phase === "clean" ? null : (
                  <>
                    <span className="status-separator">/</span>
                    <span>
                      {session.mode === "direct"
                        ? t("originalFile")
                        : t("editorImported")}
                    </span>
                  </>
                )}
                <span className="status-separator">/</span>
                <span>SQLite {snapshot.metadata.schemaVersion}</span>
              </span>
            </span>
          }
        />
      </EidosFileEditorRoot>

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
        accept=".eidos,application/vnd.eidos+sqlite3"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ""
          if (file) void openImportedEidosFile(file).then(openPreparedFile)
        }}
      />
    </main>
  )
}

interface AddPropertyPopoverProps {
  onClose: () => void
  onAdd: (
    name: string,
    type: CreateEidosFileFieldInput["type"]
  ) => Promise<void>
}

function AddPropertyPopover({ onClose, onAdd }: AddPropertyPopoverProps) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [type, setType] = useState<CreateEidosFileFieldInput["type"]>("text")
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
            setType(event.target.value as CreateEidosFileFieldInput["type"])
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
