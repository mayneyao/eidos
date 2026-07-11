import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowMutationResult,
  BaseRowRange,
  BaseRowsDeleteResult,
  BaseSnapshot,
  BaseSqlPrimitive,
} from "@eidos.space/base"
import {
  AlertTriangle,
  LoaderCircle,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useSpaceBase } from "@/apps/web-app/hooks/use-space-base"
import { useSpaceFileChanges } from "@/apps/web-app/hooks/use-space-files"
import { Button } from "@/components/ui/button"
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
import { BaseRenameDialog } from "./base-rename-dialog"
import { BaseStructureDialog } from "./base-structure-dialog"
import { BaseStructureMenu } from "./base-structure-menu"

interface SpaceBaseEditorProps {
  filePath: string
}

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
  const { currentSpace } = useCurrentSpace()
  const {
    getSnapshot,
    getTablePage,
    createTable,
    updateTable,
    deleteTable,
    addField,
    updateField,
    deleteField,
    updateView,
    insertRow,
    updateRow,
    deleteRowRanges,
  } = useSpaceBase(currentSpace?.id)
  const [snapshot, setSnapshot] = useState<BaseSnapshot | null>(null)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingMutations, setPendingMutations] = useState(0)
  const mutatingRef = useRef(false)
  const pendingMutationCountRef = useRef(0)
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [error, setError] = useState<string | null>(null)
  const [gridReloadToken, setGridReloadToken] = useState(0)
  const [selectedRowRanges, setSelectedRowRanges] = useState<BaseRowRange[]>([])
  const [deleteRowsDialogOpen, setDeleteRowsDialogOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [structureDialog, setStructureDialog] = useState<
    "table" | "field" | null
  >(null)

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

  const loadActiveTablePage = useCallback(
    (offset: number, limit: number) => {
      if (!activeTableId) {
        return Promise.reject(new Error("No active Base table"))
      }
      return getTablePage(filePath, activeTableId, offset, limit)
    },
    [activeTableId, filePath, getTablePage]
  )

  const createRow = useCallback((): Promise<BaseRowMutationResult> => {
    if (!activeTable) return Promise.reject(new Error("No active Base table"))
    const tableId = activeTable.table.id
    return enqueueMutation(
      () => insertRow(filePath, tableId, { title: "Untitled" }),
      (result) => updateTableRowCount(tableId, result.rowCount)
    )
  }, [activeTable, enqueueMutation, filePath, insertRow, updateTableRowCount])

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
        (result) => updateTableRowCount(tableId, result.rowCount)
      )
    },
    [activeTable, enqueueMutation, filePath, updateRow, updateTableRowCount]
  )

  const deleteSelectedRows = useCallback((): Promise<BaseRowsDeleteResult> => {
    if (!activeTable || selectedRowRanges.length === 0) {
      return Promise.reject(new Error("No Base rows selected"))
    }
    const tableId = activeTable.table.id
    const ranges = selectedRowRanges.map((range) => ({ ...range }))
    return enqueueMutation(
      () => deleteRowRanges(filePath, tableId, ranges),
      (result) => {
        updateTableRowCount(tableId, result.rowCount)
        setSelectedRowRanges([])
        setGridReloadToken((current) => current + 1)
      }
    )
  }, [
    activeTable,
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

  const createFieldInBase = useCallback(
    (field: Parameters<typeof addField>[2]): Promise<void> => {
      if (!activeTable) return Promise.resolve()
      return enqueueMutation(
        () => addField(filePath, activeTable.table.id, field),
        applySnapshot
      ).then(() => undefined)
    },
    [activeTable, addField, applySnapshot, enqueueMutation, filePath]
  )

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

  const updateActiveView = useCallback(
    (changes: Parameters<typeof updateView>[2]): Promise<void> => {
      const view = activeTable?.views.find(
        (candidate) => candidate.type === "grid"
      )
      if (!view) return Promise.resolve()
      return enqueueMutation(
        () => updateView(filePath, view.id, changes),
        applySnapshot
      ).then(() => undefined)
    },
    [activeTable?.views, applySnapshot, enqueueMutation, filePath, updateView]
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
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <AlertTriangle className="mb-3 h-5 w-5 text-destructive" />
        <p className="max-w-md text-sm text-foreground">
          {error ?? "This file is not a valid Eidos Base."}
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={load}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
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
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
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
            <BaseStructureMenu
              table={activeTable.table}
              fields={activeTable.fields}
              disabled={pendingMutations > 0}
              onNewField={() => setStructureDialog("field")}
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
              onDeleteField={(field) =>
                setDeleteTarget({
                  kind: "field",
                  tableId: activeTable.table.id,
                  columnName: field.tableColumnName,
                  name: field.name,
                })
              }
            />
          ) : null}
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
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
          This Base has no tables yet.
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <BaseGrid
            key={activeTable.table.id}
            table={activeTable}
            view={activeTable.views.find((view) => view.type === "grid")}
            reloadToken={gridReloadToken}
            loadPage={loadActiveTablePage}
            onAddRow={createRow}
            onCellEdit={saveCell}
            onSelectedRowsChange={setSelectedRowRanges}
            onViewUpdate={updateActiveView}
            onError={handleGridError}
          />
        </div>
      )}

      <BaseStructureDialog
        mode={structureDialog ?? "table"}
        open={structureDialog !== null}
        onOpenChange={(open) => {
          if (!open) setStructureDialog(null)
        }}
        onCreateTable={createTableInBase}
        onCreateField={createFieldInBase}
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
