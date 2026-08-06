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
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileColumnStatType,
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRowsMutationResult,
  EidosFileRowPage,
  EidosFileRowRange,
  EidosFileRelationValue,
  EidosFileSqlPrimitive,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
  FileEntry,
  UpdateEidosFileFieldInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import {
  eidosFileColumnStatLabel,
  eidosFileColumnStatTypesForField,
} from "@eidos.space/eidos-file"
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
import { defaultConfig } from "./grid-default-config"
import { EIDOS_FILE_EMPTY_STAT_ICON } from "./header-icons"
import { type UndoRedoEdit, useUndoRedo } from "./use-undo-redo"
import { useEidosFileUI } from "./context"
import { useEidosFileGridThemeForElement } from "./theme-internal"
import { Button } from "./ui/primitives"
import { useGlideDataGridPortal } from "./use-glide-data-grid-portal"

import {
  eidosFileGridColumn,
  eidosFileValueToGridCell,
  gridCellToEidosFileValue,
  type EidosFileGridSelectOption,
} from "./eidos-file-grid-adapter"
import {
  EidosFileAttachmentCellRenderer,
  type EidosFileAttachmentCell,
} from "./eidos-file-attachment-cell"
import { EidosFileAttachmentThumbnailManager } from "./eidos-file-attachment-thumbnails"
import {
  EidosFileRelationCellRenderer,
  type EidosFileRelationCell,
} from "./eidos-file-relation-cell"
import { EidosFileFieldPropertyPanel } from "./eidos-file-field-property-panel"
import { encodeEidosFileValues } from "@eidos.space/eidos-file"

import {
  EidosFileCellMenu,
  EidosFileColumnStatMenu,
  EidosFileFieldMenu,
  type EidosFileCellMenuState,
  type EidosFileFieldMenuState,
} from "./eidos-file-grid-menus"
import { EidosFileRecordInspector } from "./eidos-file-record-inspector"
import { eidosFileFieldKey } from "./eidos-file-field-visibility"
import { eidosFileRecordFieldText } from "./eidos-file-record-format"
import { eidosFileGridScrollbarConfig } from "./eidos-file-grid-scrollbar"
import {
  eidosFileViewFreezeColumns,
  contextRowRanges,
  nextEidosFileFieldSorts,
  orderedEidosFileFields,
  rowRangeCount,
  rowSelectionRanges,
} from "./eidos-file-view-layout"

import "@glideapps/glide-data-grid/dist/index.css"

const PAGE_SIZE = 100
const PAGE_OVERSCAN = 1
const MAX_CACHED_PAGES = 8
const MAX_UNDO_HISTORY_BATCHES = 50

const EIDOS_FILE_GRID_CUSTOM_RENDERERS = [
  RatingCell,
  RangeCell,
  SelectCell,
  MultiSelectCell,
  DatePickerCell,
  EidosFileAttachmentCellRenderer,
  EidosFileRelationCellRenderer,
]

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
      if (body.includes(",")) {
        const functionName = normalized.startsWith("rgb(") ? "rgba" : "hsla"
        return `${functionName}(${body}, ${alpha})`
      }
      return `${normalized.slice(0, openParen + 1)}${body} / ${alpha})`
    }
  }
  return `color-mix(in srgb, ${normalized} ${Math.round(alpha * 100)}%, transparent)`
}

