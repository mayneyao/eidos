import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseFormulaPreviewInput,
  BaseRow,
  BaseRowMutationResult,
  BaseRowQuery,
  BaseRowRange,
  BaseRelationValue,
  BaseRowsDeleteResult,
  BaseSnapshot,
  BaseSqlPrimitive,
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
} from "lucide-react"

import { cn } from "@/lib/utils"
import { toSpaceFileUrl } from "@/apps/web-app/components/file-space/file-path"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useSpaceBase } from "@/apps/web-app/hooks/use-space-base"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"
import { Button } from "@/components/ui/button"
import { useTabStore } from "@/apps/web-app/store/tabs"
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
import { BaseCsvImportPopover } from "./base-csv-import-popover"
import { baseOpenErrorPresentation } from "./base-open-error"
import { BaseFieldOptionsDialog } from "./base-field-options-dialog"
import { BaseFormulaEditor } from "./base-formula-editor"
import { BaseLookupEditor } from "./base-lookup-editor"
import { BaseQueryToolbar } from "./base-query-toolbar"
import { BaseRenameDialog } from "./base-rename-dialog"
import { BaseStructureDialog } from "./base-structure-dialog"
import { BaseStructureMenu } from "./base-structure-menu"
import { BaseViewMenu } from "./base-view-menu"
import { BaseViewSelector } from "./base-view-selector"

interface SpaceBaseEditorProps {
  filePath: string
}

const BASE_ATTACHMENT_DIRECTORY = "assets"

type RenameTarget =
  | { kind: "table"; tableId: string; name: string }
  | {
      kind: "field"
      tableId: string
      columnName: string
      name: string
    }

type DeleteTarget = RenameTarget

