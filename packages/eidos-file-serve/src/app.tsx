import {
  type FormEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type {
  CreateEidosFileFieldInput,
  CreateEidosFileTableInput,
  EidosFileFieldInfo,
  EidosFileFormulaPreviewInput,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRowRange,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui/context"
import { exportEidosFileViewCsv } from "@eidos.space/eidos-file-ui/eidos-file-editor-chrome"
import { EidosFileEditorShell } from "@eidos.space/eidos-file-ui/eidos-file-editor-shell"
import {
  EidosFileEmptyState,
  type EidosFileEmptyStateTemplate,
} from "@eidos.space/eidos-file-ui/eidos-file-empty-state"
import { EidosFileFieldCreatePopover } from "@eidos.space/eidos-file-ui/eidos-file-field-create-popover"
import { EidosFileQueryToolbar } from "@eidos.space/eidos-file-ui/eidos-file-query-toolbar"
import { EidosFileSheetCreatePopover } from "@eidos.space/eidos-file-ui/eidos-file-sheet-create-popover"
import { EidosFileSheetTabs } from "@eidos.space/eidos-file-ui/eidos-file-sheet-tabs"
import { EidosFileViewFieldsPopover } from "@eidos.space/eidos-file-ui/eidos-file-view-fields-popover"
import { EidosFileViewTabs } from "@eidos.space/eidos-file-ui/eidos-file-view-tabs"
import {
  EidosFileFormulaEditorPopover,
  EidosFileLookupEditorPopover,
  type EidosFileFormulaEditorAnchor,
} from "@eidos.space/eidos-file-ui/eidos-file-derived-field-editor"
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
import { AlertTriangle, Check, LoaderCircle, X } from "lucide-react"

import {
  CliHostAccessError,
  createBrowserId,
  EidosFileHttpClient,
  establishCliHostSession,
  fetchCliHostManifest,
  subscribeCliHostEvents,
  uploadCliHostAssets,
  type CliHostManifest,
} from "./client"
import {
  activateCliHostUrl,
  cliHostAssetPresenter,
  createCliHostAssetSession,
  pickCliHostAssetFiles,
} from "./assets"
import { firstTableTemplate, resolveServeEditorState } from "./empty-file"

const EidosFileEditorView = lazy(() =>
  import("@eidos.space/eidos-file-ui/eidos-file-editor-view").then(
    (module) => ({
      default: module.EidosFileEditorView,
    })
  )
)

interface FormulaEditorTarget {
  field: EidosFileFieldInfo
  previewRowId?: string
  anchor?: EidosFileFormulaEditorAnchor
}

type Theme = "light" | "dark"

function initialTheme(): Theme {
  const stored = window.localStorage.getItem("eidos-file-theme")
  if (stored === "light" || stored === "dark") return stored
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function initialLocale(): "en" | "zh" {
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

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
  return "The operation did not complete."
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

function pickCsvFile(): Promise<File | null> {
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

function downloadCsv(bytes: Uint8Array, fileName: string): void {
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

export function ServeApp() {
  const [theme] = useState<Theme>(initialTheme)
  const [locale] = useState<"en" | "zh">(initialLocale)
  const [manifest, setManifest] = useState<CliHostManifest | null>(null)
  const [bootPhase, setBootPhase] = useState<
    | "loading"
    | "pairing-required"
    | "no-manifest"
    | "opening"
    | "ready"
    | "error"
  >("loading")
  const [bootError, setBootError] = useState<string | null>(null)
  const [accessKey, setAccessKey] = useState("")
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [bootAttempt, setBootAttempt] = useState(0)
  const [snapshot, setSnapshot] = useState<EidosFileSnapshot | null>(null)
  const [client, setClient] = useState<EidosFileHttpClient | null>(null)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [activeViews, setActiveViews] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [creatingTemplate, setCreatingTemplate] =
    useState<EidosFileEmptyStateTemplate | null>(null)
  const [templateError, setTemplateError] = useState<{
    template: EidosFileEmptyStateTemplate
    message: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [propertyField, setPropertyField] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [addPropertyOpen, setAddPropertyOpen] = useState(false)
  const [formulaTarget, setFormulaTarget] =
    useState<FormulaEditorTarget | null>(null)
  const [lookupTarget, setLookupTarget] = useState<EidosFileFieldInfo | null>(
    null
  )
  const [fieldInsertIndex, setFieldInsertIndex] = useState<number | null>(null)
  const [viewReloadToken, setViewReloadToken] = useState(0)

  const clientRef = useRef<EidosFileHttpClient | null>(null)
  const snapshotRef = useRef<EidosFileSnapshot | null>(null)
  const structureMutationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const csvFilesRef = useRef(new Map<string, File>())

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem("eidos-file-theme", theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    let openingClient: EidosFileHttpClient | null = null
    void (async () => {
      try {
        setBootError(null)
        setPairingError(null)
        await establishCliHostSession()
        const nextManifest = await fetchCliHostManifest()
        if (cancelled) return
        if (!nextManifest) {
          setBootPhase("no-manifest")
          return
        }
        setManifest(nextManifest)
        setBootPhase("opening")
        const nextClient = new EidosFileHttpClient()
        openingClient = nextClient
        const result = await nextClient.openEditorSource(
          nextManifest.fileName,
          createBrowserId(),
          nextManifest.access
        )
        if (cancelled) {
          nextClient.terminate()
          return
        }
        clientRef.current = nextClient
        setClient(nextClient)
        setSnapshot(result.snapshot)
        setActiveTableId(
          result.snapshot.metadata.defaultTableId ??
            result.snapshot.tables[0]?.table.id ??
            null
        )
        setBootPhase("ready")
      } catch (error) {
        openingClient?.terminate()
        if (error instanceof CliHostAccessError) {
          if (!cancelled) {
            setPairingError(
              error.code === "pairing-failed" ? error.message : null
            )
            setBootPhase("pairing-required")
          }
          return
        }
        if (!cancelled) {
          setBootError(errorMessage(error))
          setBootPhase("error")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bootAttempt])

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

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
  const assetSession = useMemo(
    () =>
      manifest?.assets && snapshot
        ? createCliHostAssetSession(
            manifest.assets,
            `cli-assets:${snapshot.metadata.fileId}`,
            snapshot.metadata.fileId
          )
        : undefined,
    [manifest?.assets, snapshot?.metadata.fileId]
  )

  const importAssetFiles = useCallback(async () => {
    if (!assetSession || !manifest?.assets?.mounted) return []
    const files = await pickCliHostAssetFiles()
    return files.length > 0 ? uploadCliHostAssets(files) : []
  }, [assetSession, manifest?.assets?.mounted])

  const importDroppedAssetFiles = useCallback(
    (files: File[]) =>
      assetSession && manifest?.assets?.mounted
        ? uploadCliHostAssets(files)
        : Promise.resolve([]),
    [assetSession, manifest?.assets?.mounted]
  )

  const editorPlugins = useMemo(
    () => [
      eidosFileGalleryPlugin,
      eidosFileKanbanPlugin,
      createEidosFileCsvImportPlugin(
        {
          async pickFile() {
            const file = await pickCsvFile()
            if (!file) return null
            const source: EidosFileCsvImportSource = {
              id: createBrowserId(),
              fileName: file.name,
            }
            csvFilesRef.current.set(source.id, file)
            return source
          },
          async preview(source, options) {
            const current = clientRef.current
            const file = csvFilesRef.current.get(source.id)
            if (!current || !file) throw new Error("CSV import is unavailable")
            return current.previewCsv(
              source.fileName,
              await file.arrayBuffer(),
              options
            )
          },
          async import(source, options) {
            const current = clientRef.current
            const file = csvFilesRef.current.get(source.id)
            if (!current || !file) throw new Error("CSV import is unavailable")
            return current.importCsv(
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
            actionAriaLabel: "Import CSV",
            actionLabel: "Import CSV",
            cancel: "Cancel",
            chooseAnother: "Choose another file",
            choosePrompt: "Choose a CSV file to import",
            dialogTitle: "Import CSV",
            fieldName: "Field",
            fieldType: "Type",
            fileSummary: "rows detected",
            importRows: "Import rows",
            importing: "Importing…",
            localOnly: "Rows are written straight to the file.",
            parsing: "Parsing…",
            preview: "Preview",
            tableName: "Table name",
            titleType: "First row is the header",
            typeCheckbox: "Checkbox",
            typeDate: "Date",
            typeDatetime: "Datetime",
            typeNumber: "Number",
            typeText: "Text",
            typeUrl: "URL",
            unableToImport: "Unable to import this CSV file",
            unableToRead: "Unable to read this file",
          },
        }
      ),
    ],
    []
  )

  const onRowMutation = useCallback((result: EidosFileRowMutationResult) => {
    setSnapshot((current) =>
      current ? updateSnapshotRowCount(current, result) : current
    )
  }, [])

  const onStructureSnapshot = useCallback((next: EidosFileSnapshot) => {
    snapshotRef.current = next
    setSnapshot(next)
    setPropertyField((current) => {
      if (!current) return null
      return (
        next.tables
          .find((table) => table.table.id === current.tableId)
          ?.fields.find(
            (field) => field.tableColumnName === current.tableColumnName
          ) ?? null
      )
    })
  }, [])

  useEffect(() => {
    if (!client || bootPhase !== "ready") return
    let disposed = false
    let refreshing = false
    let refreshPending = false
    let retryTimer: number | undefined
    let hasOpened = false

    const refresh = async () => {
      refreshPending = true
      if (disposed || refreshing) return
      if (client.hasInFlightMutations()) {
        retryTimer = window.setTimeout(() => void refresh(), 80)
        return
      }
      refreshing = true
      refreshPending = false
      try {
        const next = await client.getSnapshot()
        if (!disposed) {
          onStructureSnapshot(next)
          setViewReloadToken((token) => token + 1)
        }
      } catch (error) {
        if (!disposed) setNotice(errorMessage(error))
      } finally {
        refreshing = false
        if (!disposed && refreshPending) void refresh()
      }
    }

    const unsubscribe = subscribeCliHostEvents({
      onRevision(revision) {
        if (String(snapshotRef.current?.metadata.revision) !== revision) {
          void refresh()
        }
      },
      onOpen() {
        if (hasOpened) void refresh()
        hasOpened = true
      },
    })
    return () => {
      disposed = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      unsubscribe()
    }
  }, [bootPhase, client, onStructureSnapshot])

  const submitPairing = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setPairingError(null)
      try {
        await establishCliHostSession(accessKey)
        setAccessKey("")
        setBootPhase("loading")
        setBootAttempt((attempt) => attempt + 1)
      } catch (error) {
        setPairingError(errorMessage(error))
      }
    },
    [accessKey]
  )

  const runStructureMutation = useCallback(
    (
      current: EidosFileHttpClient,
      mutate: () => Promise<EidosFileSnapshot>
    ): Promise<void> => {
      setSaving(true)
      const pending = structureMutationQueueRef.current
        .catch(() => undefined)
        .then(mutate)
        .then((next) => {
          if (clientRef.current === current) onStructureSnapshot(next)
        })
      structureMutationQueueRef.current = pending.catch(() => undefined)
      return pending.finally(() => setSaving(false))
    },
    [onStructureSnapshot]
  )

  const updateActiveView = useCallback(
    async (changes: UpdateEidosFileViewInput) => {
      const current = clientRef.current
      if (!current || !activeView) return
      try {
        await runStructureMutation(current, () =>
          current.updateView(activeView.id, changes)
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
      if (!source || !manifest) {
        throw new Error("No active Eidos File table")
      }
      const result = await exportEidosFileViewCsv({
        source,
        table,
        view,
        search: scopedSearch,
      })
      const fileBase = manifest.fileName.replace(/\.eidos$/i, "")
      downloadCsv(
        result.bytes,
        [fileBase, table.table.name, view?.name]
          .filter((segment): segment is string => Boolean(segment))
          .map(csvFileNameSegment)
          .join(" - ")
      )
    },
    [manifest]
  )

  const addProperty = useCallback(
    async (field: CreateEidosFileFieldInput) => {
      const current = clientRef.current
      if (!current || !activeTable) return
      try {
        const next = await current.addField(
          activeTable.table.id,
          field,
          activeView && fieldInsertIndex !== null
            ? { viewId: activeView.id, index: fieldInsertIndex }
            : undefined
        )
        onStructureSnapshot(next)
        setAddPropertyOpen(false)
        setFieldInsertIndex(null)
        setViewReloadToken((token) => token + 1)
      } catch (error) {
        setNotice(errorMessage(error))
        throw error
      }
    },
    [activeTable, activeView, fieldInsertIndex, onStructureSnapshot]
  )

  const previewActiveFormula = useCallback(
    (input: EidosFileFormulaPreviewInput) => {
      const current = clientRef.current
      if (!current || !activeTable) {
        return Promise.reject(new Error("No active Eidos File table"))
      }
      return current.previewFormula(activeTable.table.id, input)
    },
    [activeTable]
  )
  const openFormulaEditor = useCallback(
    (
      field: EidosFileFieldInfo,
      previewRowId?: string,
      anchor?: EidosFileFormulaEditorAnchor
    ) => {
      setFormulaTarget({ field, previewRowId, anchor })
    },
    []
  )

  const saveDerivedProperty = useCallback(
    async (
      field: EidosFileFieldInfo | null,
      property: Record<string, unknown>
    ) => {
      const current = clientRef.current
      if (!current || !activeTable || !field) return
      try {
        const next = await current.updateField(
          activeTable.table.id,
          field.tableColumnName,
          { property }
        )
        onStructureSnapshot(next)
        setViewReloadToken((token) => token + 1)
      } catch (error) {
        setNotice(errorMessage(error))
        throw error
      }
    },
    [activeTable, onStructureSnapshot]
  )

  const createTable = useCallback(
    async (input: CreateEidosFileTableInput) => {
      const current = clientRef.current
      if (!current || !snapshot) return
      const previousIds = new Set(
        snapshot.tables.map((table) => table.table.id)
      )
      const next = await current.createTable(input)
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

  const createFirstTable = useCallback(
    async (template: EidosFileEmptyStateTemplate) => {
      setCreatingTemplate(template)
      setTemplateError(null)
      try {
        await createTable(firstTableTemplate(template, locale))
      } catch (error) {
        setTemplateError({ template, message: errorMessage(error) })
      } finally {
        setCreatingTemplate(null)
      }
    },
    [createTable, locale]
  )

  const renameTable = useCallback(
    async (tableId: string, name: string) => {
      const current = clientRef.current
      if (!current) return
      onStructureSnapshot(await current.updateTable(tableId, { name }))
    },
    [onStructureSnapshot]
  )

  const deleteTable = useCallback(
    async (tableId: string) => {
      const current = clientRef.current
      if (!current || !snapshot) return
      const next = await current.deleteTable(tableId)
      onStructureSnapshot(next)
      if (activeTableId === tableId) {
        const nextTableId =
          next.metadata.defaultTableId ?? next.tables[0]?.table.id ?? null
        setActiveTableId(nextTableId)
        setPropertyField(null)
        setFormulaTarget(null)
        setLookupTarget(null)
      }
      setActiveViews((currentViews) => {
        if (!(tableId in currentViews)) return currentViews
        const nextViews = { ...currentViews }
        delete nextViews[tableId]
        return nextViews
      })
    },
    [activeTableId, onStructureSnapshot, snapshot]
  )

  const reorderTables = useCallback(
    async (tableIds: string[]) => {
      const current = clientRef.current
      if (!current) return
      await runStructureMutation(current, () => current.reorderTables(tableIds))
    },
    [runStructureMutation]
  )

  const createView = useCallback(
    async (name: string, type: string) => {
      const current = clientRef.current
      if (!current || !activeTable) return
      const contribution = createEidosFilePluginRegistry(
        editorPlugins as EidosFilePlugin[]
      ).views[type]
      const next = await current.createView(activeTable.table.id, {
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
        setActiveViews((currentViews) => ({
          ...currentViews,
          [activeTable.table.id]: created.id,
        }))
      }
    },
    [activeTable, editorPlugins, onStructureSnapshot]
  )

  const renameView = useCallback(
    async (viewId: string, name: string) => {
      const current = clientRef.current
      if (!current) return
      onStructureSnapshot(await current.updateView(viewId, { name }))
    },
    [onStructureSnapshot]
  )

  const duplicateView = useCallback(
    async (viewId: string) => {
      const current = clientRef.current
      if (!current || !activeTable) return
      const previousIds = new Set(activeTable.views.map((view) => view.id))
      const next = await current.duplicateView(viewId)
      const duplicate = next.tables
        .find((table) => table.table.id === activeTable.table.id)
        ?.views.find((view) => !previousIds.has(view.id))
      onStructureSnapshot(next)
      if (duplicate) {
        setActiveViews((currentViews) => ({
          ...currentViews,
          [activeTable.table.id]: duplicate.id,
        }))
      }
    },
    [activeTable, onStructureSnapshot]
  )

  const deleteView = useCallback(
    async (viewId: string) => {
      const current = clientRef.current
      if (!current || !activeTable) return
      const next = await current.deleteView(viewId)
      const remaining = next.tables.find(
        (table) => table.table.id === activeTable.table.id
      )?.views
      onStructureSnapshot(next)
      if (activeView?.id === viewId && remaining?.[0]) {
        setActiveViews((currentViews) => ({
          ...currentViews,
          [activeTable.table.id]: remaining[0].id,
        }))
      }
    },
    [activeTable, activeView?.id, onStructureSnapshot]
  )

  const reorderViews = useCallback(
    async (viewIds: string[]) => {
      const current = clientRef.current
      if (!current || !activeTable) return
      await runStructureMutation(current, () =>
        current.reorderViews(activeTable.table.id, viewIds)
      )
    },
    [activeTable, runStructureMutation]
  )

  const deleteSingleRow = useCallback(
    async (row: EidosFileRow) => {
      const current = clientRef.current
      if (!current || !activeTable || row._id == null) return
      const result = await current.deleteRows(activeTable.table.id, [
        String(row._id),
      ])
      setSnapshot((currentSnapshot) =>
        currentSnapshot
          ? updateSnapshotRowCount(currentSnapshot, result)
          : currentSnapshot
      )
      setViewReloadToken((token) => token + 1)
    },
    [activeTable]
  )

  const deleteRowRanges = useCallback(
    async (
      ranges: EidosFileRowRange[],
      query: Parameters<EidosFileHttpClient["deleteRowRanges"]>[2]
    ) => {
      const current = clientRef.current
      if (!current || !activeTable) return
      const count = ranges.reduce(
        (total, range) => total + range.endIndex - range.startIndex,
        0
      )
      if (!window.confirm(`Delete ${count} row(s)? This cannot be undone.`)) {
        return
      }
      const result = await current.deleteRowRanges(
        activeTable.table.id,
        ranges,
        query
      )
      setSnapshot((currentSnapshot) =>
        currentSnapshot
          ? updateSnapshotRowCount(currentSnapshot, result)
          : currentSnapshot
      )
      setViewReloadToken((token) => token + 1)
    },
    [activeTable]
  )

  const pluginContext = useMemo<EidosFilePluginContext | null>(() => {
    if (!client || !snapshot) return null
    return {
      source: client,
      snapshot,
      activeTable,
      activeView,
      disabled: saving,
      onSnapshot: onStructureSnapshot,
      onTableSelect: (tableId) => {
        setActiveTableId(tableId)
        setPropertyField(null)
        setFormulaTarget(null)
        setLookupTarget(null)
      },
      onError: (error) => setNotice(errorMessage(error)),
    }
  }, [activeTable, activeView, client, onStructureSnapshot, saving, snapshot])

  const editorState = resolveServeEditorState({
    bootPhase,
    hasSnapshot: snapshot !== null,
    hasClient: client !== null,
    hasActiveTable: activeTable !== null,
  })

  const noticeToast = notice ? (
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
  ) : null

  if (bootPhase === "pairing-required") {
    return (
      <main className="serve-shell">
        <form className="pairing-card" onSubmit={submitPairing}>
          <div>
            <h1>Pair this browser</h1>
            <p>
              Paste the access link printed by <code>eidos serve</code>. Access
              lasts until the CLI process stops.
            </p>
          </div>
          <label htmlFor="serve-access-key">
            Eidos Serve access link or key
          </label>
          <input
            id="serve-access-key"
            type="password"
            value={accessKey}
            autoComplete="off"
            autoFocus
            spellCheck={false}
            onChange={(event) => setAccessKey(event.target.value)}
          />
          {pairingError ? (
            <p className="pairing-error" role="alert">
              {pairingError}
            </p>
          ) : null}
          <button type="submit" disabled={!accessKey.trim()}>
            Pair browser
          </button>
          <p className="pairing-note">
            Treat this access link as a secret. LAN mode should only be used on
            a private network you trust.
          </p>
        </form>
      </main>
    )
  }

  if (bootPhase === "no-manifest") {
    return (
      <main className="serve-shell">
        <div className="boot-error" role="alert">
          <p>This editor is hosted by the Eidos CLI.</p>
          <p>
            Run <code>eidos serve &lt;file.eidos&gt;</code> and open the printed
            URL.
          </p>
        </div>
      </main>
    )
  }

  if (bootPhase === "error") {
    return (
      <main className="serve-shell">
        <div className="boot-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <p>{bootError}</p>
        </div>
      </main>
    )
  }

  if (editorState === "loading" || !snapshot || !client) {
    return (
      <main className="serve-shell">
        <div className="boot-loading" role="status">
          <LoaderCircle className="spin" size={16} aria-hidden="true" />
          <span>Opening {manifest?.fileName ?? "Eidos File"}…</span>
        </div>
      </main>
    )
  }

  if (editorState === "empty" || !activeTable) {
    return (
      <EidosFileUIProvider themeName={theme} locale={locale}>
        <main className="serve-shell">
          <EidosFileEditorShell className="min-h-0 flex-1 !h-auto">
            <EidosFileEmptyState
              disabled={saving}
              creatingTemplate={creatingTemplate}
              templateError={templateError}
              importAction={
                pluginContext ? (
                  <EidosFilePluginSlot
                    context={pluginContext}
                    plugins={editorPlugins}
                    slot="sheet-create"
                  />
                ) : null
              }
              onCreateTemplate={(template) => void createFirstTable(template)}
            />
          </EidosFileEditorShell>
          {noticeToast}
        </main>
      </EidosFileUIProvider>
    )
  }

  const StatusIcon = saving ? LoaderCircle : Check
  const statusLabel = saving ? "Saving" : "Saved"

  return (
    <EidosFileUIProvider
      themeName={theme}
      locale={locale}
      activateUrl={activateCliHostUrl}
      assetSession={assetSession}
      assetPresenter={assetSession ? cliHostAssetPresenter : undefined}
    >
      <main className="serve-shell">
        <EidosFileEditorShell
          className="min-h-0 flex-1 !h-auto"
          searchNavigation={{
            search,
            scopeKey: `${snapshot.metadata.fileId}:${activeTable.table.id}:${activeView?.id ?? "default"}`,
          }}
          viewTabs={
            <EidosFileViewTabs
              views={activeTable.views}
              fields={activeTable.fields}
              activeView={activeView}
              disabled={saving}
              onSelect={(viewId) =>
                setActiveViews((currentViews) => ({
                  ...currentViews,
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
                const current = clientRef.current
                if (!current) return
                await runStructureMutation(current, () =>
                  current.updateView(viewId, changes)
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
              disabled={saving}
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
                disabled={saving}
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
              disabled={saving}
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
              tableSnapshots={snapshot.tables}
              activeTableId={activeTable.table.id}
              disabled={saving}
              createAction={
                <EidosFileSheetCreatePopover
                  disabled={saving}
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
              onSetRecordLabel={async (table, field) => {
                const current = clientRef.current
                if (!current) throw new Error("No active Eidos File")
                const next = await current.updateField(
                  table.table.id,
                  field.id ?? field.tableColumnName,
                  { isRecordLabel: true }
                )
                onStructureSnapshot(next)
                setViewReloadToken((token) => token + 1)
              }}
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
                  aria-label={`${statusLabel}, ${manifest?.fileName ?? ""}, SQLite ${snapshot.metadata.schemaVersion}`}
                  title={`${statusLabel} · ${manifest?.fileName ?? ""} · SQLite ${snapshot.metadata.schemaVersion}`}
                >
                  <StatusIcon
                    className={saving ? "spin" : ""}
                    size={13}
                    aria-hidden="true"
                  />
                  <span aria-hidden="true">
                    <span>{statusLabel}</span>
                    <span className="status-separator"> / </span>
                    <span>{manifest?.fileName}</span>
                    <span className="status-separator"> / </span>
                    <span>SQLite {snapshot.metadata.schemaVersion}</span>
                  </span>
                </span>
              }
            />
          }
          overlays={
            <>
              <EidosFileFormulaEditorPopover
                field={formulaTarget?.field ?? null}
                fields={activeTable.fields}
                previewRowId={formulaTarget?.previewRowId}
                anchor={formulaTarget?.anchor}
                open={formulaTarget !== null}
                onOpenChange={(open) => {
                  if (!open) setFormulaTarget(null)
                }}
                onPreview={previewActiveFormula}
                onSave={(property) =>
                  saveDerivedProperty(formulaTarget?.field ?? null, property)
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
                onSave={(property) =>
                  saveDerivedProperty(lookupTarget, property)
                }
              />
            </>
          }
        >
          <Suspense
            fallback={
              <div className="shared-grid-loading" role="status">
                Loading Eidos File editor…
              </div>
            }
          >
            <EidosFileEditorView
              key={`${activeTable.table.id}:${activeView?.id ?? "default"}`}
              plugins={editorPlugins}
              source={client}
              table={activeTable}
              tables={snapshot.tables}
              view={activeView}
              search={search}
              disabled={saving}
              reloadToken={viewReloadToken}
              capabilities={{
                read: true,
                mutate: !saving,
                resolveAssets: assetSession !== undefined,
                rawFile: false,
                nativeFileSystem: false,
              }}
              propertyField={propertyField}
              onMutation={onRowMutation}
              onSnapshot={onStructureSnapshot}
              onDeleteRow={deleteSingleRow}
              onDeleteRows={deleteRowRanges}
              onFieldOpen={setPropertyField}
              onFieldClose={() => setPropertyField(null)}
              onEditFormula={openFormulaEditor}
              onEditLookup={setLookupTarget}
              onFieldAdd={(position) => {
                setFieldInsertIndex(position ?? null)
                setAddPropertyOpen(true)
              }}
              onError={(error) => setNotice(errorMessage(error))}
              onImportFiles={
                manifest?.assets?.mounted ? importAssetFiles : undefined
              }
              onImportDroppedFiles={
                manifest?.assets?.mounted ? importDroppedAssetFiles : undefined
              }
            />
          </Suspense>
        </EidosFileEditorShell>

        {noticeToast}
      </main>
    </EidosFileUIProvider>
  )
}
