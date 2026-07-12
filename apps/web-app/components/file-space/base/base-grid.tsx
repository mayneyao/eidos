import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowMutationResult,
  BaseRowPage,
  BaseRowRange,
  BaseSqlPrimitive,
  BaseTableSnapshot,
  BaseViewInfo,
  UpdateBaseViewInput,
} from "@eidos.space/base"
import DataEditor, {
  GridCellKind,
  type DataEditorProps,
  type DataEditorRef,
  type EditableGridCell,
  type GridColumn,
  type GridSelection,
  type HeaderClickedEventArgs,
  type Item,
  type Rectangle,
} from "@glideapps/glide-data-grid"
import { ListRestart, Pencil, Plus, Trash2 } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

import { useCurrentTheme } from "@/apps/web-app/hooks/use-current-theme"
import MultiSelectCell from "@/components/table/views/grid/cells/multi-select-cell"
import SelectCell from "@/components/table/views/grid/cells/select-cell"
import DatePickerCell from "@/components/table/views/grid/cells/date-picker-cell"
import RatingCell from "@/components/table/views/grid/cells/rating-cell"
import { defaultConfig } from "@/components/table/views/grid/grid-default-config"
import { useUndoRedo } from "@/components/table/views/grid/hooks/use-undo-redo"
import { useDynamicTheme } from "@/components/table/views/grid/theme"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import {
  baseGridColumn,
  baseValueToGridCell,
  gridCellToBaseValue,
  visibleBaseFields,
} from "./base-grid-adapter"
import {
  baseFileDisplayData,
  BaseFileCellRenderer,
  type BaseFileCell,
} from "./base-file-cell"
import { encodeBaseFilePaths } from "@eidos.space/base"

import "@glideapps/glide-data-grid/dist/index.css"

const PAGE_SIZE = 100
const PAGE_OVERSCAN = 1

interface BaseGridProps {
  table: BaseTableSnapshot
  view?: BaseViewInfo
  disabled?: boolean
  reloadToken?: number
  loadPage: (offset: number, limit: number) => Promise<BaseRowPage>
  onAddRow: () => Promise<BaseRowMutationResult>
  onCellEdit: (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => Promise<BaseRowMutationResult>
  onSelectedRowsChange?: (ranges: BaseRowRange[]) => void
  onRowCountChange?: (rowCount: number | null) => void
  onImportFiles?: () => Promise<string[]>
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => Promise<void> | void
  onAddField?: () => void
  onRenameField?: (field: BaseFieldInfo) => void
  onEditFieldOptions?: (field: BaseFieldInfo) => void
  onDeleteField?: (field: BaseFieldInfo) => void
  onViewUpdate?: (changes: UpdateBaseViewInput) => Promise<void> | void
  onError?: (error: unknown) => void
}

function sameFields(left: BaseFieldInfo[], right: BaseFieldInfo[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (field, index) => field.tableColumnName === right[index]?.tableColumnName
    )
  )
}

function viewWidths(view: BaseViewInfo | undefined): Record<string, number> {
  const value = view?.properties?.fieldWidthMap
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1])
    )
  )
}

function rowSelectionRanges(selection: GridSelection): BaseRowRange[] {
  const compactRanges = (
    selection.rows as unknown as {
      items?: readonly (readonly [number, number])[]
    }
  ).items
  if (compactRanges) {
    return compactRanges.map(([startIndex, endIndex]) => ({
      startIndex,
      endIndex,
    }))
  }

  const ranges: BaseRowRange[] = []
  for (const index of selection.rows) {
    const previous = ranges.at(-1)
    if (previous?.endIndex === index) {
      previous.endIndex = index + 1
    } else {
      ranges.push({ startIndex: index, endIndex: index + 1 })
    }
  }
  return ranges
}

