import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { uniqueSpaceEntryName } from "@eidos.space/file-space/names"
import {
  AlertTriangle,
  Check,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useOptionalTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import {
  isSameOrDescendant,
  toSpaceFileUrl,
} from "@/apps/web-app/components/file-space/file-path"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useSpaceBase } from "@/apps/web-app/hooks/use-space-base"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"
import { Button } from "@/components/ui/button"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useQuickOpenStore } from "@/apps/web-app/store/quick-open-store"
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
import { BaseFieldPropertyPanel } from "./base-field-property-panel"
import { BaseKanbanView } from "./base-kanban-view"
import { baseOpenErrorPresentation } from "./base-open-error"
import { BaseFormulaEditor } from "./base-formula-editor"
import { BaseLookupEditor } from "./base-lookup-editor"
import { BaseQueryToolbar } from "./base-query-toolbar"
import { BaseRenameDialog } from "./base-rename-dialog"
import { BaseSheetTabs } from "./base-sheet-tabs"
import { BaseStructureDialog } from "./base-structure-dialog"
import { BaseStructureMenu } from "./base-structure-menu"
import { BaseViewMenu } from "./base-view-menu"
import { type BaseBuiltInViewType } from "./base-view-selector"
import { BaseViewTabs } from "./base-view-tabs"

interface SpaceBaseEditorProps {
  filePath: string
}

const BASE_ATTACHMENT_DIRECTORY = "assets"

type RenameTarget = { kind: "table"; tableId: string; name: string }

type DeleteTarget =
  | RenameTarget
  | {
      kind: "field"
      tableId: string
      columnName: string
      name: string
    }

const SUPPORTED_BASE_VIEW_TYPES = new Set(["grid", "gallery", "kanban"])

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

