import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { baseRowQueryAffectedByFieldChanges } from "@eidos.space/base"
import type {
  BaseColumnStatConfig,
  BaseFieldInfo,
  BaseFilterGroup,
  BaseFormulaPreviewInput,
  BaseRow,
  BaseRowMutationResult,
  BaseRowsMutationResult,
  BaseRowQuery,
  BaseRowRange,
  BaseRelationValue,
  BaseRowsDeleteResult,
  BaseSnapshot,
  BaseSqlPrimitive,
  UpdateBaseFieldInput,
} from "@eidos.space/base"
import {
  BaseEditorContent,
  BaseEditorRoot,
  BaseEditorWorkbar,
} from "@eidos.space/base-ui/base-editor-chrome"
import { uniqueSpaceEntryName } from "@eidos.space/file-space/names"
import {
  AlertTriangle,
  Check,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useOptionalTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import {
  isSameOrDescendant,
  type SpaceBaseRecordTarget,
  toSpaceBaseRecordUrl,
  toSpaceFileUrl,
} from "@/apps/web-app/components/file-space/file-path"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useSpaceBase } from "@/apps/web-app/hooks/use-space-base"
import { useFileExtensionBaseViews } from "@/apps/web-app/hooks/use-file-extension-base-views"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"
import { Button } from "@/components/ui/button"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useQuickOpenStore } from "@/apps/web-app/store/quick-open-store"
import { useFileSpaceSettings } from "@/apps/web-app/store/file-space-settings"
import { openSettings } from "@/components/settings/settings-events"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { BaseGrid } from "./base-grid"
import { BaseGalleryView } from "./base-gallery-view"
import { BaseCsvImportPopover } from "./base-csv-import-popover"
import { BaseCsvExportPopover } from "./base-csv-export-popover"
import {
  baseDefaultTableForTemplate,
  type BaseTemplateId,
} from "./base-create-options"
import { BaseEmptyState } from "./base-empty-state"
import { baseErrorMessage } from "./base-error-message"
import {
  baseFieldDisplayName,
  baseViewVisibleSystemFields,
  isOptionalBaseSystemField,
} from "./base-field-visibility"
import { BaseFieldPropertyPanel } from "./base-field-property-panel"
import { baseAssetDirectory } from "./base-file-settings"
import { BaseKanbanView } from "./base-kanban-view"
import { baseOpenErrorPresentation } from "./base-open-error"
import { BaseFormulaEditor } from "./base-formula-editor"
import { BaseLookupEditor } from "./base-lookup-editor"
import { BaseQueryToolbar } from "./base-query-toolbar"
import { baseRecordCardPageProjection } from "./base-record-card-layout"
import { BaseRecordPage, BaseRecordUnavailable } from "./base-record-page"
import { baseRecordTitle } from "./base-record-format"
import { BaseRenameDialog } from "./base-rename-dialog"
import { BaseSheetCreatePopover } from "./base-sheet-create-popover"
import { BaseSheetTabs } from "./base-sheet-tabs"
import { BaseStructureDialog } from "./base-structure-dialog"
import { BaseStructureMenu } from "./base-structure-menu"
import { BaseViewMenu } from "./base-view-menu"
import {
  baseExtensionContributionId,
  isBaseBuiltInViewType,
} from "./base-view-selector"
import { BaseViewTabs } from "./base-view-tabs"
import { orderedBaseFields } from "./base-view-layout"
import { useBaseRecordInspectorRow } from "./use-base-record-inspector-row"
import { ExtensionBaseViewSurface } from "../../file-extensions/extension-base-view-surface"

interface SpaceBaseEditorProps {
  filePath: string
  recordTarget?: SpaceBaseRecordTarget
}

type RenameTarget = { kind: "table"; tableId: string; name: string }

type DeleteTarget =
  | RenameTarget
  | {
      kind: "field"
      tableId: string
      columnName: string
      name: string
    }

function isSupportedBaseViewType(type: string): boolean {
  return (
    isBaseBuiltInViewType(type) || Boolean(baseExtensionContributionId(type))
  )
}

interface BaseMutationOptions {
  statusKey: string
  blocking?: boolean
  errorMode?: "global" | "local"
}

function baseMutationStatusKey(
  ...parts: Array<string | number | null | undefined>
): string {
  return parts.map((part) => encodeURIComponent(String(part ?? ""))).join(":")
}

function baseMutationRevision(result: unknown): string | null {
  if (!result || typeof result !== "object") return null
  if (
    "revision" in result &&
    typeof (result as { revision?: unknown }).revision === "string"
  ) {
    return (result as { revision: string }).revision
  }
  if (
    "metadata" in result &&
    result.metadata &&
    typeof result.metadata === "object" &&
    "updatedAt" in result.metadata &&
    typeof (result.metadata as { updatedAt?: unknown }).updatedAt === "string"
  ) {
    return (result.metadata as { updatedAt: string }).updatedAt
  }
  if ("snapshot" in result) {
    return baseMutationRevision((result as { snapshot?: unknown }).snapshot)
  }
  return null
}

function combineBaseFilters(
  current: BaseFilterGroup | null | undefined,
  groupField: string,
  value: string | null
): BaseFilterGroup {
  const groupRule = {
    type: "rule" as const,
    field: groupField,
    operator: value === null ? ("is-empty" as const) : ("equals" as const),
    ...(value === null ? {} : { value }),
  }
  return {
    type: "group",
    conjunction: "and",
    children: current ? [current, groupRule] : [groupRule],
  }
}

function csvFileNameSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "") || "view"
  )
}

