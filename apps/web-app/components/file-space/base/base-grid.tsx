import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowMutationResult,
  BaseRowsMutationResult,
  BaseRowPage,
  BaseRowRange,
  BaseRelationValue,
  BaseSqlPrimitive,
  BaseTableSnapshot,
  BaseViewInfo,
  UpdateBaseFieldInput,
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
import { Plus } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

import { useCurrentTheme } from "@/apps/web-app/hooks/use-current-theme"
import MultiSelectCell from "@/components/table/views/grid/cells/multi-select-cell"
import SelectCell from "@/components/table/views/grid/cells/select-cell"
import DatePickerCell from "@/components/table/views/grid/cells/date-picker-cell"
import RatingCell from "@/components/table/views/grid/cells/rating-cell"
import RangeCell from "@/components/table/views/grid/cells/range-cell"
import {
  defaultConfig,
  getScrollbarWidth,
} from "@/components/table/views/grid/grid-default-config"
import {
  type UndoRedoEdit,
  useUndoRedo,
} from "@/components/table/views/grid/hooks/use-undo-redo"
import { useDynamicTheme } from "@/components/table/views/grid/theme"
import { Button } from "@/components/ui/button"

import {
  baseGridColumn,
  baseValueToGridCell,
  gridCellToBaseValue,
} from "./base-grid-adapter"
import {
  baseFileDisplayData,
  BaseFileCellRenderer,
  type BaseFileCell,
} from "./base-file-cell"
import {
  BaseRelationCellRenderer,
  type BaseRelationCell,
} from "./base-relation-cell"
import { BaseFieldPropertyPanel } from "./base-field-property-panel"
import { decodeBaseFilePaths, encodeBaseFilePaths } from "@eidos.space/base"

import {
  BaseCellMenu,
  BaseFieldMenu,
  type BaseCellMenuState,
  type BaseFieldMenuState,
} from "./base-grid-menus"
import { BaseRecordInspector } from "./base-record-inspector"
import { baseRecordFieldText } from "./base-record-format"
import { baseGridScrollbarConfig } from "./base-grid-scrollbar"
import {
  baseViewFreezeColumns,
  contextRowRanges,
  nextBaseFieldSorts,
  orderedBaseFields,
  rowRangeCount,
  rowSelectionRanges,
} from "./base-view-layout"

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
  onRowsEdit?: (edits: BaseGridRowEdit[]) => Promise<BaseRowsMutationResult>
  onSelectedRowsChange?: (ranges: BaseRowRange[]) => void
  onRowCountChange?: (rowCount: number | null) => void
  searchResultIndex?: number | null
  onImportFiles?: () => Promise<string[]>
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => Promise<void> | void
  onSearchRelation?: (
    field: BaseFieldInfo,
    query: string
  ) => Promise<BaseRelationValue[]>
  propertyField?: BaseFieldInfo | null
  onPropertyFieldOpen?: (field: BaseFieldInfo) => void
  onPropertyFieldClose?: () => void
  onFieldUpdate?: (
    field: BaseFieldInfo,
    changes: UpdateBaseFieldInput
  ) => Promise<void> | void
  onAddField?: (position?: number) => void
  onEditFormula?: (field: BaseFieldInfo) => void
  onEditLookup?: (field: BaseFieldInfo) => void
  onDeleteField?: (field: BaseFieldInfo) => void
  onRequestDeleteRows?: (ranges: BaseRowRange[]) => void
  onViewUpdate?: (changes: UpdateBaseViewInput) => Promise<void> | void
  onError?: (error: unknown) => void
}

export interface BaseGridRowEdit {
  row: BaseRow
  changes: BaseRow
}