export function SpaceBaseEditor({ filePath }: SpaceBaseEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const tabContext = useOptionalTabContext()
  const registerQuickOpenSection = useQuickOpenStore(
    (state) => state.registerSection
  )
  const unregisterQuickOpenSection = useQuickOpenStore(
    (state) => state.unregisterSection
  )
  const { currentSpace } = useCurrentSpace()
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
    getTablePage,
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
  const mutatingRef = useRef(false)
  const pendingMutationCountRef = useRef(0)
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const knownBaseRevisionRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gridReloadToken, setGridReloadToken] = useState(0)
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
  const [structureDialog, setStructureDialog] = useState<
    "table" | "field" | null
  >(null)
  const [fieldInsertIndex, setFieldInsertIndex] = useState<number | null>(null)

  const applySnapshot = useCallback((next: BaseSnapshot) => {
    knownBaseRevisionRef.current = next.metadata.updatedAt
    setSnapshot(next)
    setActiveTableId((current) => {
      if (current && next.tables.some(({ table }) => table.id === current)) {
        return current
      }
      return next.metadata.defaultTableId ?? next.tables.at(0)?.table.id ?? null
    })
  }, [])

  const load = useCallback(
    async (options: { preserveError?: boolean } = {}) => {
      setLoading(true)
      try {
        applySnapshot(await getSnapshot(filePath))
        setGridReloadToken((current) => current + 1)
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

  useEffect(() => {
    if (!tabContext?.tabId || !snapshot) return
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
  }, [snapshot])
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
        (view) =>
          view.id === selectedId && SUPPORTED_BASE_VIEW_TYPES.has(view.type)
      ) ??
      activeTable.views.find((view) => SUPPORTED_BASE_VIEW_TYPES.has(view.type))
    )
  }, [activeTable, activeViewIds])
  const activeQuery = useMemo<BaseRowQuery>(
    () => ({
      ...(search ? { search } : {}),
      filter: activeView?.filter ?? null,
      sorts: activeView?.sorts ?? [],
    }),
    [activeView?.filter, activeView?.sorts, search]
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
  const enqueueMutation = useCallback(
    <T,>(
      operation: () => Promise<T>,
      onSuccess?: (result: T) => void,
      options: { blocking?: boolean; errorMode?: "global" | "local" } = {}
    ): Promise<T> => {
      const blocking = options.blocking !== false
      const errorMode = options.errorMode ?? "global"
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
            setLastSavedAt(Date.now())
            return result
          },
          async (mutationError) => {
            if (errorMode === "global") {
              setError(
                mutationError instanceof Error
                  ? mutationError.message
                  : "Unable to update Base"
              )
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
    [load]
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
      await listFiles(BASE_ATTACHMENT_DIRECTORY)
    } catch {
      try {
        await createDirectory(BASE_ATTACHMENT_DIRECTORY)
      } catch {
        await listFiles(BASE_ATTACHMENT_DIRECTORY)
      }
    }
  }, [createDirectory, listFiles])

  const importBaseFiles = useCallback(async (): Promise<string[]> => {
    await ensureAttachmentDirectory()
    const result = await importFiles(BASE_ATTACHMENT_DIRECTORY)
    if (result.errors.length > 0) {
      console.warn("Some Base attachments could not be imported", result.errors)
    }
    return result.imported.map((entry) => entry.path)
  }, [ensureAttachmentDirectory, importFiles])

  const importDroppedBaseFiles = useCallback(
    async (files: File[]): Promise<string[]> => {
      if (files.length === 0) return []
      await ensureAttachmentDirectory()
      const existingNames = (await listFiles(BASE_ATTACHMENT_DIRECTORY)).map(
        (entry) => entry.name
      )
      const imported: string[] = []
      for (const file of files) {
        const name = uniqueSpaceEntryName(
          existingNames,
          file.name || `attachment-${Date.now()}`
        )
        existingNames.push(name)
        const path = `${BASE_ATTACHMENT_DIRECTORY}/${name}`
        await createBinary(path, new Uint8Array(await file.arrayBuffer()))
        imported.push(path)
      }
      return imported
    },
    [createBinary, ensureAttachmentDirectory, listFiles]
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
        cursor
      )
    },
    [activeQuery, activeTableId, filePath, getTablePage]
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
      { blocking: false }
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
        { blocking: false, errorMode: "local" }
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
          if (hasActiveQuery) {
            setGridReloadToken((current) => current + 1)
          }
        },
        { blocking: false, errorMode }
      )
    },
    [
      activeTable,
      enqueueMutation,
      filePath,
      hasActiveQuery,
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

  const saveRows = useCallback(
    (
      edits: Array<{ row: BaseRow; changes: BaseRow }>
    ): Promise<BaseRowsMutationResult> => {
      if (!activeTable || edits.length === 0) {
        return Promise.reject(new Error("No Base rows to update"))
      }
      const tableId = activeTable.table.id
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
          if (hasActiveQuery) {
            setGridReloadToken((current) => current + 1)
          }
        },
        { blocking: false, errorMode: "local" }
      )
    },
    [
      activeTable,
      enqueueMutation,
      filePath,
      hasActiveQuery,
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
        { errorMode: "local" }
      ).then(() => undefined)
    },
    [applySnapshot, createTable, enqueueMutation, filePath, snapshot?.tables]
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
        }
      ).then(() => undefined),
    [applySnapshot, enqueueMutation, filePath, importCsv]
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
        { errorMode: "local" }
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
        { errorMode: "local" }
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
    return enqueueMutation(operation, applySnapshot).then(() => {
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
        { errorMode: "local" }
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
        { errorMode: "local" }
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
        { errorMode: "local" }
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
    (name: string, type: BaseBuiltInViewType): Promise<void> => {
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
        { errorMode: "local" }
      ).then(() => undefined)
    },
    [activeTable, applySnapshot, createView, enqueueMutation, filePath]
  )

  const renameViewInBase = useCallback(
    (viewId: string, name: string): Promise<void> =>
      enqueueMutation(
        () => updateView(filePath, viewId, { name }),
        applySnapshot,
        { errorMode: "local" }
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
        { errorMode: "local" }
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
        { errorMode: "local" }
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
        { errorMode: "local" }
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
        { errorMode: "local" }
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
        { errorMode }
      ).then(() => undefined)
    },
    [activeView, applySnapshot, enqueueMutation, filePath, updateView]
  )

  const handleGridError = useCallback((gridError: unknown) => {
    setError(
      gridError instanceof Error ? gridError.message : "Unable to update Base"
    )
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

  return (
    <div
      ref={editorRef}
      className="relative flex h-full min-h-0 flex-col bg-background"
    >
      <div
        data-base-workbar
        className="base-workbar eidos-shell-workbar flex shrink-0 items-end border-b bg-muted/15 px-2"
      >
        {activeTable ? (
          <BaseViewTabs
            views={activeTable.views}
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
                    !field.isHidden &&
                    (field.valueKind === "source" ||
                      field.valueKind === "relation" ||
                      field.valueKind === "derived")
                )}
                hiddenFields={activeView?.hiddenFields ?? []}
                disabled={blockingMutations > 0}
                onHiddenFieldsChange={(hiddenFields) =>
                  void updateActiveView({ hiddenFields })
                }
              />
              <BaseStructureMenu
                table={activeTable.table}
                fields={activeTable.fields}
                disabled={blockingMutations > 0}
                onNewField={() => openFieldCreator()}
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
          <BaseCsvImportPopover
            disabled={loading || pendingMutations > 0}
            onSelect={selectCsv}
            onPreview={previewCsvImport}
            onImport={importCsvIntoBase}
            onProgress={getCsvOperation}
            onCancel={cancelCsvOperation}
          />
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
      </div>

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
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
          <Table2 className="mb-3 h-5 w-5 text-muted-foreground" />
          <h2 className="text-sm font-medium">Create the first table</h2>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Tables keep related records and fields together inside this Base.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-4"
            onClick={() => setStructureDialog("table")}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New table
          </Button>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {activeView?.type === "gallery" ? (
            <BaseGalleryView
              key={`${activeTable.table.id}:${activeView.id}`}
              table={activeTable}
              view={activeView}
              reloadToken={gridReloadToken}
              searchResultIndex={activeSearchResultIndex}
              loadPage={loadActiveTablePage}
              onCellEdit={saveInspectorCell}
              onImportFiles={importBaseFiles}
              onImportDroppedFiles={importDroppedBaseFiles}
              onSearchRelation={searchRelationRecords}
              onDeleteRow={deleteSingleRow}
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
              onCellEdit={saveInspectorCell}
              onAddRow={createRowInGroup}
              onImportFiles={importBaseFiles}
              onImportDroppedFiles={importDroppedBaseFiles}
              onSearchRelation={searchRelationRecords}
              onDeleteRow={deleteSingleRow}
              onOpenFile={openBaseFileReference}
              onRevealFile={revealBaseFileReference}
              onRowCountChange={handleSearchResultCountChange}
              onError={handleGridError}
              sidePanel={fieldPropertySidePanel}
            />
          ) : (
            <BaseGrid
              key={`${activeTable.table.id}:${activeView?.id ?? "default"}`}
              table={activeTable}
              view={activeView}
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
              onViewUpdate={updateActiveView}
              onError={handleGridError}
            />
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
        </div>
      )}

      <BaseSheetTabs
        tables={snapshot.tables.map((candidate) => candidate.table)}
        activeTableId={activeTableId}
        disabled={loading || blockingMutations > 0}
        onSelect={setActiveTableId}
        onCreate={() => setStructureDialog("table")}
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
          ) : lastSavedAt ? (
            <span className="flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          ) : undefined
        }
      />

      <BaseStructureDialog
        mode={structureDialog ?? "table"}
        open={structureDialog !== null}
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
    </div>
  )
}