export function SpaceBaseEditor({
  filePath,
  recordTarget,
}: SpaceBaseEditorProps) {
  const recordTableId = recordTarget?.tableId
  const recordId = recordTarget?.recordId
  const recordMode = Boolean(recordTableId && recordId)
  const editorRef = useRef<HTMLDivElement>(null)
  const tabContext = useOptionalTabContext()
  const registerQuickOpenSection = useQuickOpenStore(
    (state) => state.registerSection
  )
  const unregisterQuickOpenSection = useQuickOpenStore(
    (state) => state.unregisterSection
  )
  const { currentSpace } = useCurrentSpace()
  const { baseViews: extensionBaseViews } = useFileExtensionBaseViews(
    currentSpace?.id,
    filePath
  )
  const baseAssetFolder = useFileSpaceSettings(
    (state) =>
      (currentSpace?.id
        ? state.bySpace[currentSpace.id]?.baseAssetFolder
        : undefined) ?? "space-assets"
  )
  const attachmentDirectory = baseAssetDirectory(filePath, baseAssetFolder)
  const {
    reveal,
    list: listFiles,
    createDirectory,
    createBinary,
    importFiles,
  } = useSpaceFiles(currentSpace?.id)
  const {
    getSnapshot,
    selectCsv,
    previewCsvImport,
    importCsv,
    getCsvOperation,
    cancelCsvOperation,
    exportCsv,
    getTablePage,
    getTableRow,
    getTableGroupCounts,
    getTableColumnStats,
    createTable,
    updateTable,
    deleteTable,
    addField,
    previewFormula: previewFormulaDraft,
    updateField,
    deleteField,
    createView,
    updateView,
    duplicateView,
    deleteView,
    reorderViews,
    insertRow,
    updateRow,
    updateRows,
    deleteRows,
    deleteRowRanges,
  } = useSpaceBase(currentSpace?.id)
  const [snapshot, setSnapshot] = useState<BaseSnapshot | null>(null)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [activeViewIds, setActiveViewIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [pendingMutations, setPendingMutations] = useState(0)
  const [blockingMutations, setBlockingMutations] = useState(0)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [failedMutationKeys, setFailedMutationKeys] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const mutatingRef = useRef(false)
  const pendingMutationCountRef = useRef(0)
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const knownBaseRevisionRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gridReloadToken, setGridReloadToken] = useState(0)
  const [recordReloadToken, setRecordReloadToken] = useState(0)
  const [search, setSearch] = useState("")
  const [searchResultCount, setSearchResultCount] = useState<number | null>(
    null
  )
  const [searchResultIndex, setSearchResultIndex] = useState(0)
  const [focusSearchToken, setFocusSearchToken] = useState(0)
  const [visibleRowCount, setVisibleRowCount] = useState<number | null>(null)
  const [selectedRowRanges, setSelectedRowRanges] = useState<BaseRowRange[]>([])
  const [deleteRowsDialogOpen, setDeleteRowsDialogOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [fieldPropertyColumn, setFieldPropertyColumn] = useState<string | null>(
    null
  )
  const [formulaTarget, setFormulaTarget] = useState<BaseFieldInfo | null>(null)
  const [lookupTarget, setLookupTarget] = useState<BaseFieldInfo | null>(null)
  const [structureDialog, setStructureDialog] = useState<"field" | null>(null)
  const [fieldInsertIndex, setFieldInsertIndex] = useState<number | null>(null)
  const [extensionGridFallbackViewId, setExtensionGridFallbackViewId] =
    useState<string | null>(null)
  const [creatingFirstTemplate, setCreatingFirstTemplate] =
    useState<BaseTemplateId | null>(null)
  const creatingFirstTemplateRef = useRef(false)
  const [firstTemplateError, setFirstTemplateError] = useState<{
    template: BaseTemplateId
    message: string
  } | null>(null)

  const applySnapshot = useCallback(
    (next: BaseSnapshot) => {
      knownBaseRevisionRef.current = next.metadata.updatedAt
      setSnapshot(next)
      setActiveTableId((current) => {
        if (
          recordTableId &&
          next.tables.some(({ table }) => table.id === recordTableId)
        ) {
          return recordTableId
        }
        if (current && next.tables.some(({ table }) => table.id === current)) {
          return current
        }
        return (
          next.metadata.defaultTableId ?? next.tables.at(0)?.table.id ?? null
        )
      })
    },
    [recordTableId]
  )

  const load = useCallback(
    async (options: { preserveError?: boolean } = {}) => {
      setLoading(true)
      try {
        applySnapshot(await getSnapshot(filePath))
        setGridReloadToken((current) => current + 1)
        setRecordReloadToken((current) => current + 1)
        if (!options.preserveError) setError(null)
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to open Base"
        )
      } finally {
        setLoading(false)
      }
    },
    [applySnapshot, filePath, getSnapshot]
  )

  const refreshFromFileChange = useCallback(async () => {
    try {
      const next = await getSnapshot(filePath)
      if (next.metadata.updatedAt === knownBaseRevisionRef.current) {
        setError(null)
        return
      }
      applySnapshot(next)
      setGridReloadToken((current) => current + 1)
      setRecordReloadToken((current) => current + 1)
      setError(null)
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh Base"
      )
    }
  }, [applySnapshot, filePath, getSnapshot])

  useEffect(() => {
    void load()
  }, [load])

  useSpaceFileChanges(
    currentSpace?.id,
    useCallback(
      (event) => {
        const affectsOpenBase =
          event.path === filePath ||
          (event.eventType === "rescan" &&
            isSameOrDescendant(filePath, event.path))
        if (affectsOpenBase && !mutatingRef.current) {
          void refreshFromFileChange()
        }
      },
      [filePath, refreshFromFileChange]
    )
  )

  const activeTable = useMemo(
    () =>
      snapshot?.tables.find(({ table }) => table.id === activeTableId) ?? null,
    [activeTableId, snapshot?.tables]
  )
  const requestedRecordTable = useMemo(
    () =>
      recordTableId
        ? (snapshot?.tables.find(({ table }) => table.id === recordTableId) ??
          null)
        : null,
    [recordTableId, snapshot?.tables]
  )

  useEffect(() => {
    if (!tabContext?.tabId || !snapshot || recordMode) return
    const tabId = tabContext.tabId
    const baseName = filePath.split("/").at(-1) ?? filePath
    registerQuickOpenSection(tabId, {
      id: "base-tables",
      heading: `Tables in ${baseName}`,
      inputHint: baseName,
      priority: 100,
      items: snapshot.tables.map((candidate) => ({
        id: candidate.table.id,
        kind: "base-table" as const,
        label: candidate.table.name,
        detail: `${candidate.rowCount.toLocaleString()} ${
          candidate.rowCount === 1 ? "row" : "rows"
        }`,
        keywords: [filePath, candidate.table.rawTableName],
        current: candidate.table.id === activeTableId,
        onSelect: () => setActiveTableId(candidate.table.id),
      })),
    })
    return () => unregisterQuickOpenSection(tabId, "base-tables")
  }, [
    activeTableId,
    filePath,
    registerQuickOpenSection,
    snapshot,
    tabContext?.tabId,
    unregisterQuickOpenSection,
    recordMode,
  ])

  useEffect(() => {
    const host = editorRef.current
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        (event.key !== "PageUp" && event.key !== "PageDown") ||
        !snapshot ||
        recordMode ||
        snapshot.tables.length < 2 ||
        !host?.contains(event.target as Node)
      ) {
        return
      }

      event.preventDefault()
      const direction = event.key === "PageDown" ? 1 : -1
      setActiveTableId((current) => {
        const currentIndex = Math.max(
          0,
          snapshot.tables.findIndex(({ table }) => table.id === current)
        )
        const nextIndex =
          (currentIndex + direction + snapshot.tables.length) %
          snapshot.tables.length
        return snapshot.tables[nextIndex].table.id
      })
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [recordMode, snapshot])
  const fieldPropertyTarget = useMemo(
    () =>
      activeTable?.fields.find(
        (field) => field.tableColumnName === fieldPropertyColumn
      ) ?? null,
    [activeTable?.fields, fieldPropertyColumn]
  )
  const activeView = useMemo(() => {
    if (!activeTable) return undefined
    const selectedId = activeViewIds[activeTable.table.id]
    return (
      activeTable.views.find(
        (view) => view.id === selectedId && isSupportedBaseViewType(view.type)
      ) ?? activeTable.views.find((view) => isSupportedBaseViewType(view.type))
    )
  }, [activeTable, activeViewIds])
  const activeExtensionContributionId = activeView
    ? baseExtensionContributionId(activeView.type)
    : null
  const activeExtensionView = useMemo(() => {
    return activeExtensionContributionId
      ? extensionBaseViews.find(
          (candidate) => candidate.id === activeExtensionContributionId
        )
      : undefined
  }, [activeExtensionContributionId, extensionBaseViews])
  const useExtensionGridFallback = Boolean(
    activeExtensionContributionId &&
    (!activeExtensionView || extensionGridFallbackViewId === activeView?.id)
  )
  const renderedGridView = useMemo(
    () =>
      useExtensionGridFallback && activeView
        ? { ...activeView, type: "grid" }
        : activeView,
    [activeView, useExtensionGridFallback]
  )
  useEffect(() => {
    setExtensionGridFallbackViewId(null)
  }, [activeExtensionView?.contentDigest, activeView?.id])
  const activeQuery = useMemo<BaseRowQuery>(
    () => ({
      ...(search ? { search } : {}),
      filter: activeView?.filter ?? null,
      sorts: activeView?.sorts ?? [],
    }),
    [activeView?.filter, activeView?.sorts, search]
  )
  const activeCardProjection = useMemo(
    () =>
      activeTable &&
      activeView &&
      (activeView.type === "gallery" || activeView.type === "kanban")
        ? baseRecordCardPageProjection(activeTable.fields, activeView)
        : undefined,
    [activeTable, activeView]
  )
  const activeQueryAffectedByFieldChanges = useCallback(
    (changedColumns: Iterable<string>) =>
      activeTable
        ? baseRowQueryAffectedByFieldChanges(
            activeTable.fields,
            activeQuery,
            changedColumns
          )
        : false,
    [activeQuery, activeTable]
  )
  const hasActiveQuery = Boolean(
    search || activeView?.filter || activeView?.sorts.length
  )
  const searchActive = search.trim().length > 0
  const searchActiveRef = useRef(searchActive)
  searchActiveRef.current = searchActive
  const activeSearchResultIndex =
    searchActive && searchResultCount !== null && searchResultCount > 0
      ? Math.min(searchResultIndex, searchResultCount - 1)
      : null

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    setSearchResultCount(null)
    setSearchResultIndex(0)
  }, [])

  const handleSearchResultCountChange = useCallback(
    (rowCount: number | null) => {
      setVisibleRowCount(rowCount)
      if (!searchActiveRef.current) return
      setSearchResultCount(rowCount)
      setSearchResultIndex((current) =>
        rowCount && rowCount > 0 ? Math.min(current, rowCount - 1) : 0
      )
    },
    []
  )

  const navigateSearchResults = useCallback(
    (direction: "next" | "previous") => {
      setSearchResultIndex((current) => {
        if (!searchResultCount || searchResultCount < 1) return 0
        return direction === "next"
          ? (current + 1) % searchResultCount
          : (current - 1 + searchResultCount) % searchResultCount
      })
    },
    [searchResultCount]
  )

  useEffect(() => {
    setSearch("")
    setSearchResultCount(null)
    setSearchResultIndex(0)
    setVisibleRowCount(null)
    setSelectedRowRanges([])
    setFieldPropertyColumn(null)
  }, [activeTableId, activeView?.id, filePath])

  useEffect(() => {
    if (!activeTable || !activeView) return
    if (activeViewIds[activeTable.table.id] === activeView.id) return
    setActiveViewIds((current) => ({
      ...current,
      [activeTable.table.id]: activeView.id,
    }))
  }, [activeTable, activeView, activeViewIds])

  useEffect(() => {
    const handleFind = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "f" &&
        editorRef.current?.contains(document.activeElement)
      ) {
        event.preventDefault()
        setFocusSearchToken((current) => current + 1)
      }
    }
    document.addEventListener("keydown", handleFind)
    return () => document.removeEventListener("keydown", handleFind)
  }, [])
  const selectedRowCount = useMemo(
    () =>
      selectedRowRanges.reduce(
        (count, range) => count + range.endIndex - range.startIndex,
        0
      ),
    [selectedRowRanges]
  )
  const setMutationKeyFailed = useCallback(
    (statusKey: string, failed: boolean) => {
      setFailedMutationKeys((current) => {
        if (current.has(statusKey) === failed) return current
        const next = new Set(current)
        failed ? next.add(statusKey) : next.delete(statusKey)
        return next
      })
    },
    []
  )
  const enqueueMutation = useCallback(
    <T,>(
      operation: () => Promise<T>,
      onSuccess: ((result: T) => void) | undefined,
      options: BaseMutationOptions
    ): Promise<T> => {
      const blocking = options.blocking !== false
      const errorMode = options.errorMode ?? "global"
      const { statusKey } = options
      pendingMutationCountRef.current += 1
      mutatingRef.current = true
      setPendingMutations((current) => current + 1)
      if (blocking) setBlockingMutations((current) => current + 1)

      const run = mutationQueueRef.current
        .catch(() => undefined)
        .then(operation)
      const handled = run
        .then(
          (result) => {
            const revision = baseMutationRevision(result)
            if (revision) knownBaseRevisionRef.current = revision
            onSuccess?.(result)
            setError(null)
            setMutationKeyFailed(statusKey, false)
            setLastSavedAt(Date.now())
            return result
          },
          async (mutationError) => {
            setMutationKeyFailed(statusKey, true)
            if (errorMode === "global") {
              setError(baseErrorMessage(mutationError, "Unable to update Base"))
            }
            await load({ preserveError: errorMode === "global" })
            throw mutationError
          }
        )
        .finally(() => {
          pendingMutationCountRef.current -= 1
          mutatingRef.current = pendingMutationCountRef.current > 0
          setPendingMutations((current) => Math.max(0, current - 1))
          if (blocking) {
            setBlockingMutations((current) => Math.max(0, current - 1))
          }
        })
      mutationQueueRef.current = handled.then(
        () => undefined,
        () => undefined
      )
      return handled
    },
    [load, setMutationKeyFailed]
  )

  const updateTableRowCount = useCallback(
    (tableId: string, rowCount: number) => {
      setSnapshot((current) => {
        if (!current) return current
        const target = current.tables.find(
          (candidate) => candidate.table.id === tableId
        )
        if (!target || target.rowCount === rowCount) return current
        return {
          ...current,
          tables: current.tables.map((candidate) =>
            candidate === target ? { ...candidate, rowCount } : candidate
          ),
        }
      })
    },
    []
  )

  const ensureAttachmentDirectory = useCallback(async () => {
    try {
      await listFiles(attachmentDirectory)
    } catch {
      try {
        await createDirectory(attachmentDirectory)
      } catch {
        await listFiles(attachmentDirectory)
      }
    }
  }, [attachmentDirectory, createDirectory, listFiles])

  const importBaseFiles = useCallback(async (): Promise<string[]> => {
    await ensureAttachmentDirectory()
    const result = await importFiles(attachmentDirectory)
    if (result.errors.length > 0) {
      console.warn("Some Base attachments could not be imported", result.errors)
    }
    return result.imported.map((entry) => entry.path)
  }, [attachmentDirectory, ensureAttachmentDirectory, importFiles])

  const importDroppedBaseFiles = useCallback(
    async (files: File[]): Promise<string[]> => {
      if (files.length === 0) return []
      await ensureAttachmentDirectory()
      const existingNames = (await listFiles(attachmentDirectory)).map(
        (entry) => entry.name
      )
      const imported: string[] = []
      for (const file of files) {
        const name = uniqueSpaceEntryName(
          existingNames,
          file.name || `attachment-${Date.now()}`
        )
        existingNames.push(name)
        const path = `${attachmentDirectory}/${name}`
        await createBinary(path, new Uint8Array(await file.arrayBuffer()))
        imported.push(path)
      }
      return imported
    },
    [attachmentDirectory, createBinary, ensureAttachmentDirectory, listFiles]
  )

  const openBaseFileReference = useCallback((path: string) => {
    if (/^https?:/i.test(path)) {
      window.open(path, "_blank")
      return
    }
    useTabStore
      .getState()
      .openTab(toSpaceFileUrl(path), path.split("/").at(-1) ?? path)
  }, [])

  const revealBaseFileReference = useCallback(
    (path: string) => reveal(path).then(() => undefined),
    [reveal]
  )

  const loadRequestedRecord = useCallback(
    (rowId: string) => {
      if (!recordTableId) return Promise.resolve(null)
      return getTableRow(filePath, recordTableId, rowId)
    },
    [filePath, getTableRow, recordTableId]
  )
  const {
    inspectedRow: requestedRecordRow,
    inspectorLoading: requestedRecordLoading,
    inspectorLoadError: requestedRecordLoadError,
    openInspectorRow: openRequestedRecord,
    replaceInspectorRow: replaceRequestedRecord,
    retryInspectorRow: retryRequestedRecord,
  } = useBaseRecordInspectorRow(loadRequestedRecord)
  const snapshotReady = snapshot !== null
  const requestedRecordTableAvailable = requestedRecordTable !== null

  useEffect(() => {
    if (!recordId || !snapshotReady || !requestedRecordTableAvailable) {
      return
    }
    openRequestedRecord({
      _id: recordId,
      title: "Loading…",
    })
  }, [
    openRequestedRecord,
    recordReloadToken,
    recordId,
    requestedRecordTableAvailable,
    snapshotReady,
  ])

  useEffect(() => {
    if (
      !recordMode ||
      !tabContext?.tabId ||
      requestedRecordLoading ||
      requestedRecordLoadError ||
      !requestedRecordRow
    ) {
      return
    }
    useTabStore.getState().updateTab(tabContext.tabId, {
      title: baseRecordTitle(requestedRecordRow),
    })
  }, [
    recordMode,
    requestedRecordLoadError,
    requestedRecordLoading,
    requestedRecordRow,
    tabContext?.tabId,
  ])

  const openRecordInTab = useCallback(
    (row: BaseRow) => {
      if (!activeTable || row._id === null || row._id === undefined) return
      const rowId = String(row._id)
      useTabStore
        .getState()
        .openTab(
          toSpaceBaseRecordUrl(filePath, activeTable.table.id, rowId),
          baseRecordTitle(row)
        )
    },
    [activeTable, filePath]
  )

  const openBaseFromRecord = useCallback(() => {
    const baseName = filePath.split("/").at(-1) ?? filePath
    useTabStore.getState().openTab(toSpaceFileUrl(filePath), baseName)
  }, [filePath])

  const copyRequestedRecordId = useCallback((recordId: string) => {
    void navigator.clipboard?.writeText(recordId).catch(() => undefined)
  }, [])

  const loadActiveTablePage = useCallback(
    (offset: number, limit: number, totalHint?: number, cursor?: string) => {
      if (!activeTableId) {
        return Promise.reject(new Error("No active Base table"))
      }
      return getTablePage(
        filePath,
        activeTableId,
        offset,
        limit,
        activeQuery,
        totalHint,
        cursor
      )
    },
    [activeQuery, activeTableId, filePath, getTablePage]
  )

  const loadActiveCardPage = useCallback(
    (offset: number, limit: number, totalHint?: number, cursor?: string) => {
      if (!activeTableId) {
        return Promise.reject(new Error("No active Base table"))
      }
      return getTablePage(
        filePath,
        activeTableId,
        offset,
        limit,
        activeQuery,
        totalHint,
        cursor,
        activeCardProjection
      )
    },
    [activeCardProjection, activeQuery, activeTableId, filePath, getTablePage]
  )

  const loadActiveTableRow = useCallback(
    (rowId: string) => {
      if (!activeTableId) {
        return Promise.reject(new Error("No active Base table"))
      }
      return getTableRow(filePath, activeTableId, rowId)
    },
    [activeTableId, filePath, getTableRow]
  )

  const loadActiveColumnStats = useCallback(
    (configs: BaseColumnStatConfig[]) => {
      if (!activeTableId) {
        return Promise.reject(new Error("No active Base table"))
      }
      return getTableColumnStats(filePath, activeTableId, configs, activeQuery)
    },
    [activeQuery, activeTableId, filePath, getTableColumnStats]
  )

  const loadKanbanGroupPage = useCallback(
    (
      field: BaseFieldInfo,
      value: string | null,
      offset: number,
      limit: number,
      totalHint: number,
      cursor?: string
    ) => {
      if (!activeTableId) {
        return Promise.reject(new Error("No active Base table"))
      }
      return getTablePage(
        filePath,
        activeTableId,
        offset,
        limit,
        {
          ...activeQuery,
          filter: combineBaseFilters(
            activeQuery.filter,
            field.tableColumnName,
            value
          ),
        },
        totalHint,
        cursor,
        activeCardProjection
      )
    },
    [activeCardProjection, activeQuery, activeTableId, filePath, getTablePage]
  )

  const loadKanbanGroupCounts = useCallback(
    (field: BaseFieldInfo) => {
      if (!activeTableId) {
        return Promise.reject(new Error("No active Base table"))
      }
      return getTableGroupCounts(
        filePath,
        activeTableId,
        field.tableColumnName,
        activeQuery
      )
    },
    [activeQuery, activeTableId, filePath, getTableGroupCounts]
  )

  const searchRelationRecords = useCallback(
    async (
      field: BaseFieldInfo,
      query: string
    ): Promise<BaseRelationValue[]> => {
      const targetTableId =
        field.property?.targetTableId ??
        snapshot?.tables.find(
          (candidate) =>
            candidate.table.rawTableName === field.property?.linkTableName
        )?.table.id
      const targetField =
        field.property?.targetField ?? field.property?.linkColumnName
      if (
        typeof targetTableId !== "string" ||
        typeof targetField !== "string"
      ) {
        throw new Error(`Relation field “${field.name}” has no target table`)
      }
      const page = await getTablePage(filePath, targetTableId, 0, 50, {
        ...(query.trim() ? { search: query.trim() } : {}),
      })
      return page.rows.flatMap((row) => {
        if (typeof row._id !== "string") return []
        const title = row[targetField]
        return [
          {
            id: row._id,
            title:
              title === null || title === undefined || title === ""
                ? "Untitled"
                : String(title),
          },
        ]
      })
    },
    [filePath, getTablePage, snapshot?.tables]
  )

  const createRow = useCallback((): Promise<BaseRowMutationResult> => {
    if (!activeTable) return Promise.reject(new Error("No active Base table"))
    const tableId = activeTable.table.id
    return enqueueMutation(
      () => insertRow(filePath, tableId, { title: "Untitled" }),
      (result) => {
        updateTableRowCount(tableId, result.rowCount)
        if (hasActiveQuery || activeView?.type !== "grid") {
          setGridReloadToken((current) => current + 1)
        }
      },
      {
        blocking: false,
        statusKey: baseMutationStatusKey("insert-row", tableId, "grid"),
      }
    )
  }, [
    activeTable,
    activeView?.type,
    enqueueMutation,
    filePath,
    hasActiveQuery,
    insertRow,
    updateTableRowCount,
  ])

  const createRowInGroup = useCallback(
    (
      field: BaseFieldInfo,
      value: string | null,
      title: string
    ): Promise<BaseRowMutationResult> => {
      if (!activeTable) {
        return Promise.reject(new Error("No active Base table"))
      }
      const tableId = activeTable.table.id
      return enqueueMutation(
        () =>
          insertRow(filePath, tableId, {
            title,
            [field.tableColumnName]: value,
          }),
        (result) => {
          updateTableRowCount(tableId, result.rowCount)
          if (hasActiveQuery) {
            setGridReloadToken((current) => current + 1)
          }
        },
        {
          blocking: false,
          errorMode: "local",
          statusKey: baseMutationStatusKey(
            "insert-row",
            tableId,
            field.tableColumnName,
            value,
            title
          ),
        }
      )
    },
    [
      activeTable,
      enqueueMutation,
      filePath,
      hasActiveQuery,
      insertRow,
      updateTableRowCount,
    ]
  )

  const saveCellWithErrorMode = useCallback(
    (
      row: BaseRow,
      field: BaseFieldInfo,
      value: BaseSqlPrimitive,
      errorMode: "global" | "local"
    ): Promise<BaseRowMutationResult> => {
      if (
        !activeTable ||
        !row._id ||
        Object.is(row[field.tableColumnName], value)
      ) {
        return Promise.resolve({
          tableId: activeTable?.table.id ?? "",
          row,
          rowCount: activeTable?.rowCount ?? 0,
        })
      }
      const rowId = String(row._id)
      const tableId = activeTable.table.id
      return enqueueMutation(
        () =>
          updateRow(filePath, tableId, rowId, {
            [field.tableColumnName]: value,
          }),
        (result) => {
          updateTableRowCount(tableId, result.rowCount)
          if (activeQueryAffectedByFieldChanges([field.tableColumnName])) {
            setGridReloadToken((current) => current + 1)
          }
        },
        {
          blocking: false,
          errorMode,
          statusKey: baseMutationStatusKey(
            "row",
            tableId,
            rowId,
            field.tableColumnName
          ),
        }
      )
    },
    [
      activeTable,
      activeQueryAffectedByFieldChanges,
      enqueueMutation,
      filePath,
      updateRow,
      updateTableRowCount,
    ]
  )

  const saveGridCell = useCallback(
    (row: BaseRow, field: BaseFieldInfo, value: BaseSqlPrimitive) =>
      saveCellWithErrorMode(row, field, value, "local"),
    [saveCellWithErrorMode]
  )

  const saveInspectorCell = useCallback(
    (row: BaseRow, field: BaseFieldInfo, value: BaseSqlPrimitive) =>
      saveCellWithErrorMode(row, field, value, "local"),
    [saveCellWithErrorMode]
  )

  const saveRequestedRecordCell = useCallback(
    async (row: BaseRow, field: BaseFieldInfo, value: BaseSqlPrimitive) => {
      const result = await saveInspectorCell(row, field, value)
      replaceRequestedRecord(result.row)
      return result
    },
    [replaceRequestedRecord, saveInspectorCell]
  )

  const saveRows = useCallback(
    (
      edits: Array<{ row: BaseRow; changes: BaseRow }>
    ): Promise<BaseRowsMutationResult> => {
      if (!activeTable || edits.length === 0) {
        return Promise.reject(new Error("No Base rows to update"))
      }
      const tableId = activeTable.table.id
      const changedColumns = new Set(
        edits.flatMap(({ changes }) => Object.keys(changes))
      )
      return enqueueMutation(
        () =>
          updateRows(
            filePath,
            tableId,
            edits.map(({ row, changes }) => ({
              rowId: String(row._id),
              changes,
            }))
          ),
        (result) => {
          updateTableRowCount(tableId, result.rowCount)
          if (activeQueryAffectedByFieldChanges(changedColumns)) {
            setGridReloadToken((current) => current + 1)
          }
        },
        {
          blocking: false,
          errorMode: "local",
          statusKey: baseMutationStatusKey(
            "row-batch",
            tableId,
            [...changedColumns].sort().join(","),
            edits
              .map(({ row }) => String(row._id))
              .sort()
              .join(",")
          ),
        }
      )
    },
    [
      activeTable,
      activeQueryAffectedByFieldChanges,
      enqueueMutation,
      filePath,
      updateRows,
      updateTableRowCount,
    ]
  )

  const deleteSelectedRows = useCallback((): Promise<BaseRowsDeleteResult> => {
    if (!activeTable || selectedRowRanges.length === 0) {
      return Promise.reject(new Error("No Base rows selected"))
    }
    const tableId = activeTable.table.id
    const ranges = selectedRowRanges.map((range) => ({ ...range }))
    return enqueueMutation(
      () => deleteRowRanges(filePath, tableId, ranges, activeQuery),
      (result) => {
        updateTableRowCount(tableId, result.rowCount)
        setSelectedRowRanges([])
        setGridReloadToken((current) => current + 1)
      },
      {
        statusKey: baseMutationStatusKey(
          "delete-row-ranges",
          tableId,
          JSON.stringify(ranges)
        ),
      }
    )
  }, [
    activeTable,
    activeQuery,
    deleteRowRanges,
    enqueueMutation,
    filePath,
    selectedRowRanges,
    updateTableRowCount,
  ])

  const deleteSingleRow = useCallback(
    (row: BaseRow): Promise<void> => {
      if (!activeTable || row._id === undefined || row._id === null) {
        return Promise.reject(new Error("No Base row selected"))
      }
      const tableId = activeTable.table.id
      return enqueueMutation(
        () => deleteRows(filePath, tableId, [String(row._id)]),
        (result) => {
          updateTableRowCount(tableId, result.rowCount)
          if (activeView?.type === "grid") {
            setGridReloadToken((current) => current + 1)
          }
        },
        {
          statusKey: baseMutationStatusKey(
            "delete-row",
            tableId,
            String(row._id)
          ),
        }
      ).then(() => undefined)
    },
    [
      activeTable,
      activeView?.type,
      deleteRows,
      enqueueMutation,
      filePath,
      updateTableRowCount,
    ]
  )

  const createTableInBase = useCallback(
    (table: Parameters<typeof createTable>[1]): Promise<void> => {
      const existingIds = new Set(
        snapshot?.tables.map((candidate) => candidate.table.id) ?? []
      )
      return enqueueMutation(
        () => createTable(filePath, table),
        (next) => {
          applySnapshot(next)
          const created = next.tables.find(
            (candidate) => !existingIds.has(candidate.table.id)
          )
          if (created) setActiveTableId(created.table.id)
        },
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey("create-table", table.name),
        }
      ).then(() => undefined)
    },
    [applySnapshot, createTable, enqueueMutation, filePath, snapshot?.tables]
  )

  const createFirstTable = useCallback(
    async (template: BaseTemplateId) => {
      if (
        creatingFirstTemplateRef.current ||
        pendingMutationCountRef.current > 0
      ) {
        return
      }
      creatingFirstTemplateRef.current = true
      setCreatingFirstTemplate(template)
      setFirstTemplateError(null)
      try {
        await createTableInBase(baseDefaultTableForTemplate(template))
      } catch (templateError) {
        setFirstTemplateError({
          template,
          message:
            templateError instanceof Error
              ? templateError.message
              : template === "tasks"
                ? "Unable to create the task tracker"
                : "Unable to create the blank table",
        })
      } finally {
        creatingFirstTemplateRef.current = false
        setCreatingFirstTemplate(null)
      }
    },
    [createTableInBase]
  )

  const importCsvIntoBase = useCallback(
    (
      token: string,
      options: Parameters<typeof importCsv>[2],
      operationId: string
    ): Promise<void> =>
      enqueueMutation(
        () => importCsv(filePath, token, options, operationId),
        ({ snapshot: next, result }) => {
          applySnapshot(next)
          setActiveTableId(result.table.id)
          setGridReloadToken((current) => current + 1)
        },
        {
          statusKey: baseMutationStatusKey("import-csv", filePath),
        }
      ).then(() => undefined),
    [applySnapshot, enqueueMutation, filePath, importCsv]
  )

  const exportActiveView = useCallback(
    (operationId: string) => {
      if (!activeTable || !activeView) {
        return Promise.reject(new Error("No active Base view"))
      }
      const baseName = filePath
        .split("/")
        .at(-1)
        ?.replace(/\.base$/i, "")
      const columns = orderedBaseFields(activeTable.fields, activeView).map(
        (field) => ({
          columnName: field.tableColumnName,
          name: baseFieldDisplayName(field),
        })
      )
      const suggestedFileName = [
        csvFileNameSegment(baseName || "base"),
        csvFileNameSegment(activeTable.table.name),
        csvFileNameSegment(activeView.name),
      ].join(" - ")
      return exportCsv(
        filePath,
        activeTable.table.id,
        { query: activeQuery, columns },
        `${suggestedFileName}.csv`,
        operationId
      )
    },
    [activeQuery, activeTable, activeView, exportCsv, filePath]
  )

  const createFieldInBase = useCallback(
    (field: Parameters<typeof addField>[2]): Promise<void> => {
      if (!activeTable) return Promise.resolve()
      const placement =
        activeView && fieldInsertIndex !== null
          ? { viewId: activeView.id, index: fieldInsertIndex }
          : undefined
      return enqueueMutation(
        () =>
          placement
            ? addField(filePath, activeTable.table.id, field, placement)
            : addField(filePath, activeTable.table.id, field),
        applySnapshot,
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey(
            "create-field",
            activeTable.table.id,
            field.columnName
          ),
        }
      ).then(() => {
        setFieldInsertIndex(null)
      })
    },
    [
      activeTable,
      activeView,
      addField,
      applySnapshot,
      enqueueMutation,
      fieldInsertIndex,
      filePath,
    ]
  )

  const openFieldCreator = useCallback((position?: number) => {
    setFieldInsertIndex(position ?? null)
    setStructureDialog("field")
  }, [])

  const renameStructure = useCallback(
    (name: string): Promise<void> => {
      if (!renameTarget) return Promise.resolve()
      return enqueueMutation(
        () => updateTable(filePath, renameTarget.tableId, { name }),
        applySnapshot,
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey(
            "rename-table",
            renameTarget.tableId
          ),
        }
      ).then(() => undefined)
    },
    [applySnapshot, enqueueMutation, filePath, renameTarget, updateTable]
  )

  const deleteStructure = useCallback((): Promise<void> => {
    if (!deleteTarget) return Promise.resolve()
    const operation = () =>
      deleteTarget.kind === "table"
        ? deleteTable(filePath, deleteTarget.tableId)
        : deleteField(filePath, deleteTarget.tableId, deleteTarget.columnName)
    return enqueueMutation(operation, applySnapshot, {
      statusKey: baseMutationStatusKey(
        deleteTarget.kind === "table" ? "delete-table" : "delete-field",
        deleteTarget.tableId,
        deleteTarget.kind === "field" ? deleteTarget.columnName : undefined
      ),
    }).then(() => {
      if (deleteTarget.kind === "field") {
        setFieldPropertyColumn((current) =>
          current === deleteTarget.columnName ? null : current
        )
      }
      setDeleteTarget(null)
    })
  }, [
    applySnapshot,
    deleteField,
    deleteTable,
    deleteTarget,
    enqueueMutation,
    filePath,
  ])

  const updateFieldInBase = useCallback(
    (field: BaseFieldInfo, changes: UpdateBaseFieldInput): Promise<void> => {
      if (!activeTable) {
        return Promise.reject(new Error("No active Base table"))
      }
      return enqueueMutation(
        () =>
          updateField(
            filePath,
            activeTable.table.id,
            field.tableColumnName,
            changes
          ),
        (next) => {
          applySnapshot(next)
          if (changes.type !== undefined || changes.property !== undefined) {
            setGridReloadToken((current) => current + 1)
          }
        },
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey(
            "field",
            activeTable.table.id,
            field.tableColumnName
          ),
        }
      ).then(() => undefined)
    },
    [activeTable, applySnapshot, enqueueMutation, filePath, updateField]
  )

  const saveFormula = useCallback(
    (property: Record<string, unknown>): Promise<void> => {
      if (!activeTable || !formulaTarget) return Promise.resolve()
      return enqueueMutation(
        () =>
          updateField(
            filePath,
            activeTable.table.id,
            formulaTarget.tableColumnName,
            { property }
          ),
        (next) => {
          applySnapshot(next)
          setGridReloadToken((current) => current + 1)
        },
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey(
            "field",
            activeTable.table.id,
            formulaTarget.tableColumnName
          ),
        }
      ).then(() => undefined)
    },
    [
      activeTable,
      applySnapshot,
      enqueueMutation,
      filePath,
      formulaTarget,
      updateField,
    ]
  )

  const previewActiveFormula = useCallback(
    (input: BaseFormulaPreviewInput) => {
      if (!activeTable) {
        return Promise.reject(new Error("No active Base table"))
      }
      return previewFormulaDraft(filePath, activeTable.table.id, input)
    },
    [activeTable, filePath, previewFormulaDraft]
  )

  const saveLookup = useCallback(
    (property: Record<string, unknown>): Promise<void> => {
      if (!activeTable || !lookupTarget) return Promise.resolve()
      return enqueueMutation(
        () =>
          updateField(
            filePath,
            activeTable.table.id,
            lookupTarget.tableColumnName,
            { property }
          ),
        (next) => {
          applySnapshot(next)
          setGridReloadToken((current) => current + 1)
        },
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey(
            "field",
            activeTable.table.id,
            lookupTarget.tableColumnName
          ),
        }
      ).then(() => undefined)
    },
    [
      activeTable,
      applySnapshot,
      enqueueMutation,
      filePath,
      lookupTarget,
      updateField,
    ]
  )

  const selectActiveView = useCallback(
    (viewId: string) => {
      if (!activeTable) return
      setActiveViewIds((current) => ({
        ...current,
        [activeTable.table.id]: viewId,
      }))
    },
    [activeTable]
  )

  const createViewInBase = useCallback(
    (name: string, type: string): Promise<void> => {
      if (!activeTable) return Promise.resolve()
      const tableId = activeTable.table.id
      const existingIds = new Set(activeTable.views.map((view) => view.id))
      const firstSelectField = activeTable.fields.find(
        (field) => field.type === "select"
      )
      const properties =
        type === "kanban"
          ? {
              cardSize: "medium",
              hideEmptyFields: true,
              ...(firstSelectField
                ? { groupByField: firstSelectField.tableColumnName }
                : {}),
            }
          : type === "gallery"
            ? { cardSize: "medium", hideEmptyFields: true }
            : undefined
      const input = properties ? { name, type, properties } : { name, type }
      return enqueueMutation(
        () => createView(filePath, tableId, input),
        (next) => {
          applySnapshot(next)
          const created = next.tables
            .find((candidate) => candidate.table.id === tableId)
            ?.views.find((view) => !existingIds.has(view.id))
          if (created) {
            setActiveViewIds((current) => ({
              ...current,
              [tableId]: created.id,
            }))
          }
        },
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey("create-view", tableId, type, name),
        }
      ).then(() => undefined)
    },
    [activeTable, applySnapshot, createView, enqueueMutation, filePath]
  )

  const renameViewInBase = useCallback(
    (viewId: string, name: string): Promise<void> =>
      enqueueMutation(
        () => updateView(filePath, viewId, { name }),
        applySnapshot,
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey("view", viewId),
        }
      ).then(() => undefined),
    [applySnapshot, enqueueMutation, filePath, updateView]
  )

  const updateViewInBase = useCallback(
    (
      viewId: string,
      changes: Parameters<typeof updateView>[2]
    ): Promise<void> =>
      enqueueMutation(
        () => updateView(filePath, viewId, changes),
        applySnapshot,
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey("view", viewId),
        }
      ).then(() => undefined),
    [applySnapshot, enqueueMutation, filePath, updateView]
  )

  const duplicateViewInBase = useCallback(
    (viewId: string): Promise<void> => {
      if (!activeTable) return Promise.resolve()
      const tableId = activeTable.table.id
      const existingIds = new Set(activeTable.views.map((view) => view.id))
      return enqueueMutation(
        () => duplicateView(filePath, viewId),
        (next) => {
          applySnapshot(next)
          const created = next.tables
            .find((candidate) => candidate.table.id === tableId)
            ?.views.find((view) => !existingIds.has(view.id))
          if (created) {
            setActiveViewIds((current) => ({
              ...current,
              [tableId]: created.id,
            }))
          }
        },
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey("duplicate-view", viewId),
        }
      ).then(() => undefined)
    },
    [activeTable, applySnapshot, duplicateView, enqueueMutation, filePath]
  )

  const deleteViewInBase = useCallback(
    (viewId: string): Promise<void> => {
      if (!activeTable) return Promise.resolve()
      const tableId = activeTable.table.id
      const index = activeTable.views.findIndex((view) => view.id === viewId)
      const remaining = activeTable.views.filter((view) => view.id !== viewId)
      const fallback =
        remaining[Math.min(Math.max(index, 0), remaining.length - 1)]
      return enqueueMutation(
        () => deleteView(filePath, viewId),
        (next) => {
          applySnapshot(next)
          setActiveViewIds((current) => {
            if (current[tableId] !== viewId) return current
            const updated = { ...current }
            if (fallback) updated[tableId] = fallback.id
            else delete updated[tableId]
            return updated
          })
        },
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey("delete-view", viewId),
        }
      ).then(() => undefined)
    },
    [activeTable, applySnapshot, deleteView, enqueueMutation, filePath]
  )

  const reorderViewsInBase = useCallback(
    (viewIds: string[]): Promise<void> => {
      if (!activeTable) return Promise.resolve()
      return enqueueMutation(
        () => reorderViews(filePath, activeTable.table.id, viewIds),
        applySnapshot,
        {
          errorMode: "local",
          statusKey: baseMutationStatusKey(
            "reorder-views",
            activeTable.table.id
          ),
        }
      ).then(() => undefined)
    },
    [activeTable, applySnapshot, enqueueMutation, filePath, reorderViews]
  )

  const updateActiveView = useCallback(
    (
      changes: Parameters<typeof updateView>[2],
      errorMode: "global" | "local" = "global"
    ): Promise<void> => {
      if (!activeView) return Promise.resolve()
      return enqueueMutation(
        () => updateView(filePath, activeView.id, changes),
        applySnapshot,
        {
          errorMode,
          statusKey: baseMutationStatusKey("view", activeView.id),
        }
      ).then(() => undefined)
    },
    [activeView, applySnapshot, enqueueMutation, filePath, updateView]
  )

  const handleGridError = useCallback((gridError: unknown) => {
    setError(baseErrorMessage(gridError, "Unable to update Base"))
  }, [])

  const openFieldProperty = useCallback((field: BaseFieldInfo) => {
    setFieldPropertyColumn(field.tableColumnName)
  }, [])

  const closeFieldProperty = useCallback(() => {
    setFieldPropertyColumn(null)
  }, [])

  const activeTableIdForActions = activeTable?.table.id
  const requestFieldDelete = useCallback(
    (field: BaseFieldInfo) => {
      if (!activeTableIdForActions) return
      setDeleteTarget({
        kind: "field",
        tableId: activeTableIdForActions,
        columnName: field.tableColumnName,
        name: field.name,
      })
    },
    [activeTableIdForActions]
  )

  const requestRowRangeDelete = useCallback((ranges: BaseRowRange[]) => {
    setSelectedRowRanges(ranges)
    setDeleteRowsDialogOpen(true)
  }, [])

  const fieldPropertySidePanel =
    fieldPropertyTarget && activeTable ? (
      <BaseFieldPropertyPanel
        field={fieldPropertyTarget}
        disabled={blockingMutations > 0}
        onClose={closeFieldProperty}
        onUpdate={updateFieldInBase}
        onDelete={requestFieldDelete}
        onEditFormula={setFormulaTarget}
        onEditLookup={setLookupTarget}
      />
    ) : undefined

  if (loading && !snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
        Opening Base…
      </div>
    )
  }

  if (!snapshot) {
    const presentation = baseOpenErrorPresentation(error)
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <AlertTriangle className="mb-3 h-5 w-5 text-destructive" />
        <h2 className="text-sm font-medium text-foreground">
          {presentation.title}
        </h2>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          {presentation.description}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reveal(filePath)}
          >
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            Show in file manager
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (recordMode && recordId) {
    const baseName = filePath.split("/").at(-1) ?? filePath
    if (!requestedRecordTable) {
      return (
        <BaseRecordUnavailable
          baseName={baseName}
          message="This table no longer exists in the Base file. Return to the Base to choose another record."
          onBack={openBaseFromRecord}
        />
      )
    }
    const rowMatchesTarget =
      requestedRecordRow !== null &&
      String(requestedRecordRow._id ?? "") === recordId
    const row = rowMatchesTarget
      ? requestedRecordRow
      : { _id: recordId, title: "Loading…" }

    return (
      <BaseRecordPage
        baseName={baseName}
        tableName={requestedRecordTable.table.name}
        row={row}
        fields={orderedBaseFields(requestedRecordTable.fields)}
        disabled={blockingMutations > 0}
        loading={!rowMatchesTarget || requestedRecordLoading}
        loadError={requestedRecordLoadError}
        error={error}
        onBack={openBaseFromRecord}
        onDismissError={() => setError(null)}
        onRetryLoad={retryRequestedRecord}
        onCopyRecordId={copyRequestedRecordId}
        onCellEdit={saveRequestedRecordCell}
        onError={handleGridError}
        onImportFiles={importBaseFiles}
        onImportDroppedFiles={importDroppedBaseFiles}
        onSearchRelation={searchRelationRecords}
        onOpenFile={openBaseFileReference}
        onRevealFile={(path) => {
          void revealBaseFileReference(path).catch(handleGridError)
        }}
      />
    )
  }

  return (
    <BaseEditorRoot ref={editorRef}>
      <BaseEditorWorkbar>
        {activeTable ? (
          <BaseViewTabs
            views={activeTable.views}
            extensionViews={extensionBaseViews}
            fields={activeTable.fields}
            activeView={activeView}
            disabled={blockingMutations > 0}
            onSelect={selectActiveView}
            onCreate={createViewInBase}
            onRename={renameViewInBase}
            onDuplicate={duplicateViewInBase}
            onDelete={deleteViewInBase}
            onReorder={reorderViewsInBase}
            onUpdate={updateViewInBase}
            viewAction={
              activeView ? (
                <BaseCsvExportPopover
                  triggerVariant="view-action"
                  disabled={loading || pendingMutations > 0}
                  viewName={`${activeTable.table.name} · ${activeView.name}`}
                  onExport={exportActiveView}
                  onProgress={getCsvOperation}
                  onCancel={cancelCsvOperation}
                />
              ) : undefined
            }
          />
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        <div className="base-workbar-actions flex h-9 min-w-0 shrink-0 items-center gap-1 pl-2">
          {selectedRowCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="base-workbar-action h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
              aria-label={`Delete ${selectedRowCount} selected rows`}
              title={`Delete ${selectedRowCount} selected rows`}
              onClick={() => setDeleteRowsDialogOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="base-workbar-action-label">
                Delete {selectedRowCount}
              </span>
            </Button>
          ) : null}
          {activeTable ? (
            <>
              <BaseQueryToolbar
                fields={activeTable.fields}
                filter={activeView?.filter ?? null}
                sorts={activeView?.sorts ?? []}
                search={search}
                disabled={blockingMutations > 0}
                focusSearchToken={focusSearchToken}
                searchResultCount={searchResultCount}
                searchResultIndex={activeSearchResultIndex}
                onSearchChange={handleSearchChange}
                onNavigateSearch={navigateSearchResults}
                onFilterChange={(filter) =>
                  updateActiveView({ filter }, "local")
                }
                onSortsChange={(sorts) => updateActiveView({ sorts }, "local")}
              />
              <BaseViewMenu
                fields={activeTable.fields.filter(
                  (field) =>
                    isOptionalBaseSystemField(field) ||
                    (!field.isHidden &&
                      (field.valueKind === "source" ||
                        field.valueKind === "relation" ||
                        field.valueKind === "derived"))
                )}
                hiddenFields={activeView?.hiddenFields ?? []}
                visibleSystemFields={baseViewVisibleSystemFields(activeView)}
                disabled={blockingMutations > 0}
                onVisibilityChange={({ hiddenFields, visibleSystemFields }) =>
                  void updateActiveView({
                    hiddenFields,
                    properties: {
                      ...(activeView?.properties ?? {}),
                      visibleSystemFields,
                    },
                  })
                }
              />
              <BaseStructureMenu
                table={activeTable.table}
                fields={activeTable.fields}
                disabled={blockingMutations > 0}
                onNewField={() => openFieldCreator()}
                onRevealBase={() =>
                  void reveal(filePath).catch((revealError) =>
                    setError(
                      revealError instanceof Error
                        ? revealError.message
                        : "Unable to show Base in file manager"
                    )
                  )
                }
                onRenameTable={() =>
                  setRenameTarget({
                    kind: "table",
                    tableId: activeTable.table.id,
                    name: activeTable.table.name,
                  })
                }
                onDeleteTable={() =>
                  setDeleteTarget({
                    kind: "table",
                    tableId: activeTable.table.id,
                    name: activeTable.table.name,
                  })
                }
                onEditField={openFieldProperty}
                onDeleteField={requestFieldDelete}
              />
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="base-workbar-action h-7 gap-1 px-2 text-xs"
            aria-label="Create Base row"
            title="New row"
            disabled={!activeTable}
            onClick={() => void createRow().catch(() => undefined)}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="base-workbar-action-label">New row</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Refresh Base"
            title="Refresh Base"
            disabled={loading || pendingMutations > 0}
            onClick={() => void load()}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 motion-reduce:animate-none",
                loading && "animate-spin"
              )}
            />
          </Button>
        </div>
      </BaseEditorWorkbar>

      {error ? (
        <div
          className="flex shrink-0 items-start gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive"
          role="alert"
        >
          <span className="min-w-0 flex-1 break-words py-0.5">{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-destructive hover:text-destructive"
            aria-label="Dismiss Base error"
            title="Dismiss"
            onClick={() => setError(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}

      {!activeTable ? (
        <BaseEmptyState
          disabled={loading || pendingMutations > 0}
          creatingTemplate={creatingFirstTemplate}
          templateError={firstTemplateError}
          onCreateTemplate={(template) => void createFirstTable(template)}
          importAction={
            <BaseCsvImportPopover
              triggerVariant="empty-state"
              disabled={loading || pendingMutations > 0}
              onSelect={selectCsv}
              onPreview={previewCsvImport}
              onImport={importCsvIntoBase}
              onProgress={getCsvOperation}
              onCancel={cancelCsvOperation}
            />
          }
        />
      ) : (
        <BaseEditorContent>
          {activeView &&
          activeExtensionContributionId &&
          activeExtensionView &&
          !useExtensionGridFallback ? (
            <ExtensionBaseViewSurface
              key={`${activeTable.table.id}:${activeView?.id}:${activeExtensionView.contentDigest}`}
              extension={activeExtensionView}
              filePath={filePath}
              table={activeTable}
              view={activeView}
              loadPage={loadActiveTablePage}
              onFallback={() =>
                setExtensionGridFallbackViewId(activeView?.id ?? null)
              }
            />
          ) : activeView?.type === "gallery" ? (
            <BaseGalleryView
              key={`${activeTable.table.id}:${activeView.id}`}
              table={activeTable}
              view={activeView}
              disabled={blockingMutations > 0}
              reloadToken={gridReloadToken}
              searchResultIndex={activeSearchResultIndex}
              loadPage={loadActiveCardPage}
              loadRow={loadActiveTableRow}
              onCellEdit={saveInspectorCell}
              onImportFiles={importBaseFiles}
              onImportDroppedFiles={importDroppedBaseFiles}
              onSearchRelation={searchRelationRecords}
              onDeleteRow={deleteSingleRow}
              onOpenRecordInTab={openRecordInTab}
              onOpenFile={openBaseFileReference}
              onRevealFile={revealBaseFileReference}
              onRowCountChange={handleSearchResultCountChange}
              onError={handleGridError}
              sidePanel={fieldPropertySidePanel}
            />
          ) : activeView?.type === "kanban" ? (
            <BaseKanbanView
              key={`${activeTable.table.id}:${activeView.id}`}
              table={activeTable}
              view={activeView}
              disabled={blockingMutations > 0}
              reloadToken={gridReloadToken}
              searchResultIndex={activeSearchResultIndex}
              loadGroupCounts={loadKanbanGroupCounts}
              loadGroupPage={loadKanbanGroupPage}
              loadRow={loadActiveTableRow}
              onCellEdit={saveInspectorCell}
              onAddRow={createRowInGroup}
              onImportFiles={importBaseFiles}
              onImportDroppedFiles={importDroppedBaseFiles}
              onSearchRelation={searchRelationRecords}
              onDeleteRow={deleteSingleRow}
              onOpenRecordInTab={openRecordInTab}
              onOpenFile={openBaseFileReference}
              onRevealFile={revealBaseFileReference}
              onRowCountChange={handleSearchResultCountChange}
              onError={handleGridError}
              sidePanel={fieldPropertySidePanel}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              {activeExtensionContributionId ? (
                <div
                  className="flex shrink-0 items-center gap-3 border-b border-amber-500/20 bg-amber-500/5 px-3 py-2"
                  data-extension-base-view-fallback
                  role="status"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">
                      Showing Grid instead of {activeView?.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {activeExtensionView
                        ? "The extension view could not start. Your Base remains fully editable in the built-in Grid."
                        : `Restore ${activeExtensionContributionId} in Extensions to use this saved layout.`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {activeExtensionView ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setExtensionGridFallbackViewId(null)}
                      >
                        Retry view
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        openSettings({
                          section: "space-extensions",
                          showSpaceSettings: true,
                        })
                      }
                    >
                      Manage extensions
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="relative min-h-0 flex-1">
                <BaseGrid
                  key={`${activeTable.table.id}:${activeView?.id ?? "default"}`}
                  table={activeTable}
                  view={renderedGridView}
                  disabled={blockingMutations > 0}
                  reloadToken={gridReloadToken}
                  loadPage={loadActiveTablePage}
                  loadColumnStats={loadActiveColumnStats}
                  onAddRow={createRow}
                  onCellEdit={saveGridCell}
                  onInspectorCellEdit={saveInspectorCell}
                  onRowsEdit={saveRows}
                  onSelectedRowsChange={setSelectedRowRanges}
                  onRowCountChange={handleSearchResultCountChange}
                  searchResultIndex={activeSearchResultIndex}
                  onImportFiles={importBaseFiles}
                  onImportDroppedFiles={importDroppedBaseFiles}
                  onOpenRecordInTab={openRecordInTab}
                  onOpenFile={openBaseFileReference}
                  onRevealFile={revealBaseFileReference}
                  onSearchRelation={searchRelationRecords}
                  propertyField={fieldPropertyTarget}
                  onPropertyFieldOpen={openFieldProperty}
                  onPropertyFieldClose={closeFieldProperty}
                  onFieldUpdate={updateFieldInBase}
                  onAddField={openFieldCreator}
                  onEditFormula={setFormulaTarget}
                  onEditLookup={setLookupTarget}
                  onDeleteField={requestFieldDelete}
                  onRequestDeleteRows={requestRowRangeDelete}
                  onViewUpdate={
                    useExtensionGridFallback ? undefined : updateActiveView
                  }
                  onError={handleGridError}
                />
              </div>
            </div>
          )}
          {activeTable.rowCount === 0 ||
          (hasActiveQuery && visibleRowCount === 0) ? (
            <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-6">
              <div className="pointer-events-auto border bg-background/95 px-5 py-4 text-center shadow-sm backdrop-blur-sm">
                {activeTable.rowCount === 0 ? (
                  <>
                    <h2 className="text-sm font-medium">
                      Start building {activeTable.table.name}
                    </h2>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                      Add a row to enter data, or define fields before you
                      begin. Changes are saved directly to this Base file.
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void createRow().catch(() => undefined)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add first row
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openFieldCreator()}
                      >
                        Add field
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-sm font-medium">No matching rows</h2>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                      Try another search or clear this view's filters.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setSearch("")
                        void updateActiveView({ filter: null })
                      }}
                    >
                      Clear search and filters
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </BaseEditorContent>
      )}

      <BaseSheetTabs
        tables={snapshot.tables.map((candidate) => candidate.table)}
        activeTableId={activeTableId}
        disabled={loading || blockingMutations > 0}
        createAction={
          <BaseSheetCreatePopover
            disabled={loading || blockingMutations > 0}
            csvImportProps={{
              disabled: loading || pendingMutations > 0,
              onSelect: selectCsv,
              onPreview: previewCsvImport,
              onImport: importCsvIntoBase,
              onProgress: getCsvOperation,
              onCancel: cancelCsvOperation,
            }}
            onCreate={createTableInBase}
          />
        }
        onSelect={setActiveTableId}
        onRename={(table) =>
          setRenameTarget({
            kind: "table",
            tableId: table.id,
            name: table.name,
          })
        }
        onDelete={(table) =>
          setDeleteTarget({
            kind: "table",
            tableId: table.id,
            name: table.name,
          })
        }
        status={
          pendingMutations > 0 ? (
            <span className="flex items-center gap-1">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              Saving…
            </span>
          ) : failedMutationKeys.size === 0 && lastSavedAt ? (
            <span className="flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          ) : undefined
        }
      />

      <BaseStructureDialog
        mode="field"
        open={structureDialog === "field"}
        onOpenChange={(open) => {
          if (!open) {
            setStructureDialog(null)
            setFieldInsertIndex(null)
          }
        }}
        onCreateTable={createTableInBase}
        onCreateField={createFieldInBase}
        tables={snapshot.tables.map((candidate) => candidate.table)}
        fields={activeTable?.fields ?? []}
        tableFields={Object.fromEntries(
          snapshot.tables.map((candidate) => [
            candidate.table.id,
            candidate.fields,
          ])
        )}
        activeTableId={activeTable?.table.id}
        onPreviewFormula={previewActiveFormula}
      />

      <BaseRenameDialog
        kind={renameTarget?.kind ?? "table"}
        name={renameTarget?.name ?? ""}
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null)
        }}
        onRename={renameStructure}
      />

      <BaseFormulaEditor
        field={formulaTarget}
        fields={activeTable?.fields ?? []}
        open={formulaTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFormulaTarget(null)
        }}
        onPreview={previewActiveFormula}
        onSave={saveFormula}
      />

      <BaseLookupEditor
        field={lookupTarget}
        fields={activeTable?.fields ?? []}
        tables={snapshot.tables}
        open={lookupTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLookupTarget(null)
        }}
        onSave={saveLookup}
      />

      <AlertDialog
        open={deleteRowsDialogOpen}
        onOpenChange={setDeleteRowsDialogOpen}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedRowCount}{" "}
              {selectedRowCount === 1 ? "row" : "rows"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This updates the Base file immediately. You can recover the rows
              from Version history until the change is committed or discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDeleteRowsDialogOpen(false)
                void deleteSelectedRows().catch(() => undefined)
              }}
            >
              Delete rows
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.kind} “{deleteTarget?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "table"
                ? "All rows, fields, and views in this table will be removed from the Base file."
                : "All values stored in this field will be removed from the Base file."}{" "}
              You can recover this change from Version history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void deleteStructure().catch(() => undefined)
              }}
            >
              Delete {deleteTarget?.kind}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BaseEditorRoot>
  )
}