function sameFields(left: BaseFieldInfo[], right: BaseFieldInfo[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (field, index) =>
        field.tableColumnName === right[index]?.tableColumnName &&
        field.name === right[index]?.name &&
        field.type === right[index]?.type &&
        field.valueKind === right[index]?.valueKind &&
        field.isHidden === right[index]?.isHidden &&
        JSON.stringify(field.property) ===
          JSON.stringify(right[index]?.property)
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

export function BaseGrid({
  table,
  view,
  disabled = false,
  reloadToken = 0,
  loadPage,
  onAddRow,
  onCellEdit,
  onRowsEdit,
  onSelectedRowsChange,
  onRowCountChange,
  searchResultIndex = null,
  onImportFiles,
  onImportDroppedFiles,
  onOpenFile,
  onRevealFile,
  onSearchRelation,
  propertyField,
  onPropertyFieldOpen,
  onPropertyFieldClose,
  onFieldUpdate,
  onAddField,
  onEditFormula,
  onEditLookup,
  onDeleteField,
  onRequestDeleteRows,
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
  const rowMutationRevisionRef = useRef(new Map<number, number>())
  const loadedPagesRef = useRef(new Set<number>())
  const loadingPagesRef = useRef(new Map<number, number>())
  const generationRef = useRef(0)
  const [cacheRevision, setCacheRevision] = useState(0)
  const [rowCount, setRowCount] = useState(table.rowCount)
  const [fieldMenu, setFieldMenu] = useState<BaseFieldMenuState | null>(null)
  const [cellMenu, setCellMenu] = useState<BaseCellMenuState | null>(null)
  const [inspectedRowIndex, setInspectedRowIndex] = useState<number | null>(
    null
  )
  const availableFields = useMemo(
    () => orderedBaseFields(table.fields, view),
    [table.fields, view?.hiddenFields, view?.orderMap]
  )
  const [fields, setFields] = useState(availableFields)
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    viewWidths(view)
  )
  const [hasHorizontalScroll, setHasHorizontalScroll] = useState(false)
  const freezeColumns = baseViewFreezeColumns(view, fields.length)
  const inspectedRow =
    inspectedRowIndex === null
      ? undefined
      : rowsRef.current.get(inspectedRowIndex)

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
    rowMutationRevisionRef.current.clear()
    loadedPagesRef.current.clear()
    loadingPagesRef.current.clear()
    setRowCount(table.rowCount)
    onRowCountChange?.(null)
    setCacheRevision((current) => current + 1)
    onSelectedRowsChange?.([])
    setFieldMenu(null)
    setCellMenu(null)
    setInspectedRowIndex(null)
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
  const gridConfig = useMemo(
    () => ({
      ...defaultConfig,
      ...baseGridScrollbarConfig(hasHorizontalScroll, getScrollbarWidth()),
    }),
    [hasHorizontalScroll]
  )

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const scrollInner =
        container.querySelector<HTMLElement>(".dvn-scroll-inner")
      const next = Boolean(
        scrollInner && scrollInner.scrollWidth > scrollInner.clientWidth
      )
      setHasHorizontalScroll((current) => (current === next ? current : next))
    }
    measure()

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    resizeObserver?.observe(container)

    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(measure)
    mutationObserver?.observe(container, { childList: true, subtree: true })

    return () => {
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
    }
  }, [columns])

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
        disabled,
        row
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
      if (
        cell.kind === GridCellKind.Custom &&
        (cell.data as { kind?: unknown }).kind === "base-relation-cell"
      ) {
        return {
          ...cell,
          data: {
            ...cell.data,
            onSearch: onSearchRelation
              ? (query: string) => onSearchRelation(field, query)
              : undefined,
          },
        } as BaseRelationCell
      }
      return cell
    },
    [
      cacheRevision,
      disabled,
      fields,
      onImportFiles,
      onOpenFile,
      onRevealFile,
      onSearchRelation,
    ]
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

  useEffect(() => {
    if (
      searchResultIndex === null ||
      searchResultIndex < 0 ||
      searchResultIndex >= rowCount
    ) {
      return
    }
    requestVisiblePages({
      x: 0,
      y: searchResultIndex,
      width: Math.max(1, columns.length),
      height: 1,
    })
    gridRef.current?.scrollTo(0, searchResultIndex, "vertical", 0, 24, {
      vAlign: "center",
    })
  }, [columns.length, requestVisiblePages, rowCount, searchResultIndex])

  const commitCells = useCallback(
    (edits: readonly UndoRedoEdit[]) => {
      if (disabled) return
      const grouped = new Map<
        number,
        {
          rowIndex: number
          previous: BaseRow
          changes: BaseRow
          fields: Map<string, BaseFieldInfo>
          revision: number
        }
      >()
      for (const {
        cell: [columnIndex, rowIndex],
        newValue,
      } of edits) {
        const field = fields[columnIndex]
        const row = rowsRef.current.get(rowIndex)
        if (!field || !row) continue
        const nextValue = gridCellToBaseValue(field, newValue)
        const group = grouped.get(rowIndex) ?? {
          rowIndex,
          previous: row,
          changes: {},
          fields: new Map<string, BaseFieldInfo>(),
          revision: 0,
        }
        group.changes[field.tableColumnName] = nextValue
        group.fields.set(field.tableColumnName, field)
        grouped.set(rowIndex, group)
      }

      const rowEdits = [...grouped.values()].flatMap((group) => {
        const changes = Object.fromEntries(
          Object.entries(group.changes).filter(
            ([column, value]) => !Object.is(group.previous[column], value)
          )
        )
        if (Object.keys(changes).length === 0) return []
        const revision =
          (rowMutationRevisionRef.current.get(group.rowIndex) ?? 0) + 1
        rowMutationRevisionRef.current.set(group.rowIndex, revision)
        rowsRef.current.set(group.rowIndex, {
          ...group.previous,
          ...changes,
        })
        return [{ ...group, changes, revision }]
      })
      if (rowEdits.length === 0) return

      setCacheRevision((current) => current + 1)
      const editedCellCount = rowEdits.reduce(
        (count, edit) => count + Object.keys(edit.changes).length,
        0
      )
      const persist = async (): Promise<BaseRowsMutationResult> => {
        if (onRowsEdit && editedCellCount > 1) {
          return onRowsEdit(
            rowEdits.map(({ previous, changes }) => ({
              row: previous,
              changes,
            }))
          )
        }

        let nextRowCount = rowCount
        const rows: BaseRow[] = []
        for (const edit of rowEdits) {
          let latest = edit.previous
          for (const [column, value] of Object.entries(edit.changes)) {
            const field = edit.fields.get(column)
            if (!field) continue
            const result = await onCellEdit(
              latest,
              field,
              value as BaseSqlPrimitive
            )
            latest = result.row
            nextRowCount = result.rowCount
          }
          rows.push(latest)
        }
        return { tableId: table.table.id, rows, rowCount: nextRowCount }
      }
      const generation = generationRef.current
      void persist()
        .then((result) => {
          if (generation !== generationRef.current) return
          const rowsById = new Map(
            result.rows.map((row) => [String(row._id), row])
          )
          let changed = false
          for (const edit of rowEdits) {
            const current = rowsRef.current.get(edit.rowIndex)
            const persisted = rowsById.get(String(edit.previous._id))
            if (
              persisted &&
              current &&
              String(current._id) === String(edit.previous._id) &&
              rowMutationRevisionRef.current.get(edit.rowIndex) ===
                edit.revision
            ) {
              rowsRef.current.set(edit.rowIndex, persisted)
              changed = true
            }
          }
          setRowCount(result.rowCount)
          if (changed) setCacheRevision((revision) => revision + 1)
        })
        .catch((error) => {
          if (generation === generationRef.current) {
            let changed = false
            for (const edit of rowEdits) {
              if (
                rowMutationRevisionRef.current.get(edit.rowIndex) ===
                edit.revision
              ) {
                rowsRef.current.set(edit.rowIndex, edit.previous)
                changed = true
              }
            }
            if (changed) setCacheRevision((revision) => revision + 1)
          }
          onError?.(error)
        })
    },
    [
      disabled,
      fields,
      onCellEdit,
      onError,
      onRowsEdit,
      rowCount,
      table.table.id,
    ]
  )

  const commitCell = useCallback(
    (location: Item, nextCell: EditableGridCell) => {
      commitCells([{ cell: location, newValue: nextCell }])
    },
    [commitCells]
  )

  const editInspectedRecord = useCallback(
    async (row: BaseRow, field: BaseFieldInfo, value: BaseSqlPrimitive) => {
      if (inspectedRowIndex === null) {
        throw new Error("No inspected Base row")
      }
      const previous = rowsRef.current.get(inspectedRowIndex) ?? row
      rowsRef.current.set(inspectedRowIndex, {
        ...previous,
        [field.tableColumnName]: value,
      })
      setCacheRevision((current) => current + 1)
      try {
        const result = await onCellEdit(previous, field, value)
        rowsRef.current.set(inspectedRowIndex, result.row)
        setRowCount(result.rowCount)
        setCacheRevision((current) => current + 1)
        return result
      } catch (error) {
        rowsRef.current.set(inspectedRowIndex, previous)
        setCacheRevision((current) => current + 1)
        throw error
      }
    },
    [inspectedRowIndex, onCellEdit]
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
    isGridActive,
    commitCells
  )

  const [fileDropHighlights, setFileDropHighlights] = useState<
    NonNullable<DataEditorProps["highlightRegions"]>
  >([])
  const searchHighlightRegions = useMemo<
    NonNullable<DataEditorProps["highlightRegions"]>
  >(
    () =>
      searchResultIndex !== null &&
      searchResultIndex >= 0 &&
      searchResultIndex < rowCount
        ? [
            {
              color: "rgba(245, 194, 66, 0.24)",
              range: {
                x: 0,
                y: searchResultIndex,
                width: Math.max(1, columns.length),
                height: 1,
              },
            },
          ]
        : [],
    [columns.length, rowCount, searchResultIndex]
  )
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
      history.onCellsEdited(
        edits.map((edit) => ({
          cell: edit.location,
          newValue: edit.value,
        }))
      )
      return true
    },
    [history.onCellsEdited]
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
      setCellMenu(null)
      setFieldMenu({ field, fieldIndex: columnIndex, bounds: event.bounds })
    },
    [fields]
  )

  const onCellContextMenu = useCallback<
    NonNullable<DataEditorProps["onCellContextMenu"]>
  >(
    ([fieldIndex, rowIndex], event) => {
      const field = fields[fieldIndex]
      const row = rowsRef.current.get(rowIndex)
      if (!field || !row) return
      event.preventDefault()
      setFieldMenu(null)
      setCellMenu({
        bounds: event.bounds,
        field,
        fieldIndex,
        point: {
          x:
            event.bounds.x +
            Math.min(event.bounds.width, Math.max(0, event.localEventX)),
          y:
            event.bounds.y +
            Math.min(event.bounds.height, Math.max(0, event.localEventY)),
        },
        row,
        rowIndex,
        rowRanges: contextRowRanges(
          history.gridSelection ?? undefined,
          rowIndex
        ),
      })
    },
    [fields, history.gridSelection]
  )

  const updateView = useCallback(
    (changes: UpdateBaseViewInput) => {
      if (!onViewUpdate) return
      void Promise.resolve(onViewUpdate(changes)).catch((error) =>
        onError?.(error)
      )
    },
    [onError, onViewUpdate]
  )

  const copyText = useCallback(
    (value: string) => {
      if (!value) return
      if (!navigator.clipboard) {
        onError?.(new Error("Clipboard access is unavailable"))
        return
      }
      void navigator.clipboard
        .writeText(value)
        .catch((error) => onError?.(error))
    },
    [onError]
  )

  const fieldSortDirection = fieldMenu
    ? view?.sorts.find((sort) => sort.field === fieldMenu.field.tableColumnName)
        ?.direction
    : undefined
  const cellText = cellMenu
    ? baseRecordFieldText(cellMenu.row, cellMenu.field)
    : ""
  const cellIsEmpty =
    !cellMenu ||
    cellMenu.row[cellMenu.field.tableColumnName] === null ||
    cellMenu.row[cellMenu.field.tableColumnName] === undefined ||
    cellMenu.row[cellMenu.field.tableColumnName] === ""
  const cellFilePaths =
    cellMenu?.field.type === "file"
      ? decodeBaseFilePaths(cellMenu.row[cellMenu.field.tableColumnName])
      : []

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 w-full overflow-hidden"
    >
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <DataEditor
          {...gridConfig}
          ref={gridRef}
          theme={theme}
          columns={columns}
          rows={rowCount}
          freezeColumns={freezeColumns}
          getCellContent={getCellContent}
          onVisibleRegionChanged={onVisibleRegionChanged}
          customRenderers={[
            RatingCell,
            RangeCell,
            SelectCell,
            MultiSelectCell,
            DatePickerCell,
            BaseFileCellRenderer,
            BaseRelationCellRenderer,
          ]}
          onDragOverCell={onDragOverCell}
          onDragLeave={() => setFileDropHighlights([])}
          onDrop={onDrop}
          highlightRegions={[...searchHighlightRegions, ...fileDropHighlights]}
          fillHandle={!disabled}
          gridSelection={history.gridSelection ?? undefined}
          onCellEdited={disabled ? undefined : history.onCellEdited}
          onCellsEdited={disabled ? undefined : onCellsEdited}
          onGridSelectionChange={history.onGridSelectionChange}
          onHeaderClicked={onHeaderClicked}
          onHeaderContextMenu={onHeaderClicked}
          onCellContextMenu={onCellContextMenu}
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
                onClick={() => onAddField()}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            ) : undefined
          }
          rightElementProps={{ fill: true }}
        />
        <BaseFieldMenu
          state={fieldMenu}
          open={fieldMenu !== null}
          sortDirection={fieldSortDirection}
          frozen={fieldMenu !== null && fieldMenu.fieldIndex < freezeColumns}
          canUpdateView={!disabled && Boolean(view && onViewUpdate)}
          canEditStructure={!disabled}
          onOpenChange={(open) => {
            if (!open) setFieldMenu(null)
          }}
          onEditProperty={
            onPropertyFieldOpen
              ? (field) => {
                  setInspectedRowIndex(null)
                  onPropertyFieldOpen(field)
                }
              : undefined
          }
          onSort={(field, direction) =>
            updateView({
              sorts: nextBaseFieldSorts(
                view?.sorts ?? [],
                field.tableColumnName,
                direction
              ),
            })
          }
          onInsert={(index) => onAddField?.(index)}
          onToggleFreeze={(fieldIndex, frozen) =>
            updateView({
              properties: {
                ...(view?.properties ?? {}),
                freezeColumns: frozen ? 0 : fieldIndex + 1,
              },
            })
          }
          onDelete={(field) => onDeleteField?.(field)}
        />
        <BaseCellMenu
          state={cellMenu}
          open={cellMenu !== null}
          selectionCount={cellMenu ? rowRangeCount(cellMenu.rowRanges) : 0}
          cellText={cellIsEmpty ? "" : cellText}
          filePaths={cellFilePaths}
          canDelete={!disabled && Boolean(onRequestDeleteRows)}
          onOpenChange={(open) => {
            if (!open) setCellMenu(null)
          }}
          onOpenRecord={(state) => {
            onPropertyFieldClose?.()
            setInspectedRowIndex(state.rowIndex)
          }}
          onCopyCell={copyText}
          onCopyRecordId={copyText}
          onOpenUrl={(url) => window.open(url, "_blank", "noopener,noreferrer")}
          onOpenFile={onOpenFile}
          onRevealFile={
            onRevealFile
              ? (path) => {
                  void Promise.resolve(onRevealFile(path)).catch((error) =>
                    onError?.(error)
                  )
                }
              : undefined
          }
          onDeleteRows={(ranges) => onRequestDeleteRows?.(ranges)}
        />
      </div>
      {propertyField &&
      onPropertyFieldClose &&
      onFieldUpdate &&
      onDeleteField ? (
        <BaseFieldPropertyPanel
          field={propertyField}
          disabled={disabled}
          onClose={onPropertyFieldClose}
          onUpdate={onFieldUpdate}
          onDelete={onDeleteField}
          onEditFormula={onEditFormula}
          onEditLookup={onEditLookup}
        />
      ) : inspectedRow ? (
        <BaseRecordInspector
          row={inspectedRow}
          fields={fields}
          onClose={() => setInspectedRowIndex(null)}
          onCopyRecordId={copyText}
          onCellEdit={editInspectedRecord}
          disabled={disabled}
          onError={onError}
          onImportFiles={onImportFiles}
          onImportDroppedFiles={onImportDroppedFiles}
          onSearchRelation={onSearchRelation}
          onOpenFile={onOpenFile}
          onRevealFile={
            onRevealFile
              ? (path) => {
                  void Promise.resolve(onRevealFile(path)).catch((error) =>
                    onError?.(error)
                  )
                }
              : undefined
          }
        />
      ) : null}
    </div>
  )
}
