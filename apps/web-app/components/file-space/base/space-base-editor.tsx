import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseSnapshot,
  BaseSqlPrimitive,
} from "@eidos.space/base"
import {
  AlertTriangle,
  Columns3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Table2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useSpaceBase } from "@/apps/web-app/hooks/use-space-base"
import { useSpaceFileChanges } from "@/apps/web-app/hooks/use-space-files"
import { Button } from "@/components/ui/button"

import { BaseGrid } from "./base-grid"
import { BaseStructureDialog } from "./base-structure-dialog"

interface SpaceBaseEditorProps {
  filePath: string
}

export function SpaceBaseEditor({ filePath }: SpaceBaseEditorProps) {
  const { currentSpace } = useCurrentSpace()
  const { getSnapshot, createTable, addField, insertRow, updateRow } =
    useSpaceBase(currentSpace?.id)
  const [snapshot, setSnapshot] = useState<BaseSnapshot | null>(null)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingMutations, setPendingMutations] = useState(0)
  const mutatingRef = useRef(false)
  const pendingMutationCountRef = useRef(0)
  const mutationRevisionRef = useRef(0)
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [error, setError] = useState<string | null>(null)
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
  const enqueueMutation = useCallback(
    (
      operation: () => Promise<BaseSnapshot>,
      onSuccess?: (snapshot: BaseSnapshot) => void
    ): Promise<void> => {
      const revision = ++mutationRevisionRef.current
      pendingMutationCountRef.current += 1
      mutatingRef.current = true
      setPendingMutations((current) => current + 1)

      const run = mutationQueueRef.current
        .catch(() => undefined)
        .then(operation)
      const settled = run
        .then(
          (next) => {
            if (revision === mutationRevisionRef.current) applySnapshot(next)
            onSuccess?.(next)
            setError(null)
          },
          (mutationError) => {
            setError(
              mutationError instanceof Error
                ? mutationError.message
                : "Unable to update Base"
            )
            void load()
          }
        )
        .finally(() => {
          pendingMutationCountRef.current -= 1
          mutatingRef.current = pendingMutationCountRef.current > 0
          setPendingMutations((current) => Math.max(0, current - 1))
        })
      mutationQueueRef.current = settled
      return settled
    },
    [applySnapshot, load]
  )

  const createRow = useCallback((): Promise<void> => {
    if (!activeTable) return Promise.resolve()
    return enqueueMutation(() =>
      insertRow(filePath, activeTable.table.id, { title: "Untitled" })
    )
  }, [activeTable, enqueueMutation, filePath, insertRow])

  const saveCell = useCallback(
    (
      row: BaseRow,
      field: BaseFieldInfo,
      value: BaseSqlPrimitive
    ): Promise<void> => {
      if (
        !activeTable ||
        !row._id ||
        Object.is(row[field.tableColumnName], value)
      ) {
        return Promise.resolve()
      }
      const rowId = String(row._id)
      const tableId = activeTable.table.id
      setSnapshot((current) =>
        current
          ? {
              ...current,
              tables: current.tables.map((candidate) =>
                candidate.table.id !== tableId
                  ? candidate
                  : {
                      ...candidate,
                      rows: candidate.rows.map((candidateRow) =>
                        String(candidateRow._id) !== rowId
                          ? candidateRow
                          : {
                              ...candidateRow,
                              [field.tableColumnName]: value,
                            }
                      ),
                    }
              ),
            }
          : current
      )
      return enqueueMutation(() =>
        updateRow(filePath, tableId, rowId, {
          [field.tableColumnName]: value,
        })
      )
    },
    [activeTable, enqueueMutation, filePath, updateRow]
  )

  const createTableInBase = useCallback(
    (table: Parameters<typeof createTable>[1]): Promise<void> => {
      const existingIds = new Set(
        snapshot?.tables.map((candidate) => candidate.table.id) ?? []
      )
      return enqueueMutation(
        () => createTable(filePath, table),
        (next) => {
          const created = next.tables.find(
            (candidate) => !existingIds.has(candidate.table.id)
          )
          if (created) setActiveTableId(created.table.id)
        }
      )
    },
    [createTable, enqueueMutation, filePath, snapshot?.tables]
  )

  const createFieldInBase = useCallback(
    (field: Parameters<typeof addField>[2]): Promise<void> => {
      if (!activeTable) return Promise.resolve()
      return enqueueMutation(() =>
        addField(filePath, activeTable.table.id, field)
      )
    },
    [activeTable, addField, enqueueMutation, filePath]
  )

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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!activeTable}
            onClick={() => setStructureDialog("field")}
          >
            <Columns3 className="h-3.5 w-3.5" />
            New field
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!activeTable}
            onClick={() => void createRow()}
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
            table={activeTable}
            onAddRow={createRow}
            onCellEdit={saveCell}
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
    </div>
  )
}
