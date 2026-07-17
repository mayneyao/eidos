import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type {
  BaseColumnStatConfig,
  BaseColumnStatResult,
  BaseColumnStatType,
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
import {
  baseColumnStatLabel,
  baseColumnStatTypesForField,
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
  type Theme,
} from "@glideapps/glide-data-grid"
import { Plus } from "lucide-react"
import MultiSelectCell from "./cells/multi-select-cell"
import SelectCell from "./cells/select-cell"
import DatePickerCell from "./cells/date-picker-cell"
import RatingCell from "./cells/rating-cell"
import RangeCell from "./cells/range-cell"
import { defaultConfig, getScrollbarWidth } from "./grid-default-config"
import { type UndoRedoEdit, useUndoRedo } from "./use-undo-redo"
import { useBaseUI } from "./context"
import { useBaseGridTheme } from "./theme"
import { Button } from "./ui/primitives"

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
  BaseColumnStatMenu,
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
const MAX_CACHED_PAGES = 8
const MAX_UNDO_HISTORY_BATCHES = 50

function themeColorWithAlpha(color: string, alpha: number): string {
  const normalized = color.trim()
  if (!normalized) return "transparent"
  if (
    (normalized.startsWith("hsl(") || normalized.startsWith("rgb(")) &&
    normalized.endsWith(")")
  ) {
    const openParen = normalized.indexOf("(")
    const body = normalized.slice(openParen + 1, -1)
    if (!body.includes("/")) {
      return `${normalized.slice(0, openParen + 1)}${body} / ${alpha})`
    }
  }
  return `color-mix(in srgb, ${normalized} ${Math.round(alpha * 100)}%, transparent)`
}

export interface BaseGridProps {
  table: BaseTableSnapshot
  view?: BaseViewInfo
  gridTheme?: Partial<Theme>
  disabled?: boolean
  reloadToken?: number
  loadPage: (offset: number, limit: number) => Promise<BaseRowPage>
  loadColumnStats?: (
    configs: BaseColumnStatConfig[]
  ) => Promise<BaseColumnStatResult[]>
  onAddRow: () => Promise<BaseRowMutationResult>
  onCellEdit: (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => Promise<BaseRowMutationResult>
  onInspectorCellEdit?: (
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
  onOpenRecordInTab?: (row: BaseRow) => void
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

interface BaseGridPendingRowEdit {
  rowIndex: number
  previous: BaseRow
  changes: BaseRow
  fields: Map<string, BaseFieldInfo>
  revision: number
}

interface BaseGridMutation {
  rowEdits: BaseGridPendingRowEdit[]
  editedCellCount: number
}

interface BaseGridFailedMutation extends BaseGridMutation {
  message: string
}

function gridMutationErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Unable to save the Grid change"
  return /[.!?]$/.test(message) ? message : `${message}.`
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

function viewColumnStats(
  view: BaseViewInfo | undefined,
  fields: BaseFieldInfo[]
): BaseColumnStatConfig[] {
  const value = view?.properties?.columnStats
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return []
  }
  const record = value as Record<string, unknown>
  return fields.flatMap((field) => {
    const config = record[field.tableColumnName]
    if (
      typeof config !== "object" ||
      config === null ||
      typeof (config as { type?: unknown }).type !== "string"
    ) {
      return []
    }
    const type = (config as { type: BaseColumnStatType }).type
    return baseColumnStatTypesForField(field).includes(type)
      ? [{ columnName: field.tableColumnName, type }]
      : []
  })
}

function columnStatHint(
  result: BaseColumnStatResult,
  field: BaseFieldInfo
): string {
  const compactLabels: Partial<Record<BaseColumnStatType, string>> = {
    "percent-empty": "Empty",
    "percent-not-empty": "Not empty",
    "percent-checked": "Checked",
    "percent-unchecked": "Unchecked",
  }
  const label = compactLabels[result.type] ?? baseColumnStatLabel(result.type)
  if (result.value === null) return `${label}: —`
  if (typeof result.value === "string") return `${label}: ${result.value}`
  const isPercent = result.type.startsWith("percent-")
  const maximumFractionDigits =
    result.type === "average" || result.type === "range" || isPercent ? 2 : 12
  const value = new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(result.value)
  if (isPercent) return `${label}: ${value}%`
  if (result.type === "range") return `${label}: ${value} days`
  if (
    (result.type === "min" || result.type === "max") &&
    (field.type === "date" || field.type === "datetime")
  ) {
    return `${label}: ${value}`
  }
  return `${label}: ${value}`
}

export const BaseGrid = memo(function BaseGrid({
  table,
  view,
  gridTheme,
  disabled = false,
  reloadToken = 0,
  loadPage,
  loadColumnStats,
  onAddRow,
  onCellEdit,
  onInspectorCellEdit,
  onRowsEdit,
  onSelectedRowsChange,
  onRowCountChange,
  searchResultIndex = null,
  onImportFiles,
  onImportDroppedFiles,
  onOpenFile,
  onRevealFile,
  onOpenRecordInTab,
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
  const { themeName, resolveFilePreview } = useBaseUI()
  const defaultTheme = useBaseGridTheme(themeName)
  const theme = useMemo(
    () => ({ ...defaultTheme, ...gridTheme }),
    [defaultTheme, gridTheme]
  )
  const searchHighlightColor = themeColorWithAlpha(theme.accentColor, 0.14)
  const fileDropHighlightColor = themeColorWithAlpha(theme.accentColor, 0.18)
  const gridRef = useRef<DataEditorRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const widthSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowsRef = useRef(new Map<number, BaseRow>())
  const rowMutationRevisionRef = useRef(new Map<number, number>())
  const loadedPagesRef = useRef(new Set<number>())
  const loadingPagesRef = useRef(new Map<number, number>())
  const pageAccessRef = useRef(new Map<number, number>())
  const pageAccessClockRef = useRef(0)
  const visiblePagesRef = useRef(new Set<number>())
  const historyRowsRef = useRef<ReadonlySet<number>>(new Set())
  const generationRef = useRef(0)
  const [cacheRevision, setCacheRevision] = useState(0)
  const [rowCount, setRowCount] = useState(table.rowCount)
  const [fieldMenu, setFieldMenu] = useState<BaseFieldMenuState | null>(null)
  const [columnStatMenu, setColumnStatMenu] =
    useState<BaseFieldMenuState | null>(null)
  const [cellMenu, setCellMenu] = useState<BaseCellMenuState | null>(null)
  const [inspectedRowIndex, setInspectedRowIndex] = useState<number | null>(
    null
  )
  const inspectedRowIndexRef = useRef<number | null>(null)
  inspectedRowIndexRef.current = inspectedRowIndex
  const availableFields = useMemo(
    () => orderedBaseFields(table.fields, view),
    [table.fields, view?.hiddenFields, view?.orderMap]
  )
  const [fields, setFields] = useState(availableFields)
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    viewWidths(view)
  )
  const [hasHorizontalScroll, setHasHorizontalScroll] = useState(false)
  const [columnStatResults, setColumnStatResults] = useState<
    Record<string, BaseColumnStatResult>
  >({})
  const [columnStatRevision, setColumnStatRevision] = useState(0)
  const columnStatGenerationRef = useRef(0)
  const mutationInFlightRef = useRef(false)
  const queuedMutationsRef = useRef<BaseGridMutation[]>([])
  const runGridMutationRef = useRef<
    (mutation: BaseGridMutation) => Promise<void>
  >(async () => undefined)
  const [mutationInFlight, setMutationInFlight] = useState(false)
  const failedMutationRef = useRef<BaseGridFailedMutation | null>(null)
  const [failedMutation, setFailedMutation] =
    useState<BaseGridFailedMutation | null>(null)
  const updateFailedMutation = useCallback(
    (next: BaseGridFailedMutation | null) => {
      failedMutationRef.current = next
      setFailedMutation(next)
    },
    []
  )
  const gridWriteLocked = disabled || failedMutation !== null
  const freezeColumns = baseViewFreezeColumns(view, fields.length)
  const inspectedRow =
    inspectedRowIndex === null
      ? undefined
      : rowsRef.current.get(inspectedRowIndex)

  const touchPage = useCallback((pageIndex: number) => {
    pageAccessClockRef.current += 1
    pageAccessRef.current.set(pageIndex, pageAccessClockRef.current)
  }, [])

  const prunePageCache = useCallback((): boolean => {
    if (
      mutationInFlightRef.current ||
      failedMutationRef.current ||
      queuedMutationsRef.current.length > 0
    ) {
      return false
    }

    const protectedPages = new Set(visiblePagesRef.current)
    const inspectedIndex = inspectedRowIndexRef.current
    if (inspectedIndex !== null) {
      protectedPages.add(Math.floor(inspectedIndex / PAGE_SIZE))
    }
    for (const rowIndex of historyRowsRef.current) {
      protectedPages.add(Math.floor(rowIndex / PAGE_SIZE))
    }

    const candidates = [...loadedPagesRef.current]
      .filter((pageIndex) => !protectedPages.has(pageIndex))
      .sort(
        (left, right) =>
          (pageAccessRef.current.get(left) ?? 0) -
          (pageAccessRef.current.get(right) ?? 0)
      )
    let changed = false
    while (
      loadedPagesRef.current.size > MAX_CACHED_PAGES &&
      candidates.length > 0
    ) {
      const pageIndex = candidates.shift()
      if (pageIndex === undefined) break
      loadedPagesRef.current.delete(pageIndex)
      pageAccessRef.current.delete(pageIndex)
      const start = pageIndex * PAGE_SIZE
      for (let rowIndex = start; rowIndex < start + PAGE_SIZE; rowIndex += 1) {
        rowsRef.current.delete(rowIndex)
        rowMutationRevisionRef.current.delete(rowIndex)
      }
      changed = true
    }
    return changed
  }, [])

  const loadPageIndex = useCallback(
    async (pageIndex: number) => {
      if (pageIndex < 0 || loadingPagesRef.current.has(pageIndex)) return
      if (loadedPagesRef.current.has(pageIndex)) {
        touchPage(pageIndex)
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
        touchPage(pageIndex)
        prunePageCache()
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
    [loadPage, onError, onRowCountChange, prunePageCache, touchPage]
  )

  useEffect(() => {
    generationRef.current += 1
    rowsRef.current.clear()
    rowMutationRevisionRef.current.clear()
    loadedPagesRef.current.clear()
    loadingPagesRef.current.clear()
    pageAccessRef.current.clear()
    pageAccessClockRef.current = 0
    visiblePagesRef.current.clear()
    historyRowsRef.current = new Set()
    mutationInFlightRef.current = false
    queuedMutationsRef.current = []
    setMutationInFlight(false)
    updateFailedMutation(null)
    setRowCount(table.rowCount)
    onRowCountChange?.(null)
    setCacheRevision((current) => current + 1)
    onSelectedRowsChange?.([])
    setFieldMenu(null)
    setColumnStatMenu(null)
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
    updateFailedMutation,
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
      columnStatGenerationRef.current += 1
      if (widthSaveTimerRef.current) clearTimeout(widthSaveTimerRef.current)
    },
    []
  )

  const columnStatConfigs = useMemo(
    () => viewColumnStats(view, fields),
    [fields, view?.properties]
  )
  const columnStatConfigKey = JSON.stringify(columnStatConfigs)

  useEffect(() => {
    const generation = ++columnStatGenerationRef.current
    if (!loadColumnStats || columnStatConfigs.length === 0) {
      setColumnStatResults({})
      return
    }
    void loadColumnStats(columnStatConfigs)
      .then((results) => {
        if (generation !== columnStatGenerationRef.current) return
        setColumnStatResults(
          Object.fromEntries(
            results.map((result) => [result.columnName, result])
          )
        )
      })
      .catch((error) => {
        if (generation === columnStatGenerationRef.current) onError?.(error)
      })
  }, [
    columnStatConfigKey,
    columnStatRevision,
    loadColumnStats,
    onError,
    reloadToken,
    table.table.id,
  ])

  const refreshColumnStats = useCallback(
    () => setColumnStatRevision((current) => current + 1),
    []
  )

  const columns = useMemo(
    () =>
      fields.map((field) => {
        const column = baseGridColumn(field)
        const stat = columnStatResults[field.tableColumnName]
        const configured = columnStatConfigs.find(
          (config) => config.columnName === field.tableColumnName
        )
        return {
          ...column,
          width:
            widths[field.tableColumnName] ??
            ("width" in column ? column.width : 180),
          ...(stat && configured?.type === stat.type
            ? {
                trailingRowOptions: {
                  hint: columnStatHint(stat, field),
                },
              }
            : {}),
        }
      }),
    [columnStatConfigs, columnStatResults, fields, widths]
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
        gridWriteLocked,
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
            displayData: baseFileDisplayData(
              (cell as BaseFileCell).data.paths,
              resolveFilePreview
            ),
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
      fields,
      gridWriteLocked,
      onImportFiles,
      onOpenFile,
      onRevealFile,
      onSearchRelation,
      resolveFilePreview,
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
      const visiblePages = new Set<number>()
      visiblePagesRef.current = visiblePages
      for (let page = firstPage; page <= lastPage; page += 1) {
        visiblePages.add(page)
        touchPage(page)
        void loadPageIndex(page)
      }
      if (prunePageCache()) {
        setCacheRevision((current) => current + 1)
      }
    },
    [loadPageIndex, prunePageCache, rowCount, touchPage]
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

  const persistRowEdits = useCallback(
    async (
      rowEdits: BaseGridPendingRowEdit[],
      editedCellCount: number
    ): Promise<BaseRowsMutationResult> => {
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
    },
    [onCellEdit, onRowsEdit, rowCount, table.table.id]
  )

  const mergeGridMutations = useCallback(
    (mutations: BaseGridMutation[]): BaseGridMutation => {
      const merged = new Map<number, BaseGridPendingRowEdit>()
      for (const mutation of mutations) {
        for (const edit of mutation.rowEdits) {
          const current = merged.get(edit.rowIndex)
          if (!current) {
            merged.set(edit.rowIndex, {
              ...edit,
              fields: new Map(edit.fields),
            })
            continue
          }
          for (const [column, field] of edit.fields) {
            current.fields.set(column, field)
          }
        }
      }

      const rowEdits = [...merged.values()].flatMap((edit) => {
        const current = rowsRef.current.get(edit.rowIndex)
        if (!current) return []
        const changes = Object.fromEntries(
          [...edit.fields.keys()].flatMap((column) =>
            Object.is(edit.previous[column], current[column])
              ? []
              : [[column, current[column]]]
          )
        )
        if (Object.keys(changes).length === 0) return []
        return [
          {
            ...edit,
            changes,
            revision:
              rowMutationRevisionRef.current.get(edit.rowIndex) ??
              edit.revision,
          },
        ]
      })
      return {
        rowEdits,
        editedCellCount: rowEdits.reduce(
          (count, edit) => count + Object.keys(edit.changes).length,
          0
        ),
      }
    },
    []
  )

  const runGridMutation = useCallback(
    async (mutation: BaseGridMutation): Promise<void> => {
      if (mutationInFlightRef.current) {
        queuedMutationsRef.current.push(mutation)
        return
      }
      const generation = generationRef.current
      mutationInFlightRef.current = true
      setMutationInFlight(true)
      try {
        const result = await persistRowEdits(
          mutation.rowEdits,
          mutation.editedCellCount
        )
        if (generation !== generationRef.current) return
        const rowsById = new Map(
          result.rows.map((row) => [String(row._id), row])
        )
        let changed = false
        for (const edit of mutation.rowEdits) {
          const current = rowsRef.current.get(edit.rowIndex)
          const persisted = rowsById.get(String(edit.previous._id))
          if (
            persisted &&
            current &&
            String(current._id) === String(edit.previous._id) &&
            rowMutationRevisionRef.current.get(edit.rowIndex) === edit.revision
          ) {
            rowsRef.current.set(edit.rowIndex, persisted)
            changed = true
          }
        }
        setRowCount(result.rowCount)
        updateFailedMutation(null)
        if (changed) setCacheRevision((revision) => revision + 1)
        refreshColumnStats()
      } catch (error) {
        if (generation !== generationRef.current) return
        const queued = queuedMutationsRef.current.splice(0)
        const failed = mergeGridMutations([mutation, ...queued])
        if (failed.rowEdits.length > 0) {
          updateFailedMutation({
            ...failed,
            message: gridMutationErrorMessage(error),
          })
        }
      } finally {
        if (generation === generationRef.current) {
          mutationInFlightRef.current = false
          setMutationInFlight(false)
          if (!failedMutationRef.current) {
            const next = queuedMutationsRef.current.shift()
            if (next) void runGridMutationRef.current(next)
          }
          if (prunePageCache()) {
            setCacheRevision((revision) => revision + 1)
          }
        }
      }
    },
    [
      mergeGridMutations,
      persistRowEdits,
      prunePageCache,
      refreshColumnStats,
      updateFailedMutation,
    ]
  )
  runGridMutationRef.current = runGridMutation

  const enqueueGridMutation = useCallback((mutation: BaseGridMutation) => {
    if (mutationInFlightRef.current) {
      queuedMutationsRef.current.push(mutation)
      return
    }
    void runGridMutationRef.current(mutation)
  }, [])

  const commitCells = useCallback(
    (edits: readonly UndoRedoEdit[]) => {
      if (disabled || failedMutationRef.current) {
        return
      }
      const grouped = new Map<number, BaseGridPendingRowEdit>()
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
      enqueueGridMutation({ rowEdits, editedCellCount })
    },
    [disabled, enqueueGridMutation, fields]
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
        const result = await (onInspectorCellEdit ?? onCellEdit)(
          previous,
          field,
          value
        )
        rowsRef.current.set(inspectedRowIndex, result.row)
        setRowCount(result.rowCount)
        setCacheRevision((current) => current + 1)
        refreshColumnStats()
        return result
      } catch (error) {
        rowsRef.current.set(inspectedRowIndex, previous)
        setCacheRevision((current) => current + 1)
        throw error
      }
    },
    [inspectedRowIndex, onCellEdit, onInspectorCellEdit, refreshColumnStats]
  )

  const appendRow = useCallback(async () => {
    try {
      const result = await onAddRow()
      const index = Math.max(0, result.rowCount - 1)
      rowsRef.current.set(index, result.row)
      setRowCount(result.rowCount)
      setCacheRevision((current) => current + 1)
      refreshColumnStats()
      return "bottom" as const
    } catch (error) {
      onError?.(error)
      return undefined
    }
  }, [onAddRow, onError, refreshColumnStats])

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
    commitCells,
    MAX_UNDO_HISTORY_BATCHES
  )
  historyRowsRef.current = history.historyRows

  useEffect(() => {
    history.reset()
  }, [history.reset, reloadToken, table.table.id, view?.id])

  useEffect(() => {
    if (prunePageCache()) {
      setCacheRevision((current) => current + 1)
    }
  }, [history.historyRows, inspectedRowIndex, prunePageCache])

  const retryFailedMutation = useCallback(() => {
    const failed = failedMutationRef.current
    if (!failed || mutationInFlightRef.current) return
    void runGridMutation({
      rowEdits: failed.rowEdits,
      editedCellCount: failed.editedCellCount,
    })
  }, [runGridMutation])

  const discardFailedMutation = useCallback(() => {
    const failed = failedMutationRef.current
    if (!failed || mutationInFlightRef.current) return
    let changed = false
    for (const edit of failed.rowEdits) {
      if (rowMutationRevisionRef.current.get(edit.rowIndex) === edit.revision) {
        rowsRef.current.set(edit.rowIndex, edit.previous)
        changed = true
      }
    }
    updateFailedMutation(null)
    history.reset()
    const pruned = prunePageCache()
    if (changed || pruned) setCacheRevision((revision) => revision + 1)
  }, [history.reset, prunePageCache, updateFailedMutation])

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
              color: searchHighlightColor,
              range: {
                x: 0,
                y: searchResultIndex,
                width: Math.max(1, columns.length),
                height: 1,
              },
            },
          ]
        : [],
    [columns.length, rowCount, searchHighlightColor, searchResultIndex]
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
                color: fileDropHighlightColor,
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
    [fields, fileDropHighlightColor]
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
              displayData: baseFileDisplayData(paths, resolveFilePreview),
            },
          })
        })
        .catch((error) => onError?.(error))
    },
    [
      getCellContent,
      history.onCellEdited,
      onError,
      onImportDroppedFiles,
      resolveFilePreview,
    ]
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
      setColumnStatMenu(null)
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
      setColumnStatMenu(null)
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

  const updateColumnStat = useCallback(
    (field: BaseFieldInfo, type: BaseColumnStatType | null) => {
      const stored = view?.properties?.columnStats
      const current =
        typeof stored === "object" && stored !== null && !Array.isArray(stored)
          ? { ...(stored as Record<string, unknown>) }
          : {}
      if (type) current[field.tableColumnName] = { type }
      else delete current[field.tableColumnName]
      updateView({
        properties: {
          ...(view?.properties ?? {}),
          columnStats: current,
        },
      })
    },
    [updateView, view?.properties]
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
  const fieldStatType = fieldMenu
    ? columnStatConfigs.find(
        (config) => config.columnName === fieldMenu.field.tableColumnName
      )?.type
    : undefined
  const columnStatMenuValue = columnStatMenu
    ? columnStatConfigs.find(
        (config) => config.columnName === columnStatMenu.field.tableColumnName
      )?.type
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
      className="base-detail-layout flex h-full min-h-0 w-full overflow-hidden"
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
          fillHandle={!gridWriteLocked}
          gridSelection={history.gridSelection ?? undefined}
          onCellEdited={gridWriteLocked ? undefined : history.onCellEdited}
          onCellsEdited={gridWriteLocked ? undefined : onCellsEdited}
          onGridSelectionChange={history.onGridSelectionChange}
          onHeaderClicked={onHeaderClicked}
          onHeaderContextMenu={onHeaderClicked}
          onCellContextMenu={onCellContextMenu}
          onColumnResize={onColumnResize}
          onColumnMoved={onColumnMoved}
          onRowAppended={gridWriteLocked ? undefined : appendRow}
          rightElement={
            !gridWriteLocked && onAddField ? (
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
        {failedMutation ? (
          <div
            className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center"
            role="alert"
            data-base-grid-write-recovery
          >
            <div className="pointer-events-auto flex max-w-xl items-start gap-3 border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-destructive">
                  {failedMutation.editedCellCount === 1
                    ? "Could not save this Grid change"
                    : `Could not save ${failedMutation.editedCellCount} Grid changes`}
                </p>
                <p className="mt-0.5 break-words leading-4 text-muted-foreground">
                  {failedMutation.message}{" "}
                  {failedMutation.editedCellCount === 1
                    ? "Your change is preserved in the grid."
                    : `${failedMutation.editedCellCount} changes are preserved in the grid.`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  disabled={mutationInFlight}
                  onClick={retryFailedMutation}
                >
                  {mutationInFlight ? "Retrying…" : "Retry"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-muted-foreground"
                  disabled={mutationInFlight}
                  onClick={discardFailedMutation}
                >
                  {failedMutation.editedCellCount === 1
                    ? "Discard change"
                    : "Discard changes"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        <BaseFieldMenu
          state={fieldMenu}
          open={fieldMenu !== null}
          sortDirection={fieldSortDirection}
          frozen={fieldMenu !== null && fieldMenu.fieldIndex < freezeColumns}
          canUpdateView={!gridWriteLocked && Boolean(view && onViewUpdate)}
          canEditStructure={!gridWriteLocked}
          statType={fieldStatType}
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
          onCalculate={setColumnStatMenu}
          onDelete={(field) => onDeleteField?.(field)}
        />
        <BaseColumnStatMenu
          state={columnStatMenu}
          open={columnStatMenu !== null}
          value={columnStatMenuValue}
          disabled={gridWriteLocked || !view || !onViewUpdate}
          onOpenChange={(open) => {
            if (!open) setColumnStatMenu(null)
          }}
          onBack={() => {
            const state = columnStatMenu
            setColumnStatMenu(null)
            if (state) setFieldMenu(state)
          }}
          onChange={(type) => {
            if (columnStatMenu) updateColumnStat(columnStatMenu.field, type)
          }}
        />
        <BaseCellMenu
          state={cellMenu}
          open={cellMenu !== null}
          selectionCount={cellMenu ? rowRangeCount(cellMenu.rowRanges) : 0}
          cellText={cellIsEmpty ? "" : cellText}
          filePaths={cellFilePaths}
          canDelete={!gridWriteLocked && Boolean(onRequestDeleteRows)}
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
          disabled={gridWriteLocked}
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
          onOpenInTab={onOpenRecordInTab}
          onCopyRecordId={copyText}
          onCellEdit={editInspectedRecord}
          disabled={gridWriteLocked}
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
})