export function SpaceBaseEditor({ filePath }: SpaceBaseEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
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
    getTablePage,
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
    deleteRowRanges,
  } = useSpaceBase(currentSpace?.id)
  const [snapshot, setSnapshot] = useState<BaseSnapshot | null>(null)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [activeViewIds, setActiveViewIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [pendingMutations, setPendingMutations] = useState(0)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const mutatingRef = useRef(false)
  const pendingMutationCountRef = useRef(0)
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [error, setError] = useState<string | null>(null)
  const [gridReloadToken, setGridReloadToken] = useState(0)
  const [search, setSearch] = useState("")
  const [focusSearchToken, setFocusSearchToken] = useState(0)
  const [visibleRowCount, setVisibleRowCount] = useState<number | null>(null)
  const [selectedRowRanges, setSelectedRowRanges] = useState<BaseRowRange[]>([])
  const [deleteRowsDialogOpen, setDeleteRowsDialogOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [fieldOptionsTarget, setFieldOptionsTarget] =
    useState<BaseFieldInfo | null>(null)
  const [formulaTarget, setFormulaTarget] = useState<BaseFieldInfo | null>(null)
  const [lookupTarget, setLookupTarget] = useState<BaseFieldInfo | null>(null)
  const [structureDialog, setStructureDialog] = useState<
    "table" | "field" | null
  >(null)
  const [fieldInsertIndex, setFieldInsertIndex] = useState<number | null>(null)

  const applySnapshot = useCallback((next: BaseSnapshot) => {
    setSnapshot(next)
    setActiveTableId((current) => {
      if (current && next.tables.some(({ table }) => table.id === current)) {
        return current
      }
      return next.metadata.defaultTableId ?? next.tables.at(0)?.table.id ?? null
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      applySnapshot(await getSnapshot(filePath))
      setGridReloadToken((current) => current + 1)
      setError(null)
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to open Base"
      )
    } finally {
      setLoading(false)
    }
  }, [applySnapshot, filePath, getSnapshot])

  useEffect(() => {
    void load()
  }, [load])

  useSpaceFileChanges(
    currentSpace?.id,
    useCallback(
      (event) => {
        if (event.path === filePath && !mutatingRef.current) void load()
      },
      [filePath, load]
    )
  )

  const activeTable = useMemo(
    () =>
      snapshot?.tables.find(({ table }) => table.id === activeTableId) ?? null,
    [activeTableId, snapshot?.tables]
  )
  const activeView = useMemo(() => {
    if (!activeTable) return undefined
    const selectedId = activeViewIds[activeTable.table.id]
    return (
      activeTable.views.find(
        (view) => view.id === selectedId && view.type === "grid"
      ) ?? activeTable.views.find((view) => view.type === "grid")
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

  useEffect(() => {
    setSearch("")
    setVisibleRowCount(null)
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
      onSuccess?: (result: T) => void
    ): Promise<T> => {
      pendingMutationCountRef.current += 1
      mutatingRef.current = true
      setPendingMutations((current) => current + 1)

      const run = mutationQueueRef.current
        .catch(() => undefined)
        .then(operation)
      const handled = run
        .then(
          (result) => {
            onSuccess?.(result)
            setError(null)
            setLastSavedAt(Date.now())
            return result
          },
          (mutationError) => {
            setError(
              mutationError instanceof Error
                ? mutationError.message
                : "Unable to update Base"
            )
            void load()
            throw mutationError
          }
        )
        .finally(() => {
          pendingMutationCountRef.current -= 1
          mutatingRef.current = pendingMutationCountRef.current > 0
          setPendingMutations((current) => Math.max(0, current - 1))
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
      setSnapshot((current) =>
        current
          ? {
              ...current,
              tables: current.tables.map((candidate) =>
                candidate.table.id === tableId
                  ? { ...candidate, rowCount }
                  : candidate
              ),
            }
          : current
      )
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

  const loadActiveTablePage = useCallback(
    (offset: number, limit: number) => {
      if (!activeTableId) {
        return Promise.reject(new Error("No active Base table"))
      }
      return getTablePage(filePath, activeTableId, offset, limit, activeQuery)
    },
    [activeQuery, activeTableId, filePath, getTablePage]
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
        if (hasActiveQuery) setGridReloadToken((current) => current + 1)
      }
    )
  }, [
    activeTable,
    enqueueMutation,
    filePath,
    hasActiveQuery,
    insertRow,
    updateTableRowCount,
  ])

  const saveCell = useCallback(
    (
      row: BaseRow,
      field: BaseFieldInfo,
      value: BaseSqlPrimitive
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
          if (hasActiveQuery) setGridReloadToken((current) => current + 1)
        }
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
        }
      ).then(() => undefined)
    },
    [applySnapshot, createTable, enqueueMutation, filePath, snapshot?.tables]
  )

  const importCsvIntoBase = useCallback(
    (token: string, options: Parameters<typeof importCsv>[2]): Promise<void> =>
      enqueueMutation(
        () => importCsv(filePath, token, options),
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
        applySnapshot
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
      const operation = () =>
        renameTarget.kind === "table"
          ? updateTable(filePath, renameTarget.tableId, { name })
          : updateField(
              filePath,
              renameTarget.tableId,
              renameTarget.columnName,
              { name }
            )
      return enqueueMutation(operation, applySnapshot).then(() => undefined)
    },
    [
      applySnapshot,
      enqueueMutation,
      filePath,
      renameTarget,
      updateField,
      updateTable,
    ]
  )

  const deleteStructure = useCallback((): Promise<void> => {
    if (!deleteTarget) return Promise.resolve()
    const operation = () =>
      deleteTarget.kind === "table"
        ? deleteTable(filePath, deleteTarget.tableId)
        : deleteField(filePath, deleteTarget.tableId, deleteTarget.columnName)
    return enqueueMutation(operation, applySnapshot).then(() => {
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

  const saveFieldOptions = useCallback(
    (property: Record<string, unknown>): Promise<void> => {
      if (!activeTable || !fieldOptionsTarget) return Promise.resolve()
      return enqueueMutation(
        () =>
          updateField(
            filePath,
            activeTable.table.id,
            fieldOptionsTarget.tableColumnName,
            { property }
          ),
        applySnapshot
      ).then(() => undefined)
    },
    [
      activeTable,
      applySnapshot,
      enqueueMutation,
      fieldOptionsTarget,
      filePath,
      updateField,
    ]
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
    (name: string): Promise<void> => {
      if (!activeTable) return Promise.resolve()
      const tableId = activeTable.table.id
      const existingIds = new Set(activeTable.views.map((view) => view.id))
      return enqueueMutation(
        () => createView(filePath, tableId, { name, type: "grid" }),
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
        }
      ).then(() => undefined)
    },
    [activeTable, applySnapshot, createView, enqueueMutation, filePath]
  )

  const renameViewInBase = useCallback(
    (viewId: string, name: string): Promise<void> =>
      enqueueMutation(
        () => updateView(filePath, viewId, { name }),
        applySnapshot
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
        applySnapshot
      ).then(() => undefined)
    },
    [activeTable, applySnapshot, enqueueMutation, filePath, reorderViews]
  )

  const updateActiveView = useCallback(
    (changes: Parameters<typeof updateView>[2]): Promise<void> => {
      if (!activeView) return Promise.resolve()
      return enqueueMutation(
        () => updateView(filePath, activeView.id, changes),
        applySnapshot
      ).then(() => undefined)
    },
    [activeView, applySnapshot, enqueueMutation, filePath, updateView]
  )

  const handleGridError = useCallback((gridError: unknown) => {
    setError(
      gridError instanceof Error ? gridError.message : "Unable to update Base"
    )
  }, [])

  if (loading && !snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
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
          <Button variant="outline" size="sm" onClick={load}>
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
      <div className="flex h-10 shrink-0 items-end border-b bg-muted/15 px-2">
        <div className="flex min-w-0 flex-1 items-end gap-px overflow-x-auto">
          {snapshot.tables.map(({ table }) => (
            <button
              key={table.id}
              type="button"
              onClick={() => setActiveTableId(table.id)}
              className={cn(
                "relative flex h-9 max-w-56 shrink-0 items-center gap-1.5 px-3 text-[13px] text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                activeTableId === table.id && "text-foreground"
              )}
            >
              <Table2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{table.name}</span>
              {activeTableId === table.id ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 bg-foreground/75" />
              ) : null}
            </button>
          ))}
          <button
            type="button"
            className="flex h-9 w-8 shrink-0 items-center justify-center text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label="Add Base table"
            title="New table"
            onClick={() => setStructureDialog("table")}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-1 pl-2">
          {pendingMutations > 0 ? (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          ) : lastSavedAt ? (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          ) : null}
          {selectedRowCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => setDeleteRowsDialogOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedRowCount}
            </Button>
          ) : null}
          {activeTable ? (
            <>
              <BaseViewSelector
                views={activeTable.views}
                activeView={activeView}
                disabled={pendingMutations > 0}
                onSelect={selectActiveView}
                onCreate={createViewInBase}
                onRename={renameViewInBase}
                onDuplicate={duplicateViewInBase}
                onDelete={deleteViewInBase}
                onReorder={reorderViewsInBase}
              />
              <BaseQueryToolbar
                fields={activeTable.fields}
                filter={activeView?.filter ?? null}
                sorts={activeView?.sorts ?? []}
                search={search}
                disabled={pendingMutations > 0}
                focusSearchToken={focusSearchToken}
                onSearchChange={setSearch}
                onFilterChange={(filter) => updateActiveView({ filter })}
                onSortsChange={(sorts) => updateActiveView({ sorts })}
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
                disabled={pendingMutations > 0}
                onHiddenFieldsChange={(hiddenFields) =>
                  void updateActiveView({ hiddenFields })
                }
              />
              <BaseStructureMenu
                table={activeTable.table}
                fields={activeTable.fields}
                disabled={pendingMutations > 0}
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
                onRenameField={(field) =>
                  setRenameTarget({
                    kind: "field",
                    tableId: activeTable.table.id,
                    columnName: field.tableColumnName,
                    name: field.name,
                  })
                }
                onEditFieldOptions={setFieldOptionsTarget}
                onEditFormula={setFormulaTarget}
                onEditLookup={setLookupTarget}
                onDeleteField={(field) =>
                  setDeleteTarget({
                    kind: "field",
                    tableId: activeTable.table.id,
                    columnName: field.tableColumnName,
                    name: field.name,
                  })
                }
              />
            </>
          ) : null}
          <BaseCsvImportPopover
            disabled={loading || pendingMutations > 0}
            onSelect={selectCsv}
            onPreview={previewCsvImport}
            onImport={importCsvIntoBase}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!activeTable}
            onClick={() => void createRow().catch(() => undefined)}
          >
            <Plus className="h-3.5 w-3.5" />
            New row
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
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
          {error}
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
          <BaseGrid
            key={`${activeTable.table.id}:${activeView?.id ?? "default"}`}
            table={activeTable}
            view={activeView}
            disabled={pendingMutations > 0}
            reloadToken={gridReloadToken}
            loadPage={loadActiveTablePage}
            onAddRow={createRow}
            onCellEdit={saveCell}
            onSelectedRowsChange={setSelectedRowRanges}
            onRowCountChange={setVisibleRowCount}
            onImportFiles={importBaseFiles}
            onImportDroppedFiles={importDroppedBaseFiles}
            onOpenFile={openBaseFileReference}
            onRevealFile={(path) => reveal(path).then(() => undefined)}
            onSearchRelation={searchRelationRecords}
            onAddField={openFieldCreator}
            onRenameField={(field) =>
              setRenameTarget({
                kind: "field",
                tableId: activeTable.table.id,
                columnName: field.tableColumnName,
                name: field.name,
              })
            }
            onEditFieldOptions={setFieldOptionsTarget}
            onEditFormula={setFormulaTarget}
            onEditLookup={setLookupTarget}
            onDeleteField={(field) =>
              setDeleteTarget({
                kind: "field",
                tableId: activeTable.table.id,
                columnName: field.tableColumnName,
                name: field.name,
              })
            }
            onRequestDeleteRows={(ranges) => {
              setSelectedRowRanges(ranges)
              setDeleteRowsDialogOpen(true)
            }}
            onViewUpdate={updateActiveView}
            onError={handleGridError}
          />
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

      <BaseFieldOptionsDialog
        field={fieldOptionsTarget}
        open={fieldOptionsTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFieldOptionsTarget(null)
        }}
        onSave={saveFieldOptions}
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