export interface EidosFileGridProps {
  table: EidosFileTableSnapshot
  tables?: readonly EidosFileTableSnapshot[]
  view?: EidosFileViewInfo
  gridTheme?: Partial<Theme>
  disabled?: boolean
  reloadToken?: number
  loadPage: (offset: number, limit: number) => Promise<EidosFileRowPage>
  loadColumnStats?: (
    configs: EidosFileColumnStatConfig[]
  ) => Promise<EidosFileColumnStatResult[]>
  onAddRow: () => Promise<EidosFileRowMutationResult>
  onCellEdit: (
    row: EidosFileRow,
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => Promise<EidosFileRowMutationResult>
  onInspectorCellEdit?: (
    row: EidosFileRow,
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => Promise<EidosFileRowMutationResult>
  onRowsEdit?: (
    edits: EidosFileGridRowEdit[]
  ) => Promise<EidosFileRowsMutationResult>
  onSelectedRowsChange?: (ranges: EidosFileRowRange[]) => void
  onRowCountChange?: (rowCount: number | null) => void
  searchResultIndex?: number | null
  onImportFiles?: () => Promise<FileEntry[]>
  onImportDroppedFiles?: (files: File[]) => Promise<FileEntry[]>
  onOpenRecordInTab?: (row: EidosFileRow) => void
  onSearchRelation?: (
    field: EidosFileFieldInfo,
    query: string
  ) => Promise<EidosFileRelationValue[]>
  propertyField?: EidosFileFieldInfo | null
  onPropertyFieldOpen?: (field: EidosFileFieldInfo) => void
  onPropertyFieldClose?: () => void
  onFieldUpdate?: (
    field: EidosFileFieldInfo,
    changes: UpdateEidosFileFieldInput
  ) => Promise<void> | void
  onAddField?: (position?: number) => void
  onEditFormula?: (field: EidosFileFieldInfo) => void
  onEditLookup?: (field: EidosFileFieldInfo) => void
  onDeleteField?: (field: EidosFileFieldInfo) => void
  onRequestDeleteRows?: (ranges: EidosFileRowRange[]) => void
  onViewUpdate?: (changes: UpdateEidosFileViewInput) => Promise<void> | void
  onError?: (error: unknown) => void
}

export interface EidosFileGridRowEdit {
  row: EidosFileRow
  changes: EidosFileRow
}

interface EidosFileGridPendingRowEdit {
  rowIndex: number
  previous: EidosFileRow
  changes: EidosFileRow
  fields: Map<string, EidosFileFieldInfo>
  revision: number
}

interface EidosFileGridMutation {
  rowEdits: EidosFileGridPendingRowEdit[]
  editedCellCount: number
}

interface EidosFileGridFailedMutation extends EidosFileGridMutation {
  message: string
}

interface EidosFileGridPageRequest {
  visiblePages: number[]
  prefetchPages: number[]
}

function gridMutationErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Unable to save the Grid change"
  return /[.!?]$/.test(message) ? message : `${message}.`
}

function selectOptionsProperty(
  field: EidosFileFieldInfo,
  options: readonly EidosFileGridSelectOption[]
): Record<string, unknown> {
  const existing = Array.isArray(field.property?.options)
    ? field.property.options
    : []
  const existingByName = new Map(
    existing.flatMap((entry) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        Array.isArray(entry) ||
        typeof (entry as { name?: unknown }).name !== "string"
      ) {
        return []
      }
      return [[(entry as { name: string }).name, entry] as const]
    })
  )
  return {
    ...(field.property ?? {}),
    options: options.map((option) => ({
      ...(existingByName.get(option.name) ?? {}),
      name: option.name,
      color: option.color,
    })),
  }
}