export function BaseGrid({
  table,
  view,
  disabled = false,
  reloadToken = 0,
  loadPage,
  onAddRow,
  onCellEdit,
  onSelectedRowsChange,
  onRowCountChange,
  onImportFiles,
  onImportDroppedFiles,
  onOpenFile,
  onRevealFile,
  onAddField,
  onRenameField,
  onEditFieldOptions,
  onDeleteField,
  onViewUpdate,
  onError,
}: BaseGridProps) {
  const { resolvedTheme } = useTheme()
  const { css: spaceThemeCss } = useCurrentTheme()
  const theme = useDynamicTheme(resolvedTheme, spaceThemeCss)
  const gridRef = useRef<DataEditorRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const widthSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowsRef = useRef(new Map<number, BaseRow>())
  const loadedPagesRef = useRef(new Set<number>())
  const loadingPagesRef = useRef(new Map<number, number>())
  const generationRef = useRef(0)
  const [cacheRevision, setCacheRevision] = useState(0)
  const [rowCount, setRowCount] = useState(table.rowCount)
  const [fieldMenu, setFieldMenu] = useState<{
    field: BaseFieldInfo
    bounds: Rectangle
  } | null>(null)
  const availableFields = useMemo(
    () =>
      visibleBaseFields(table.fields, view?.hiddenFields).sort(
        (left, right) => {
          const leftOrder = view?.orderMap?.[left.tableColumnName]
          const rightOrder = view?.orderMap?.[right.tableColumnName]
          return (
            (leftOrder ?? Number.MAX_SAFE_INTEGER) -
            (rightOrder ?? Number.MAX_SAFE_INTEGER)
          )
        }
      ),
    [table.fields, view?.hiddenFields, view?.orderMap]
  )
  const [fields, setFields] = useState(availableFields)
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    viewWidths(view)
  )

  const loadPageIndex = useCallback(
    async (pageIndex: number) => {
      if (
        pageIndex < 0 ||
        loadedPagesRef.current.has(pageIndex) ||
        loadingPagesRef.current.has(pageIndex)
      ) {
        return
      }
      const generation = generationRef.current
      loadingPagesRef.current.set(pageIndex, generation)
      try {
        const page = await loadPage(pageIndex * PAGE_SIZE, PAGE_SIZE)
        if (generation !== generationRef.current) return
        page.rows.forEach((row, index) => {
          rowsRef.current.set(page.offset + index, row)
        })
        loadedPagesRef.current.add(pageIndex)
        setRowCount(page.total)
        onRowCountChange?.(page.total)
        setCacheRevision((current) => current + 1)
      } catch (error) {
        if (generation === generationRef.current) onError?.(error)
      } finally {
        if (loadingPagesRef.current.get(pageIndex) === generation) {
          loadingPagesRef.current.delete(pageIndex)
        }
      }
    },
    [loadPage, onError, onRowCountChange]
  )

  useEffect(() => {
    generationRef.current += 1
    rowsRef.current.clear()
    loadedPagesRef.current.clear()
    loadingPagesRef.current.clear()
    setRowCount(table.rowCount)
    onRowCountChange?.(null)
    setCacheRevision((current) => current + 1)
    onSelectedRowsChange?.([])
    void loadPageIndex(0)
  }, [
    loadPageIndex,
    onRowCountChange,
    onSelectedRowsChange,
    reloadToken,
    table.rowCount,
    table.table.id,
  ])

  useEffect(() => {
    setFields((current) =>
      sameFields(current, availableFields) ? current : availableFields
    )
  }, [availableFields])

  useEffect(() => {
    setWidths(viewWidths(view))
  }, [view?.id, view?.properties])

  useEffect(
    () => () => {
      generationRef.current += 1
      if (widthSaveTimerRef.current) clearTimeout(widthSaveTimerRef.current)
    },
    []
  )

  const columns = useMemo(
    () =>
      fields.map((field) => {
        const column = baseGridColumn(field)
        return {
          ...column,
          width:
            widths[field.tableColumnName] ??
            ("width" in column ? column.width : 180),
        }
      }),
    [fields, widths]
  )

  const getCellContent = useCallback<
    NonNullable<DataEditorProps["getCellContent"]>
  >(
    ([columnIndex, rowIndex]) => {
      const field = fields[columnIndex]
      const row = rowsRef.current.get(rowIndex)
      if (!field || !row) {
        return { kind: GridCellKind.Loading, allowOverlay: false }
      }
      const cell = baseValueToGridCell(
        field,
        row[field.tableColumnName],
        disabled
      )
      if (
        cell.kind === GridCellKind.Custom &&
        (cell.data as { kind?: unknown }).kind === "base-file-cell"
      ) {
        return {
          ...cell,
          data: {
            ...cell.data,
            onImport: onImportFiles,
            onOpen: onOpenFile,
            onReveal: onRevealFile,
          },
        } as BaseFileCell
      }
      return cell
    },
    [cacheRevision, disabled, fields, onImportFiles, onOpenFile, onRevealFile]
  )

  const requestVisiblePages = useCallback(
    (range: Rectangle) => {
      if (rowCount === 0) return
      const firstPage = Math.max(
        0,
        Math.floor(range.y / PAGE_SIZE) - PAGE_OVERSCAN
      )
      const lastPage = Math.min(
        Math.ceil(rowCount / PAGE_SIZE) - 1,
        Math.floor((range.y + Math.max(0, range.height - 1)) / PAGE_SIZE) +
          PAGE_OVERSCAN
      )
      for (let page = firstPage; page <= lastPage; page += 1) {
        void loadPageIndex(page)
      }
    },
    [loadPageIndex, rowCount]
  )

  const onVisibleRegionChanged = useCallback<
    NonNullable<DataEditorProps["onVisibleRegionChanged"]>
  >((range) => requestVisiblePages(range), [requestVisiblePages])

  const commitCell = useCallback(
    (location: Item, nextCell: EditableGridCell) => {
      if (disabled) return
      const [columnIndex, rowIndex] = location
      const field = fields[columnIndex]
      const row = rowsRef.current.get(rowIndex)
      if (!field || !row) return
      const nextValue = gridCellToBaseValue(field, nextCell)
      if (Object.is(row[field.tableColumnName], nextValue)) return

      const previous = row
      rowsRef.current.set(rowIndex, {
        ...row,
        [field.tableColumnName]: nextValue,
      })
      setCacheRevision((current) => current + 1)
      void onCellEdit(row, field, nextValue)
        .then((result) => {
          const current = rowsRef.current.get(rowIndex)
          if (current && String(current._id) === String(result.row._id)) {
            rowsRef.current.set(rowIndex, result.row)
            setRowCount(result.rowCount)
            setCacheRevision((revision) => revision + 1)
          }
        })
        .catch((error) => {
          rowsRef.current.set(rowIndex, previous)
          setCacheRevision((revision) => revision + 1)
          onError?.(error)
        })
    },
    [disabled, fields, onCellEdit, onError]
  )

  const appendRow = useCallback(async () => {
    try {
      const result = await onAddRow()
      const index = Math.max(0, result.rowCount - 1)
      rowsRef.current.set(index, result.row)
      setRowCount(result.rowCount)
      setCacheRevision((current) => current + 1)
      return "bottom" as const
    } catch (error) {
      onError?.(error)
      return undefined
    }
  }, [onAddRow, onError])

  const handleGridSelectionChange = useCallback(
    (selection: GridSelection) => {
      onSelectedRowsChange?.(rowSelectionRanges(selection))
    },
    [onSelectedRowsChange]
  )

  const isGridActive = useCallback(
    () => containerRef.current?.contains(document.activeElement) === true,
    []
  )

  const history = useUndoRedo(
    gridRef,
    getCellContent,
    commitCell,
    handleGridSelectionChange,
    isGridActive
  )

  const [fileDropHighlights, setFileDropHighlights] = useState<
    NonNullable<DataEditorProps["highlightRegions"]>
  >([])
  const onDragOverCell = useCallback<
    NonNullable<DataEditorProps["onDragOverCell"]>
  >(
    (location, transfer) => {
      const field = fields[location[0]]
      const hasFiles = transfer
        ? Array.from(transfer.items).some((item) => item.kind === "file")
        : false
      setFileDropHighlights(
        field?.type === "file" && hasFiles
          ? [
              {
                color: "#44BB0022",
                range: {
                  x: location[0],
                  y: location[1],
                  width: 1,
                  height: 1,
                },
              },
            ]
          : []
      )
    },
    [fields]
  )
  const onDrop = useCallback<NonNullable<DataEditorProps["onDrop"]>>(
    (location, transfer) => {
      setFileDropHighlights([])
      if (!transfer || !onImportDroppedFiles) return
      const current = getCellContent(location)
      if (
        current.kind !== GridCellKind.Custom ||
        (current.data as { kind?: unknown }).kind !== "base-file-cell"
      ) {
        return
      }
      const files = Array.from(transfer.files)
      if (files.length === 0) return
      void onImportDroppedFiles(files)
        .then((imported) => {
          if (imported.length === 0) return
          const fileCell = current as BaseFileCell
          const paths = [...fileCell.data.paths, ...imported]
          history.onCellEdited(location, {
            ...fileCell,
            copyData: encodeBaseFilePaths(paths) ?? "",
            data: {
              ...fileCell.data,
              paths,
              displayData: baseFileDisplayData(paths),
            },
          })
        })
        .catch((error) => onError?.(error))
    },
    [getCellContent, history.onCellEdited, onError, onImportDroppedFiles]
  )

  useEffect(() => {
    history.reset()
  }, [history.reset, reloadToken, table.table.id])

  const onCellsEdited = useCallback<
    NonNullable<DataEditorProps["onCellsEdited"]>
  >(
    (edits) => {
      edits.forEach((edit) => history.onCellEdited(edit.location, edit.value))
      return true
    },
    [history.onCellEdited]
  )

  const onColumnResize = useCallback(
    (column: GridColumn, _newSize: number, _index: number, newSize: number) => {
      const id = typeof column.id === "string" ? column.id : column.title
      setWidths((current) => {
        const next = { ...current, [id]: newSize }
        if (view && onViewUpdate) {
          if (widthSaveTimerRef.current) {
            clearTimeout(widthSaveTimerRef.current)
          }
          widthSaveTimerRef.current = setTimeout(() => {
            void onViewUpdate({
              properties: {
                ...(view.properties ?? {}),
                fieldWidthMap: next,
              },
            })
          }, 400)
        }
        return next
      })
    },
    [onViewUpdate, view]
  )

  const onColumnMoved = useCallback(
    (from: number, to: number) => {
      setFields((current) => {
        const next = [...current]
        const [moved] = next.splice(from, 1)
        if (!moved) return current
        next.splice(to, 0, moved)
        if (view && onViewUpdate) {
          void onViewUpdate({
            orderMap: Object.fromEntries(
              next.map((field, index) => [field.tableColumnName, index])
            ),
          })
        }
        return next
      })
    },
    [onViewUpdate, view]
  )

  const onHeaderClicked = useCallback(
    (columnIndex: number, event: HeaderClickedEventArgs) => {
      const field = fields[columnIndex]
      if (!field) return
      event.preventDefault()
      setFieldMenu({ field, bounds: event.bounds })
    },
    [fields]
  )

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full overflow-hidden"
    >
      <DataEditor
        {...defaultConfig}
        ref={gridRef}
        theme={theme}
        columns={columns}
        rows={rowCount}
        getCellContent={getCellContent}
        onVisibleRegionChanged={onVisibleRegionChanged}
        customRenderers={[
          RatingCell,
          SelectCell,
          MultiSelectCell,
          DatePickerCell,
          BaseFileCellRenderer,
        ]}
        onDragOverCell={onDragOverCell}
        onDragLeave={() => setFileDropHighlights([])}
        onDrop={onDrop}
        highlightRegions={fileDropHighlights}
        fillHandle={!disabled}
        gridSelection={history.gridSelection ?? undefined}
        onCellEdited={disabled ? undefined : history.onCellEdited}
        onCellsEdited={disabled ? undefined : onCellsEdited}
        onGridSelectionChange={history.onGridSelectionChange}
        onHeaderClicked={onHeaderClicked}
        onHeaderContextMenu={onHeaderClicked}
        onColumnResize={onColumnResize}
        onColumnMoved={onColumnMoved}
        onRowAppended={disabled ? undefined : appendRow}
        rightElement={
          !disabled && onAddField ? (
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full justify-start rounded-none px-2 text-muted-foreground"
              aria-label="Add field"
              title="New field"
              onClick={onAddField}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          ) : undefined
        }
        rightElementProps={{ fill: true }}
      />
      <Popover
        open={fieldMenu !== null}
        onOpenChange={(open) => {
          if (!open) setFieldMenu(null)
        }}
      >
        <PopoverAnchor asChild>
          <span
            className="pointer-events-none fixed h-px w-px"
            style={
              fieldMenu
                ? {
                    left: fieldMenu.bounds.x,
                    top: fieldMenu.bounds.y + fieldMenu.bounds.height,
                  }
                : undefined
            }
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={2}
          className="w-52 p-1"
        >
          {fieldMenu ? (
            <>
              <div className="px-2 py-1.5">
                <p className="truncate text-xs font-medium">
                  {fieldMenu.field.name}
                </p>
                <p className="text-[11px] capitalize text-muted-foreground">
                  {fieldMenu.field.type.replace("-", " ")}
                </p>
              </div>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent"
                onClick={() => {
                  onRenameField?.(fieldMenu.field)
                  setFieldMenu(null)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename field
              </button>
              {fieldMenu.field.type === "select" ||
              fieldMenu.field.type === "multi-select" ? (
                <button
                  type="button"
                  className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent"
                  onClick={() => {
                    onEditFieldOptions?.(fieldMenu.field)
                    setFieldMenu(null)
                  }}
                >
                  <ListRestart className="h-3.5 w-3.5" />
                  Edit options
                </button>
              ) : null}
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-destructive hover:bg-accent hover:text-destructive disabled:opacity-45"
                disabled={fieldMenu.field.tableColumnName === "title"}
                onClick={() => {
                  onDeleteField?.(fieldMenu.field)
                  setFieldMenu(null)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete field
              </button>
            </>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
