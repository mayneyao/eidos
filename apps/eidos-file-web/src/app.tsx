import {
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
  EidosFileFormulaPreviewInput,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRowRange,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
  CreateEidosFileFieldInput,
  CreateEidosFileTableInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import { exportEidosFileViewCsv } from "@eidos.space/eidos-file-ui/eidos-file-editor-chrome"
import { EidosFileEditorShell } from "@eidos.space/eidos-file-ui/eidos-file-editor-shell"
import { EidosFileSheetCreatePopover } from "@eidos.space/eidos-file-ui/eidos-file-sheet-create-popover"
import { EidosFileSheetTabs } from "@eidos.space/eidos-file-ui/eidos-file-sheet-tabs"
import { EidosFileFieldCreatePopover } from "@eidos.space/eidos-file-ui/eidos-file-field-create-popover"
import {
  EidosFileFormulaEditorPopover,
  EidosFileLookupEditorPopover,
} from "@eidos.space/eidos-file-ui/eidos-file-derived-field-editor"
import { EidosFileViewTabs } from "@eidos.space/eidos-file-ui/eidos-file-view-tabs"
import { EidosFileViewFieldsPopover } from "@eidos.space/eidos-file-ui/eidos-file-view-fields-popover"
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
  Check,
  ChevronRight,
  CloudOff,
  FilePlus2,
  FolderOpen,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react"
import { useRegisterSW } from "virtual:pwa-register/react"

import { AppTitlebar } from "./components/app-titlebar"
import { PwaUpdatePrompt } from "./components/pwa-update-prompt"
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
import {
  getEidosFileTemplateSource,
  loadSampleEidosFile,
  loadTemplateEidosFile,
  type EidosFileTemplateId,
} from "./sample-eidos-file"
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

const PWA_UPDATE_PROMPT_CACHE = "eidos-file-pwa-update-prompt-ready-v1"

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }
  return "The operation did not complete. Your recoverable working copy is unchanged."
}

function initialTheme(): Theme {
  const stored = window.localStorage.getItem("eidos-file-theme")
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

function csvFileNameSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-").trim() || "view"
}

function downloadBrowserCsv(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([new Uint8Array(bytes)], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName.toLowerCase().endsWith(".csv")
    ? fileName
    : `${fileName}.csv`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
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
      ...(result.revision === undefined ? {} : { revision: result.revision }),
    },
    tables: snapshot.tables.map((table) =>
      table.table.id === result.tableId
        ? { ...table, rowCount: result.rowCount }
        : table
    ),
  }
}