function sameFields(
  left: EidosFileFieldInfo[],
  right: EidosFileFieldInfo[]
): boolean {
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

function viewWidths(
  view: EidosFileViewInfo | undefined
): Record<string, number> {
  const value = view?.properties?.fieldWidths
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

function columnBaseWidth(column: GridColumn): number {
  return "width" in column && typeof column.width === "number"
    ? column.width
    : 180
}

function columnPixelWidth(stored: number | undefined, base: number): number {
  if (stored === undefined) return base
  // Values above the 1.0 relative-width range are accepted as legacy pixel
  // widths and normalized the next time the user resizes that column.
  return stored > 8 ? stored : base * Math.min(8, Math.max(0.25, stored))
}

function viewRowHeight(view: EidosFileViewInfo | undefined): number {
  if (view?.properties?.rowDensity === "compact") return 28
  if (view?.properties?.rowDensity === "comfortable") return 44
  return 36
}

function viewColumnStats(
  view: EidosFileViewInfo | undefined,
  fields: EidosFileFieldInfo[]
): EidosFileColumnStatConfig[] {
  const value = view?.properties?.columnStats
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return []
  }
  const record = value as Record<string, unknown>
  return fields.flatMap((field) => {
    const fieldId = eidosFileFieldKey(field)
    const config = record[fieldId]
    if (
      typeof config !== "object" ||
      config === null ||
      typeof (config as { type?: unknown }).type !== "string"
    ) {
      return []
    }
    const type = (config as { type: EidosFileColumnStatType }).type
    return eidosFileColumnStatTypesForField(field).includes(type)
      ? [{ fieldId, type }]
      : []
  })
}

function columnStatHint(
  result: EidosFileColumnStatResult,
  field: EidosFileFieldInfo
): string {
  const label = eidosFileColumnStatLabel(result.type)
  if (result.value === null) return `${label}: —`
  if (typeof result.value === "string") return `${label}: ${result.value}`
  const percentage =
    result.type === "percent-checked" || result.type === "percent-unchecked"
  const maximumFractionDigits = result.type === "average" || percentage ? 2 : 12
  const value = new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(result.value)
  if (
    (result.type === "min" || result.type === "max") &&
    (field.type === "date" || field.type === "datetime")
  ) {
    return `${label}: ${value}`
  }
  return `${label}: ${value}${percentage ? "%" : ""}`
}

export const EidosFileGrid = memo(function EidosFileGrid({
  table,
  tables,
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
}: EidosFileGridProps) {
  const {
    assetPresenter,
    assetSession,
    themeName,
    translate: t,
  } = useEidosFileUI()
  useGlideDataGridPortal(themeName)
  const containerRef = useRef<HTMLDivElement>(null)
  const defaultTheme = useEidosFileGridThemeForElement(themeName, containerRef)
  const theme = useMemo(
    () => ({ ...defaultTheme, ...gridTheme }),
    [defaultTheme, gridTheme]
  )
  const searchHighlightColor = themeColorWithAlpha(theme.accentColor, 0.14)
  const fileDropHighlightColor = themeColorWithAlpha(theme.accentColor, 0.18)
  const gridRef = useRef<DataEditorRef>(null)
  const attachmentThumbnails = useMemo(
    () =>
      new EidosFileAttachmentThumbnailManager(
        assetSession,
        assetPresenter,
        (cells) => gridRef.current?.updateCells(cells)
      ),
    [assetPresenter, assetSession]
  )
  const widthSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowsRef = useRef(new Map<number, EidosFileRow>())
  const rowMutationRevisionRef = useRef(new Map<number, number>())
  const loadedPagesRef = useRef(new Set<number>())
  const loadingPagesRef = useRef(new Map<number, number>())
  const pageAccessRef = useRef(new Map<number, number>())
  const pageAccessClockRef = useRef(0)
  const visiblePagesRef = useRef(new Set<number>())
  const latestPageRequestRef = useRef<EidosFileGridPageRequest | null>(null)
  const pageLoadRunnerActiveRef = useRef(false)
  const loadPageIndexRef = useRef<(pageIndex: number) => Promise<boolean>>(
    async () => false
  )
  const historyRowsRef = useRef<ReadonlySet<number>>(new Set())
  const generationRef = useRef(0)
  const dataScopeRef = useRef<string | null>(null)
  const thumbnailScopeRef = useRef<string | null>(null)
  const tableRowCountRef = useRef(table.rowCount)
  const onErrorRef = useRef(onError)
  const onRowCountChangeRef = useRef(onRowCountChange)
  const onSelectedRowsChangeRef = useRef(onSelectedRowsChange)
  tableRowCountRef.current = table.rowCount
  onErrorRef.current = onError
  onRowCountChangeRef.current = onRowCountChange
  onSelectedRowsChangeRef.current = onSelectedRowsChange
  const [cacheRevision, setCacheRevision] = useState(0)
  const [rowCount, setRowCount] = useState(table.rowCount)
  const [fieldMenu, setFieldMenu] = useState<EidosFileFieldMenuState | null>(
    null
  )
  const [columnStatMenu, setColumnStatMenu] =
    useState<EidosFileFieldMenuState | null>(null)
  const [cellMenu, setCellMenu] = useState<EidosFileCellMenuState | null>(null)
  const [inspectedRowIndex, setInspectedRowIndex] = useState<number | null>(
    null
  )
  const inspectedRowIndexRef = useRef<number | null>(null)
  inspectedRowIndexRef.current = inspectedRowIndex
  const availableFields = useMemo(
    () => orderedEidosFileFields(table.fields, view),
    [table.fields, view?.hiddenFields, view?.orderMap]
  )
  const [fields, setFields] = useState(availableFields)
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    viewWidths(view)
  )
  const [hasHorizontalScroll, setHasHorizontalScroll] = useState(false)
  const [columnStatResults, setColumnStatResults] = useState<
    Record<string, EidosFileColumnStatResult>
  >({})
  const [columnStatRevision, setColumnStatRevision] = useState(0)
  const columnStatGenerationRef = useRef(0)
  const mutationInFlightRef = useRef(false)
  const queuedMutationsRef = useRef<EidosFileGridMutation[]>([])
  const runGridMutationRef = useRef<
    (mutation: EidosFileGridMutation) => Promise<void>
  >(async () => undefined)
  const [mutationInFlight, setMutationInFlight] = useState(false)
  const failedMutationRef = useRef<EidosFileGridFailedMutation | null>(null)
  const [failedMutation, setFailedMutation] =
    useState<EidosFileGridFailedMutation | null>(null)
  const updateFailedMutation = useCallback(
    (next: EidosFileGridFailedMutation | null) => {
      failedMutationRef.current = next
      setFailedMutation(next)
    },
    []
  )
  const gridWriteLocked = disabled || failedMutation !== null
  const freezeColumns = eidosFileViewFreezeColumns(view, fields.length)
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
      if (pageIndex < 0) return false
      if (loadingPagesRef.current.has(pageIndex)) return true
      if (loadedPagesRef.current.has(pageIndex)) {
        touchPage(pageIndex)
        return true
      }
      const generation = generationRef.current
      loadingPagesRef.current.set(pageIndex, generation)
      try {
        const page = await loadPage(pageIndex * PAGE_SIZE, PAGE_SIZE)
        if (generation !== generationRef.current) return false
        page.rows.forEach((row, index) => {
          const rowIndex = page.offset + index
          // A refetched page may have been read before a pending optimistic
          // edit landed. Never clobber such rows: an open editor would reset
          // to the stale value mid-typing, and the mutation result reapplies
          // the authoritative row once the save completes.
          if (!rowMutationRevisionRef.current.has(rowIndex)) {
            rowsRef.current.set(rowIndex, row)
          }
        })
        loadedPagesRef.current.add(pageIndex)
        touchPage(pageIndex)
        prunePageCache()
        setRowCount(page.total)
        onRowCountChangeRef.current?.(page.total)
        setCacheRevision((current) => current + 1)
        return true
      } catch (error) {
        if (generation === generationRef.current) onErrorRef.current?.(error)
        return false
      } finally {
        if (loadingPagesRef.current.get(pageIndex) === generation) {
          loadingPagesRef.current.delete(pageIndex)
        }
      }
    },
    [loadPage, prunePageCache, touchPage]
  )
  loadPageIndexRef.current = loadPageIndex

  const scheduleLatestPageRequest = useCallback(
    (request: EidosFileGridPageRequest) => {
      latestPageRequestRef.current = request
      if (pageLoadRunnerActiveRef.current) return

      pageLoadRunnerActiveRef.current = true
      void (async () => {
        try {
          while (latestPageRequestRef.current) {
            const latest = latestPageRequestRef.current
            const pageIndex = [
              ...latest.visiblePages,
              ...latest.prefetchPages,
            ].find(
              (candidate) =>
                !loadedPagesRef.current.has(candidate) &&
                !loadingPagesRef.current.has(candidate)
            )
            if (pageIndex === undefined) {
              if (latestPageRequestRef.current === latest) {
                latestPageRequestRef.current = null
              }
              continue
            }

            const loaded = await loadPageIndexRef.current(pageIndex)
            if (!loaded && latestPageRequestRef.current === latest) {
              latestPageRequestRef.current = null
            }
          }
        } finally {
          pageLoadRunnerActiveRef.current = false
        }
      })()
    },
    []
  )

  useEffect(() => {
    const scope = `${table.table.id}:${view?.id ?? "default"}`
    const thumbnailScope = `${scope}:${reloadToken}`
    const preserveData = dataScopeRef.current === scope
    const pagesToRefresh = preserveData
      ? new Set([0, ...visiblePagesRef.current])
      : new Set([0])
    dataScopeRef.current = scope
    if (thumbnailScopeRef.current !== thumbnailScope) {
      thumbnailScopeRef.current = thumbnailScope
      attachmentThumbnails.clear()
    }
    generationRef.current += 1
    loadedPagesRef.current.clear()
    loadingPagesRef.current.clear()
    pageAccessRef.current.clear()
    pageAccessClockRef.current = 0
    latestPageRequestRef.current = null
    if (!preserveData) {
      rowsRef.current.clear()
      rowMutationRevisionRef.current.clear()
      visiblePagesRef.current.clear()
      historyRowsRef.current = new Set()
      mutationInFlightRef.current = false
      queuedMutationsRef.current = []
      setMutationInFlight(false)
      updateFailedMutation(null)
      setRowCount(tableRowCountRef.current)
      onSelectedRowsChangeRef.current?.([])
      setFieldMenu(null)
      setColumnStatMenu(null)
      setCellMenu(null)
      setInspectedRowIndex(null)
    }
    onRowCountChangeRef.current?.(null)
    setCacheRevision((current) => current + 1)
    scheduleLatestPageRequest({
      visiblePages: [...pagesToRefresh],
      prefetchPages: [],
    })
  }, [
    attachmentThumbnails,
    loadPageIndex,
    reloadToken,
    scheduleLatestPageRequest,
    table.table.id,
    updateFailedMutation,
    view?.id,
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
      latestPageRequestRef.current = null
      attachmentThumbnails.clear()
      if (widthSaveTimerRef.current) clearTimeout(widthSaveTimerRef.current)
    },
    [attachmentThumbnails]
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
    void Promise.resolve()
      .then(() => loadColumnStats(columnStatConfigs))
      .then((results) => {
        if (generation !== columnStatGenerationRef.current) return
        setColumnStatResults(
          Object.fromEntries(results.map((result) => [result.fieldId, result]))
        )
      })
      .catch((error) => {
        if (generation === columnStatGenerationRef.current) onError?.(error)
      })
    return () => {
      if (generation === columnStatGenerationRef.current) {
        columnStatGenerationRef.current += 1
      }
    }
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
        const column = eidosFileGridColumn(field)
        const fieldId = eidosFileFieldKey(field)
        const baseWidth = columnBaseWidth(column)
        const stat = columnStatResults[fieldId]
        const configured = columnStatConfigs.find(
          (config) => config.fieldId === fieldId
        )
        return {
          ...column,
          width: columnPixelWidth(widths[fieldId], baseWidth),
          ...(stat && configured?.type === stat.type
            ? {
                trailingRowOptions: {
                  hint: columnStatHint(stat, field),
                  addIcon: EIDOS_FILE_EMPTY_STAT_ICON,
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
      trailingRowOptions: {
        ...defaultConfig.trailingRowOptions,
        hint: t("New"),
      },
      ...eidosFileGridScrollbarConfig(hasHorizontalScroll),
    }),
    [hasHorizontalScroll, t]
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
        return {
          kind: GridCellKind.Loading,
          allowOverlay: false,
          skeletonWidth: 96,
          skeletonWidthVariability: 32,
          skeletonHeight: 10,
        }
      }
      const cell = eidosFileValueToGridCell(
        field,
        row[field.tableColumnName],
        gridWriteLocked,
        row,
        t("Unavailable record")
      )
      if (
        cell.kind === GridCellKind.Custom &&
        (cell.data as { kind?: unknown }).kind === "eidos-file-file-cell"
      ) {
        const fileCell = cell as EidosFileAttachmentCell
        return {
          ...fileCell,
          data: {
            ...fileCell.data,
            thumbnails: attachmentThumbnails.prepare(
              fileCell.data.entries,
              columnIndex,
              rowIndex
            ),
            onImport: onImportFiles,
          },
        } as EidosFileAttachmentCell
      }
      if (
        cell.kind === GridCellKind.Custom &&
        (cell.data as { kind?: unknown }).kind === "eidos-file-relation-cell"
      ) {
        return {
          ...cell,
          data: {
            ...cell.data,
            onSearch: onSearchRelation
              ? (query: string) => onSearchRelation(field, query)
              : undefined,
          },
        } as EidosFileRelationCell
      }
      if (
        cell.kind === GridCellKind.Custom &&
        ((cell.data as { kind?: unknown }).kind === "select-cell" ||
          (cell.data as { kind?: unknown }).kind === "multi-select-cell")
      ) {
        const allowCreate = !gridWriteLocked && Boolean(onFieldUpdate)
        return {
          ...cell,
          data: {
            ...cell.data,
            allowCreate,
            onCreateOption: allowCreate
              ? async (options: readonly EidosFileGridSelectOption[]) => {
                  try {
                    await onFieldUpdate?.(field, {
                      property: selectOptionsProperty(field, options),
                    })
                  } catch (error) {
                    onError?.(error)
                    throw error
                  }
                }
              : undefined,
          },
        }
      }
      return cell
    },
    [
      attachmentThumbnails,
      cacheRevision,
      fields,
      gridWriteLocked,
      onImportFiles,
      onFieldUpdate,
      onError,
      onSearchRelation,
      t,
    ]
  )

  const requestVisiblePages = useCallback(
    (range: Rectangle) => {
      if (rowCount === 0) {
        latestPageRequestRef.current = null
        return
      }
      const maximumPage = Math.ceil(rowCount / PAGE_SIZE) - 1
      const visibleFirstPage = Math.max(
        0,
        Math.min(maximumPage, Math.floor(range.y / PAGE_SIZE))
      )
      const visibleLastPage = Math.max(
        visibleFirstPage,
        Math.min(
          maximumPage,
          Math.floor((range.y + Math.max(0, range.height - 1)) / PAGE_SIZE)
        )
      )
      const firstPage = Math.max(0, visibleFirstPage - PAGE_OVERSCAN)
      const lastPage = Math.min(
        maximumPage,
        Math.floor((range.y + Math.max(0, range.height - 1)) / PAGE_SIZE) +
          PAGE_OVERSCAN
      )
      const centerPage = Math.floor((visibleFirstPage + visibleLastPage) / 2)
      const closestToCenter = (left: number, right: number) =>
        Math.abs(left - centerPage) - Math.abs(right - centerPage) ||
        left - right
      const visiblePages = Array.from(
        { length: visibleLastPage - visibleFirstPage + 1 },
        (_, index) => visibleFirstPage + index
      ).sort(closestToCenter)
      const prefetchPages = Array.from(
        { length: lastPage - firstPage + 1 },
        (_, index) => firstPage + index
      )
        .filter((page) => page < visibleFirstPage || page > visibleLastPage)
        .sort(closestToCenter)
      visiblePagesRef.current = new Set([...visiblePages, ...prefetchPages])
      for (const page of visiblePagesRef.current) {
        touchPage(page)
      }
      scheduleLatestPageRequest({ visiblePages, prefetchPages })
      if (prunePageCache()) {
        setCacheRevision((current) => current + 1)
      }
    },
    [prunePageCache, rowCount, scheduleLatestPageRequest, touchPage]
  )

  const onVisibleRegionChanged = useCallback<
    NonNullable<DataEditorProps["onVisibleRegionChanged"]>
  >(
    (range) => {
      attachmentThumbnails.retainVisibleRows(range.y, range.height)
      requestVisiblePages(range)
    },
    [attachmentThumbnails, requestVisiblePages]
  )

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
      rowEdits: EidosFileGridPendingRowEdit[],
      editedCellCount: number
    ): Promise<EidosFileRowsMutationResult> => {
      if (onRowsEdit && editedCellCount > 1) {
        return onRowsEdit(
          rowEdits.map(({ previous, changes }) => ({
            row: previous,
            changes,
          }))
        )
      }

      let nextRowCount = rowCount
      const rows: EidosFileRow[] = []
      for (const edit of rowEdits) {
        let latest = edit.previous
        for (const [column, value] of Object.entries(edit.changes)) {
          const field = edit.fields.get(column)
          if (!field) continue
          const result = await onCellEdit(
            latest,
            field,
            value as EidosFileSqlPrimitive
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
    (mutations: EidosFileGridMutation[]): EidosFileGridMutation => {
      const merged = new Map<number, EidosFileGridPendingRowEdit>()
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
    async (mutation: EidosFileGridMutation): Promise<void> => {
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
        // Applying the persisted rows stays safe across a refresh: the
        // per-edit guards only touch rows still holding the same record and
        // mutation revision. Discarding the result here used to strand the
        // save silently and stall the whole mutation queue.
        const generationChanged = generation !== generationRef.current
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
            // Settled rows match the backend again, so later refetches may
            // update them freely; only still-pending rows stay protected.
            rowMutationRevisionRef.current.delete(edit.rowIndex)
            changed = true
          }
        }
        if (!generationChanged) {
          setRowCount(result.rowCount)
          updateFailedMutation(null)
          if (changed) setCacheRevision((revision) => revision + 1)
          refreshColumnStats()
        }
      } catch (error) {
        if (generation !== generationRef.current) {
          // The world moved on and the failure can no longer be surfaced.
          // Release the optimistic rows so the next refetch restores the
          // backend truth instead of pinning values that were never saved.
          for (const edit of mutation.rowEdits) {
            rowMutationRevisionRef.current.delete(edit.rowIndex)
          }
          return
        }
        const queued = queuedMutationsRef.current.splice(0)
        const failed = mergeGridMutations([mutation, ...queued])
        if (failed.rowEdits.length > 0) {
          updateFailedMutation({
            ...failed,
            message: gridMutationErrorMessage(error),
          })
        }
      } finally {
        // Resetting the in-flight flag and draining the queue must happen
        // even after a refresh advanced the generation, or every subsequent
        // edit would queue behind a flag that never clears and silently
        // never persist.
        mutationInFlightRef.current = false
        setMutationInFlight(false)
        if (!failedMutationRef.current) {
          const next = queuedMutationsRef.current.shift()
          if (next) void runGridMutationRef.current(next)
        }
        if (generation === generationRef.current && prunePageCache()) {
          setCacheRevision((revision) => revision + 1)
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

  const enqueueGridMutation = useCallback((mutation: EidosFileGridMutation) => {
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
      const grouped = new Map<number, EidosFileGridPendingRowEdit>()
      for (const {
        cell: [columnIndex, rowIndex],
        newValue,
      } of edits) {
        const field = fields[columnIndex]
        const row = rowsRef.current.get(rowIndex)
        if (!field || !row || field.valueKind === "system") continue
        const nextValue = gridCellToEidosFileValue(field, newValue)
        const group = grouped.get(rowIndex) ?? {
          rowIndex,
          previous: row,
          changes: {},
          fields: new Map<string, EidosFileFieldInfo>(),
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
    async (
      row: EidosFileRow,
      field: EidosFileFieldInfo,
      value: EidosFileSqlPrimitive
    ) => {
      if (inspectedRowIndex === null) {
        throw new Error("No inspected Eidos File row")
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
        (current.data as { kind?: unknown }).kind !== "eidos-file-file-cell"
      ) {
        return
      }
      const files = Array.from(transfer.files)
      if (files.length === 0) return
      void onImportDroppedFiles(files)
        .then((imported) => {
          if (imported.length === 0) return
          const fileCell = current as EidosFileAttachmentCell
          const existingUris = new Set(
            fileCell.data.entries.map((entry) => entry.uri)
          )
          const entries = [
            ...fileCell.data.entries,
            ...imported.filter((entry) => !existingUris.has(entry.uri)),
          ]
          if (entries.length === fileCell.data.entries.length) return
          history.onCellEdited(location, {
            ...fileCell,
            copyData: encodeEidosFileValues(entries),
            data: {
              ...fileCell.data,
              entries,
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
    (_column: GridColumn, _newSize: number, index: number, newSize: number) => {
      const field = fields[index]
      if (!field) return
      const id = eidosFileFieldKey(field)
      const baseWidth = columnBaseWidth(eidosFileGridColumn(field))
      const relativeWidth = Math.min(8, Math.max(0.25, newSize / baseWidth))
      setWidths((current) => {
        const next = { ...current, [id]: relativeWidth }
        if (view && onViewUpdate) {
          if (widthSaveTimerRef.current) {
            clearTimeout(widthSaveTimerRef.current)
          }
          widthSaveTimerRef.current = setTimeout(() => {
            void onViewUpdate({
              properties: {
                ...(view.properties ?? {}),
                fieldWidths: next,
              },
            })
          }, 400)
        }
        return next
      })
    },
    [fields, onViewUpdate, view]
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
              next.map((field, index) => [eidosFileFieldKey(field), index])
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
      setFieldMenu({
        field,
        fieldIndex: columnIndex,
        bounds: event.bounds,
        openedFromTouch: event.isTouch,
      })
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
    (changes: UpdateEidosFileViewInput) => {
      if (!onViewUpdate) return
      void Promise.resolve(onViewUpdate(changes)).catch((error) =>
        onError?.(error)
      )
    },
    [onError, onViewUpdate]
  )

  const updateColumnStat = useCallback(
    (field: EidosFileFieldInfo, type: EidosFileColumnStatType | null) => {
      const stored = view?.properties?.columnStats
      const current =
        typeof stored === "object" && stored !== null && !Array.isArray(stored)
          ? { ...(stored as Record<string, unknown>) }
          : {}
      const fieldId = eidosFileFieldKey(field)
      if (type) current[fieldId] = { type }
      else delete current[fieldId]
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
    ? view?.sorts.find(
        (sort) => sort.field === eidosFileFieldKey(fieldMenu.field)
      )?.direction
    : undefined
  const fieldStatType = fieldMenu
    ? columnStatConfigs.find(
        (config) => config.fieldId === eidosFileFieldKey(fieldMenu.field)
      )?.type
    : undefined
  const columnStatMenuValue = columnStatMenu
    ? columnStatConfigs.find(
        (config) => config.fieldId === eidosFileFieldKey(columnStatMenu.field)
      )?.type
    : undefined
  const cellText = cellMenu
    ? eidosFileRecordFieldText(cellMenu.row, cellMenu.field)
    : ""
  const cellIsEmpty =
    !cellMenu ||
    cellMenu.row[cellMenu.field.tableColumnName] === null ||
    cellMenu.row[cellMenu.field.tableColumnName] === undefined ||
    cellMenu.row[cellMenu.field.tableColumnName] === ""
  return (
    <div
      ref={containerRef}
      className="eidos-file-detail-layout flex h-full min-h-0 w-full overflow-hidden"
    >
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <DataEditor
          {...gridConfig}
          ref={gridRef}
          theme={theme}
          columns={columns}
          rows={rowCount}
          rowHeight={viewRowHeight(view)}
          freezeColumns={freezeColumns}
          getCellContent={getCellContent}
          onVisibleRegionChanged={onVisibleRegionChanged}
          customRenderers={EIDOS_FILE_GRID_CUSTOM_RENDERERS}
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
                aria-label={t("Add field")}
                title={t("New field")}
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
            data-eidos-file-grid-write-recovery
          >
            <div className="pointer-events-auto flex max-w-xl items-start gap-3 border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-destructive">
                  {failedMutation.editedCellCount === 1
                    ? t("Could not save this Grid change")
                    : t("Could not save {count} Grid changes", {
                        count: failedMutation.editedCellCount,
                      })}
                </p>
                <p className="mt-0.5 break-words leading-4 text-muted-foreground">
                  {failedMutation.message}{" "}
                  {failedMutation.editedCellCount === 1
                    ? t("Your change is preserved in the grid.")
                    : t("{count} changes are preserved in the grid.", {
                        count: failedMutation.editedCellCount,
                      })}
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
                  {mutationInFlight ? t("Retrying…") : t("Retry")}
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
                    ? t("Discard change")
                    : t("Discard changes")}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        <EidosFileFieldMenu
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
              sorts: nextEidosFileFieldSorts(
                view?.sorts ?? [],
                eidosFileFieldKey(field),
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
          onHide={(field) =>
            updateView({
              hiddenFields: [
                ...new Set([
                  ...(view?.hiddenFields ?? []),
                  eidosFileFieldKey(field),
                ]),
              ],
            })
          }
          onCalculate={setColumnStatMenu}
          onDelete={(field) => onDeleteField?.(field)}
        />
        <EidosFileColumnStatMenu
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
        <EidosFileCellMenu
          state={cellMenu}
          open={cellMenu !== null}
          selectionCount={cellMenu ? rowRangeCount(cellMenu.rowRanges) : 0}
          cellText={cellIsEmpty ? "" : cellText}
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
          onDeleteRows={(ranges) => onRequestDeleteRows?.(ranges)}
        />
      </div>
      {propertyField &&
      onPropertyFieldClose &&
      onFieldUpdate &&
      onDeleteField ? (
        <EidosFileFieldPropertyPanel
          field={propertyField}
          tables={tables ?? [table]}
          disabled={gridWriteLocked}
          onClose={onPropertyFieldClose}
          onUpdate={onFieldUpdate}
          onDelete={onDeleteField}
          onEditFormula={onEditFormula}
          onEditLookup={onEditLookup}
        />
      ) : inspectedRow ? (
        <EidosFileRecordInspector
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
        />
      ) : null}
    </div>
  )
})