export function App() {
  const { locale, t } = useI18n()
  const [saveState, dispatch] = useReducer(saveReducer, initialSaveState)
  const [snapshot, setSnapshot] = useState<EidosFileSnapshot | null>(null)
  const [session, setSession] = useState<OpenSession | null>(null)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [activeViews, setActiveViews] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [focusSearchToken, setFocusSearchToken] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<RecoverySession | null>(null)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [propertyField, setPropertyField] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [addPropertyOpen, setAddPropertyOpen] = useState(false)
  const [formulaTarget, setFormulaTarget] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [lookupTarget, setLookupTarget] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [fieldInsertIndex, setFieldInsertIndex] = useState<number | null>(null)
  const [viewReloadToken, setViewReloadToken] = useState(0)
  const [openingTemplateId, setOpeningTemplateId] =
    useState<EidosFileTemplateId | null>(null)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [pwaRegistration, setPwaRegistration] =
    useState<ServiceWorkerRegistration | null>(null)
  const [updatingApp, setUpdatingApp] = useState(false)
  const [pwaUpdateError, setPwaUpdateError] = useState<string | null>(null)
  const {
    needRefresh: [pwaUpdateAvailable, setPwaUpdateAvailable],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_scriptUrl, registration) => {
      setPwaRegistration(registration ?? null)
      if ("caches" in window) {
        void caches.open(PWA_UPDATE_PROMPT_CACHE).catch((error) => {
          console.warn("Unable to enable prompted Eidos File updates", error)
        })
      }
    },
    onRegisterError: (error) => {
      console.warn("Unable to register the Eidos File service worker", error)
    },
  })
  const clientRef = useRef<EidosFileWorkerClient | null>(null)
  const structureMutationQueueRef = useRef<Promise<void>>(Promise.resolve())
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

  const bootstrappedRef = useRef(false)
  const openGenerationRef = useRef(0)
  const explicitOpenStartedRef = useRef(false)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem("eidos-file-theme", theme)
    // Keep the PWA window frame (window-controls-overlay caption areas) in
    // sync with the app theme; the static manifest theme_color is light.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", getComputedStyle(document.body).backgroundColor)
  }, [theme])

  useEffect(() => {
    if (!pwaRegistration) return
    let checking = false
    const checkForUpdate = async () => {
      if (checking || !navigator.onLine) return
      checking = true
      try {
        await pwaRegistration.update()
      } catch (error) {
        console.warn("Unable to check for an Eidos File update", error)
      } finally {
        checking = false
      }
    }
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate()
    }
    const interval = window.setInterval(checkForUpdate, 60 * 60 * 1000)
    window.addEventListener("focus", checkForUpdate)
    window.addEventListener("online", checkForUpdate)
    document.addEventListener("visibilitychange", checkWhenVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", checkForUpdate)
      window.removeEventListener("online", checkForUpdate)
      document.removeEventListener("visibilitychange", checkWhenVisible)
    }
  }, [pwaRegistration])

  useEffect(() => {
    void getLatestRecoverySession()
      .then(setRecovery)
      .catch((error) =>
        console.warn("Unable to read Eidos File recovery metadata", error)
      )
      .finally(() => setRecoveryReady(true))
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

  const rememberSession = useCallback(
    async (current: OpenSession, dirty: boolean) => {
      const record: RecoverySession = {
        id: current.id,
        fileName: current.fileName,
        sourceVersion: current.sourceVersion,
        mode: current.mode,
        dirty,
        updatedAt: Date.now(),
        ...(current.handle ? { handle: current.handle } : {}),
      }
      try {
        await storeRecoverySession(record)
        setRecovery(record)
      } catch (error) {
        console.warn("Unable to persist Eidos File recovery metadata", error)
      }
    },
    []
  )

  const rememberRecovery = useCallback(
    (current: OpenSession) => rememberSession(current, true),
    [rememberSession]
  )

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
      result: Awaited<ReturnType<EidosFileWorkerClient["openEditorSource"]>>,
      preferredTableName?: string,
      initiallyDirty = false,
      recoveredDirty?: boolean
    ) => {
      const previous = clientRef.current
      clientRef.current = client
      previous?.terminate()
      const nextSession: OpenSession = { ...opened, storage: result.storage }
      setSession(nextSession)
      setSnapshot(result.snapshot)
      const preferredTable = preferredTableName
        ? result.snapshot.tables.find(
            (table) => table.table.name === preferredTableName
          )
        : undefined
      setActiveTableId(
        preferredTable?.table.id ??
          result.snapshot.metadata.defaultTableId ??
          result.snapshot.tables[0]?.table.id ??
          null
      )
      setActiveViews({})
      setSearch("")
      setPropertyField(null)
      setFormulaTarget(null)
      setLookupTarget(null)
      setNotice(null)
      const dirty =
        recoveredDirty ??
        (initiallyDirty || result.migrated || result.recovered)
      dispatch({
        type: "OPEN_SUCCESS",
        mode: nextSession.mode,
        permission: nextSession.permission,
        dirty,
      })
      if (
        nextSession.storage === "opfs-sahpool" &&
        (Boolean(nextSession.handle) || dirty)
      ) {
        await rememberSession(nextSession, dirty)
      }
    },
    [rememberSession]
  )

  const openPreparedFile = useCallback(
    async (
      opened: OpenedBrowserFile,
      preferredTableName?: string,
      options?: { boot?: boolean }
    ) => {
      // An explicit open (file picker, import, template, launch, recovery)
      // always outranks the boot sample — even one that started earlier.
      if (options?.boot && explicitOpenStartedRef.current) return
      if (!options?.boot) explicitOpenStartedRef.current = true
      // Every open supersedes the previous one; a slower open that finishes
      // later must never clobber a newer session (boot sample vs. user open).
      const generation = ++openGenerationRef.current
      dispatch({ type: "OPEN_START" })
      const client = new EidosFileWorkerClient()
      const id = crypto.randomUUID()
      try {
        const result = await client.openEditorSource(
          opened.fileName,
          id,
          opened.bytes
        )
        if (generation !== openGenerationRef.current) {
          client.terminate()
          return
        }
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
          result,
          preferredTableName
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
          // A delivered file always supersedes the boot sample.
          bootstrappedRef.current = true
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

  const createBlankFile = useCallback(async () => {
    if (!confirmSwitch()) return
    setNotice(null)
    dispatch({ type: "OPEN_START" })
    const client = new EidosFileWorkerClient()
    const id = crypto.randomUUID()
    const createdAt = Date.now()
    const copy =
      locale === "zh"
        ? {
            fileName: "未命名.eidos",
            title: "未命名",
            tableName: "数据表",
            labelFieldName: "名称",
          }
        : {
            fileName: "untitled.eidos",
            title: "Untitled",
            tableName: "Table",
            labelFieldName: "Name",
          }
    try {
      const result = await client.createEditorSource(
        copy.fileName,
        id,
        copy.title
      )
      const snapshotWithTable = await client.createTable({
        name: copy.tableName,
        fields: [
          {
            name: copy.labelFieldName,
            type: "text",
            isRecordLabel: true,
          },
        ],
      })
      await installOpenResult(
        client,
        {
          id,
          fileName: copy.fileName,
          mode: "copy",
          permission: "denied",
          sourceVersion: {
            size: 0,
            lastModified: createdAt,
            digest: "",
          },
        },
        { ...result, snapshot: snapshotWithTable },
        copy.tableName,
        true
      )
    } catch (error) {
      client.terminate()
      const message = errorMessage(error)
      setNotice(message)
      dispatch({ type: "OPEN_FAILURE", message })
    }
  }, [confirmSwitch, installOpenResult, locale])

  const openSample = useCallback(async () => {
    if (!confirmSwitch()) return
    setNotice(null)
    try {
      const source = getEidosFileTemplateSource("project-portfolio", locale)
      const file = await loadSampleEidosFile(locale)
      await openPreparedFile(
        await openImportedEidosFile(file),
        source.startTable,
        { boot: true }
      )
    } catch (error) {
      const message = errorMessage(error)
      setNotice(message)
      dispatch({ type: "OPEN_FAILURE", message })
    }
  }, [confirmSwitch, locale, openPreparedFile])

  const openTemplate = useCallback(
    async (templateId: EidosFileTemplateId) => {
      if (!confirmSwitch()) return
      setNotice(null)
      setOpeningTemplateId(templateId)
      try {
        const source = getEidosFileTemplateSource(templateId, locale)
        const file = await loadTemplateEidosFile(templateId, locale)
        await openPreparedFile(
          await openImportedEidosFile(file),
          source.startTable
        )
      } catch (error) {
        const message = errorMessage(error)
        setNotice(message)
        dispatch({ type: "OPEN_FAILURE", message })
      } finally {
        setOpeningTemplateId(null)
      }
    },
    [confirmSwitch, locale, openPreparedFile]
  )

  const restoreRecovery = useCallback(async (): Promise<boolean> => {
    if (!recovery || !confirmSwitch()) return false
    const generation = ++openGenerationRef.current
    dispatch({ type: "OPEN_START" })
    const client = new EidosFileWorkerClient()
    try {
      const permission = recovery.handle
        ? await queryWritePermission(recovery.handle)
        : "denied"
      const result = await client.openEditorRecovery(
        recovery.fileName,
        recovery.id
      )
      if (generation !== openGenerationRef.current) {
        client.terminate()
        return true
      }
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
        result,
        undefined,
        false,
        recovery.dirty
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
      return true
    } catch (error) {
      client.terminate()
      const message = errorMessage(error)
      setNotice(message)
      dispatch({ type: "OPEN_FAILURE", message })
      return false
    }
  }, [confirmSwitch, installOpenResult, recovery])

  useEffect(() => {
    if (
      !recoveryReady ||
      bootstrappedRef.current ||
      session ||
      saveState.phase === "opening"
    ) {
      return
    }
    bootstrappedRef.current = true
    void (async () => {
      if (recovery && (await restoreRecovery())) return
      await openSample()
    })()
  }, [
    openSample,
    recovery,
    recoveryReady,
    restoreRecovery,
    saveState.phase,
    session,
  ])

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
        await rememberSession(next, false)
      } else {
        downloadEidosFileCopy(exported.bytes, session.fileName)
        dispatch({ type: "SAVE_SUCCESS", at: Date.now(), mode: "copy" })
        await clearRecoveryAfterSave(session.id)
      }
    } catch (error) {
      dispatch({ type: "SAVE_FAILURE", message: errorMessage(error) })
      await rememberRecovery(session)
    }
  }, [clearRecoveryAfterSave, rememberRecovery, rememberSession, session])

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
        const next = { ...session, sourceVersion: version }
        setSession(next)
        dispatch({ type: "SAVE_SUCCESS", at: Date.now(), mode: "direct" })
        await rememberSession(next, false)
      } catch (error) {
        dispatch({ type: "SAVE_FAILURE", message: errorMessage(error) })
        await rememberRecovery(session)
      }
    },
    [rememberRecovery, rememberSession, saveAs, session]
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
      if (event.defaultPrevented) return
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return
      if (event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (event.shiftKey) void saveAs()
        else void saveOriginal()
      } else if (event.key.toLowerCase() === "o") {
        event.preventDefault()
        void chooseFile()
      } else if (
        event.key.toLowerCase() === "f" &&
        !event.altKey &&
        !event.shiftKey &&
        session
      ) {
        event.preventDefault()
        setFocusSearchToken((current) => current + 1)
      }
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [chooseFile, saveAs, saveOriginal, session])

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

  const runStructureMutation = useCallback(
    (
      client: EidosFileWorkerClient,
      mutate: () => Promise<EidosFileSnapshot>
    ): Promise<void> => {
      const pending = structureMutationQueueRef.current
        .catch(() => undefined)
        .then(mutate)
        .then((next) => {
          if (clientRef.current === client) onStructureSnapshot(next)
        })
      structureMutationQueueRef.current = pending.catch(() => undefined)
      return pending
    },
    [onStructureSnapshot]
  )

  const updateActiveView = useCallback(
    async (changes: UpdateEidosFileViewInput) => {
      const client = clientRef.current
      if (!client || !activeView) return
      try {
        await runStructureMutation(client, () =>
          client.updateView(activeView.id, changes)
        )
      } catch (error) {
        setNotice(errorMessage(error))
      }
    },
    [activeView, runStructureMutation]
  )

  const exportTableCsv = useCallback(
    async (
      table: EidosFileTableSnapshot,
      view?: EidosFileViewInfo,
      scopedSearch = ""
    ) => {
      const source = clientRef.current
      if (!source || !session) {
        throw new Error("No active Eidos File table")
      }
      const result = await exportEidosFileViewCsv({
        source,
        table,
        view,
        search: scopedSearch,
      })
      const fileBase = session.fileName.replace(/\.eidos$/i, "")
      downloadBrowserCsv(
        result.bytes,
        [fileBase, table.table.name, view?.name]
          .filter((segment): segment is string => Boolean(segment))
          .map(csvFileNameSegment)
          .join(" - ")
      )
    },
    [session]
  )

  const addProperty = useCallback(
    async (field: CreateEidosFileFieldInput) => {
      const client = clientRef.current
      if (!client || !activeTable) return
      try {
        const next = await client.addField(
          activeTable.table.id,
          field,
          activeView && fieldInsertIndex !== null
            ? { viewId: activeView.id, index: fieldInsertIndex }
            : undefined
        )
        onStructureSnapshot(next)
        setAddPropertyOpen(false)
        setFieldInsertIndex(null)
        setViewReloadToken((current) => current + 1)
      } catch (error) {
        setNotice(errorMessage(error))
        throw error
      }
    },
    [activeTable, activeView, fieldInsertIndex, onStructureSnapshot]
  )

  const previewActiveFormula = useCallback(
    (input: EidosFileFormulaPreviewInput) => {
      const client = clientRef.current
      if (!client || !activeTable) {
        return Promise.reject(new Error("No active Eidos File table"))
      }
      return client.previewFormula(activeTable.table.id, input)
    },
    [activeTable]
  )

  const saveDerivedProperty = useCallback(
    async (
      field: EidosFileFieldInfo | null,
      property: Record<string, unknown>
    ) => {
      const client = clientRef.current
      if (!client || !activeTable || !field) return
      try {
        const next = await client.updateField(
          activeTable.table.id,
          field.tableColumnName,
          { property }
        )
        onStructureSnapshot(next)
        setViewReloadToken((current) => current + 1)
      } catch (error) {
        setNotice(errorMessage(error))
        throw error
      }
    },
    [activeTable, onStructureSnapshot]
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
        setFormulaTarget(null)
        setLookupTarget(null)
      }
    },
    [onStructureSnapshot, snapshot]
  )

  const renameTable = useCallback(
    async (tableId: string, name: string) => {
      const client = clientRef.current
      if (!client) return
      onStructureSnapshot(await client.updateTable(tableId, { name }))
    },
    [onStructureSnapshot]
  )

  const deleteTable = useCallback(
    async (tableId: string) => {
      const client = clientRef.current
      if (!client || !snapshot) return
      const next = await client.deleteTable(tableId)
      onStructureSnapshot(next)
      if (activeTableId === tableId) {
        const nextTableId =
          next.metadata.defaultTableId ?? next.tables[0]?.table.id ?? null
        setActiveTableId(nextTableId)
        setPropertyField(null)
        setFormulaTarget(null)
        setLookupTarget(null)
      }
      setActiveViews((current) => {
        if (!(tableId in current)) return current
        const nextViews = { ...current }
        delete nextViews[tableId]
        return nextViews
      })
    },
    [activeTableId, onStructureSnapshot, snapshot]
  )

  const reorderTables = useCallback(
    async (tableIds: string[]) => {
      const client = clientRef.current
      if (!client) return
      await runStructureMutation(client, () => client.reorderTables(tableIds))
    },
    [runStructureMutation]
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
      await runStructureMutation(client, () =>
        client.reorderViews(activeTable.table.id, viewIds)
      )
    },
    [activeTable, runStructureMutation]
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
        setFormulaTarget(null)
        setLookupTarget(null)
      },
      onError: (error) => setNotice(errorMessage(error)),
    }
  }, [activeTable, activeView, onStructureSnapshot, saveState.phase, snapshot])

  const applyPwaUpdate = useCallback(async () => {
    setUpdatingApp(true)
    setPwaUpdateError(null)
    try {
      await updateServiceWorker(true)
    } catch (error) {
      console.warn("Unable to activate the Eidos File update", error)
      setPwaUpdateError(t("updateFailed"))
      setUpdatingApp(false)
    }
  }, [t, updateServiceWorker])

  const status = statusPresentation(saveState.phase, saveState.mode, t)
  const StatusIcon = status.icon
  const directSupported = supportsDirectFileAccess()
  const pwaUpdatePrompt = (
    <PwaUpdatePrompt
      open={pwaUpdateAvailable}
      hasUnsavedChanges={Boolean(
        snapshot && session && hasUnsavedChanges(saveState)
      )}
      updating={updatingApp}
      error={pwaUpdateError}
      onDismiss={() => {
        setPwaUpdateAvailable(false)
        setPwaUpdateError(null)
      }}
      onUpdate={() => void applyPwaUpdate()}
    />
  )

  if (!snapshot || !session || !activeTable) {
    return (
      <main className="editor-shell" id="main-content">
        <AppTitlebar
          fileOpen={false}
          opening={saveState.phase === "opening"}
          theme={theme}
          onNew={() => void createBlankFile()}
          onOpen={() => void chooseFile()}
          onOpenSample={() => void openSample()}
          onOpenTemplate={(templateId) => void openTemplate(templateId)}
          onSave={() => void saveOriginal()}
          onDownload={() => void saveAs()}
          onReauthorize={() => void reauthorize()}
          onThemeChange={setTheme}
        />

        <div className="boot-loading" role="status">
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
          <span>{t("openingEidosFile")}</span>
        </div>

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

        {notice || saveState.error ? (
          <div className="launch-error" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{notice ?? saveState.error}</span>
          </div>
        ) : null}

        {pwaUpdatePrompt}

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
      <AppTitlebar
        fileOpen
        fileName={session.fileName}
        tableName={activeTable.table.name}
        opening={saveState.phase === "opening"}
        statusLabel={status.label}
        statusTone={status.tone}
        StatusIcon={StatusIcon}
        statusSpinning={
          saveState.phase === "saving" || saveState.phase === "opening"
        }
        needsPermission={
          session.mode === "direct" && session.permission !== "granted"
        }
        canSave={hasUnsavedChanges(saveState) && saveState.phase !== "saving"}
        saveLabel={canSaveToOriginal(saveState) ? t("save") : t("saveAs")}
        theme={theme}
        onNew={() => void createBlankFile()}
        onOpen={() => void chooseFile()}
        onOpenSample={() => void openSample()}
        onOpenTemplate={(templateId) => void openTemplate(templateId)}
        onSave={() => void saveOriginal()}
        onDownload={() => void saveAs()}
        onReauthorize={() => void reauthorize()}
        onThemeChange={setTheme}
      />

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

      <EidosFileEditorShell
        className="min-h-0 flex-1 !h-auto"
        viewTabs={
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
            onExportCsv={(view) =>
              exportTableCsv(
                activeTable,
                view,
                view.id === activeView?.id ? search : ""
              )
            }
            onExportError={(error) => setNotice(errorMessage(error))}
            onUpdate={async (viewId, changes) => {
              const client = clientRef.current
              if (!client) return
              await runStructureMutation(client, () =>
                client.updateView(viewId, changes)
              )
            }}
          />
        }
        queryToolbar={
          <EidosFileQueryToolbar
            fields={activeTable.fields}
            filter={activeView?.filter ?? null}
            sorts={activeView?.sorts ?? []}
            search={search}
            focusSearchToken={focusSearchToken}
            disabled={saveState.phase === "saving"}
            onSearchChange={setSearch}
            onFilterChange={(filter) => updateActiveView({ filter })}
            onSortsChange={(sorts) => updateActiveView({ sorts })}
          />
        }
        fields={
          activeView ? (
            <EidosFileViewFieldsPopover
              fields={activeTable.fields}
              view={activeView}
              disabled={saveState.phase === "saving"}
              onUpdate={updateActiveView}
              onFieldOpen={setPropertyField}
              onFieldAdd={() => {
                setFieldInsertIndex(null)
                setAddPropertyOpen(true)
              }}
            />
          ) : undefined
        }
        fieldCreator={
          <EidosFileFieldCreatePopover
            open={addPropertyOpen}
            onOpenChange={(open) => {
              setAddPropertyOpen(open)
              if (!open) setFieldInsertIndex(null)
            }}
            table={activeTable}
            tables={snapshot.tables}
            disabled={saveState.phase === "saving"}
            onCreate={addProperty}
            onPreviewFormula={previewActiveFormula}
          />
        }
        contentProps={{
          className: "eidos-file-content",
          id: "eidos-file-grid",
        }}
        sheetTabs={
          <EidosFileSheetTabs
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
              setFormulaTarget(null)
              setLookupTarget(null)
            }}
            onReorder={reorderTables}
            onRename={(table, name) => renameTable(table.id, name)}
            onDelete={(table) => deleteTable(table.id)}
            onExportCsv={(table) => {
              const tableSnapshot = snapshot.tables.find(
                (candidate) => candidate.table.id === table.id
              )
              if (!tableSnapshot) {
                return Promise.reject(new Error("Eidos File table not found"))
              }
              return exportTableCsv(tableSnapshot)
            }}
            onExportError={(error) => setNotice(errorMessage(error))}
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
        }
        overlays={
          <>
            <EidosFileFormulaEditorPopover
              field={formulaTarget}
              fields={activeTable.fields}
              open={formulaTarget !== null}
              onOpenChange={(open) => {
                if (!open) setFormulaTarget(null)
              }}
              onPreview={previewActiveFormula}
              onSave={(property) =>
                saveDerivedProperty(formulaTarget, property)
              }
            />
            <EidosFileLookupEditorPopover
              field={lookupTarget}
              fields={activeTable.fields}
              tables={snapshot.tables}
              open={lookupTarget !== null}
              onOpenChange={(open) => {
                if (!open) setLookupTarget(null)
              }}
              onSave={(property) => saveDerivedProperty(lookupTarget, property)}
            />
          </>
        }
      >
        <SharedEidosFileEditorView
          key={`${activeTable.table.id}:${activeView?.id ?? "default"}`}
          theme={theme}
          plugins={editorPlugins}
          source={clientRef.current!}
          table={activeTable}
          tables={snapshot.tables}
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
          onEditFormula={setFormulaTarget}
          onEditLookup={setLookupTarget}
          onFieldAdd={(position) => {
            setFieldInsertIndex(position ?? null)
            setAddPropertyOpen(true)
          }}
          onError={(error) => setNotice(errorMessage(error))}
        />
      </EidosFileEditorShell>

      {pwaUpdatePrompt}

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
          if (file) {
            void openImportedEidosFile(file).then(openPreparedFile)
          }
        }}
      />
    </main>
  )
}
