import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { createPortal } from "react-dom"
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
  CompactSelection,
  GridCellKind,
  type DataEditorProps,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
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
import {
  type UndoRedoCommand,
  type UndoRedoEdit,
  useUndoRedo,
} from "./use-undo-redo"
import { useEidosFileUI } from "./context"
import { useEidosFileGridThemeForElement } from "./theme-internal"
import { Button } from "./ui/primitives"
import { useGlideDataGridPortal } from "./use-glide-data-grid-portal"
import { eidosFileKeyboardEventMatchesBinding } from "./use-eidos-file-tab-strip"
import type { EidosFileFormulaEditorAnchor } from "./eidos-file-derived-field-editor"

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
  EidosFileUrlImageCellRenderer,
  type EidosFileUrlImageCell,
} from "./eidos-file-url-image-cell"
import { EidosFileUrlImageThumbnailManager } from "./eidos-file-url-image-thumbnails"
import { sharedEidosFileUrlImageSourceCache } from "./eidos-file-url-image-source-cache"
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
import { eidosFileUrlIsActivatable } from "./eidos-file-url-activation"
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
  EidosFileUrlImageCellRenderer,
  EidosFileRelationCellRenderer,
]

function eidosFileRowIdentity(row: EidosFileRow): string | undefined {
  const rowId = row._id
  if (typeof rowId !== "string" && typeof rowId !== "number") return undefined
  return String(rowId)
}

function canonicalEidosFileRowId(
  value: unknown,
  aliases: ReadonlyMap<string, string>
): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined
  }
  let id = String(value)
  const visited = new Set<string>()
  while (!visited.has(id)) {
    visited.add(id)
    const next = aliases.get(id)
    if (!next) break
    id = next
  }
  return id
}

/**
 * Whether a Grid selection still covers a row. Draft rows stay pinned to
 * their creation index while covered; leaving the row ends the draft session.
 */
function selectionCoversRowIndex(
  selection: GridSelection | null,
  rowIndex: number
): boolean {
  if (!selection) return false
  if (selection.rows.hasIndex(rowIndex)) return true
  const current = selection.current
  if (!current) return false
  if (current.cell[1] === rowIndex) return true
  const ranges = [current.range, ...current.rangeStack]
  return ranges.some(
    (range) => rowIndex >= range.y && rowIndex < range.y + range.height
  )
}

function draftRowPinLimit(pins: ReadonlyMap<number, unknown>): number {
  let limit = 0
  for (const index of pins.keys()) {
    limit = Math.max(limit, index + 1)
  }
  return limit
}

function tagGridCellRowIdentity<T extends GridCell>(
  cell: T,
  row: EidosFileRow,
  rowIndex: number
): T {
  const rowId = eidosFileRowIdentity(row)
  if (rowId === undefined) return cell
  return { ...cell, eidosFileRowId: rowId, eidosFileRowIndex: rowIndex }
}

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
  /** Hide Glide's always-frozen row marker gutter when space is constrained. */
  showRowMarkers?: boolean
  reloadToken?: number
  /** Monotonic Host request used to return keyboard focus to the Grid. */
  focusRequestToken?: number
  /** Stable identity for the active row query; changing it invalidates positional history. */
  historyScopeKey?: string
  loadPage: (offset: number, limit: number) => Promise<EidosFileRowPage>
  locateRow?: (rowId: string) => Promise<number | null>
  loadColumnStats?: (
    configs: EidosFileColumnStatConfig[]
  ) => Promise<EidosFileColumnStatResult[]>
  onAddRow: () => EidosFileGridAppendResult | Promise<EidosFileGridAppendResult>
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
  onImportDroppedFiles?: (
    files: File[],
    source?: "drop" | "paste"
  ) => Promise<FileEntry[]>
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
  onEditFormula?: (
    field: EidosFileFieldInfo,
    previewRowId?: string,
    anchor?: EidosFileFormulaEditorAnchor
  ) => void
  onEditLookup?: (field: EidosFileFieldInfo) => void
  onDeleteField?: (field: EidosFileFieldInfo) => void
  onRequestDeleteRows?: (
    ranges: EidosFileRowRange[]
  ) => Promise<EidosFileGridDeleteResult | void> | void
  onViewUpdate?: (changes: UpdateEidosFileViewInput) => Promise<void> | void
  onError?: (error: unknown) => void
}

export interface EidosFileGridUndoCommand {
  /** Change to the current row count after applying this command. */
  rowCountDelta: number
  /** Apply this inverse and return the next inverse (redo/undo). */
  apply(): Promise<EidosFileGridUndoCommand>
}

export interface EidosFileGridDeleteResult {
  /** Authoritative row count after the deletion. */
  rowCount: number
  /** Present only when the deletion can be undone in this session. */
  undo?: EidosFileGridUndoCommand
}

export interface EidosFileGridAppendResult extends EidosFileRowMutationResult {
  /**
   * When present, `row` is an optimistic placeholder that can render and be
   * edited immediately. The settled mutation supplies the authoritative Row
   * ID and revision without blocking Glide's appended-row editor.
   */
  settled?: Promise<EidosFileRowMutationResult>
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
  // Glide wraps text on a 17px line pitch (13px font, lineHeight 1.4) with 3px
  // vertical padding, so 52px fits exactly three lines and 69px fits four.
  // The previous 44px clipped a third line in half.
  if (view?.properties?.rowDensity === "comfortable") return 52
  if (view?.properties?.rowDensity === "huge") return 69
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
  showRowMarkers = true,
  reloadToken = 0,
  historyScopeKey,
  loadPage,
  locateRow,
  loadColumnStats,
  onAddRow,
  onCellEdit,
  onInspectorCellEdit,
  onRowsEdit,
  onSelectedRowsChange,
  onRowCountChange,
  focusRequestToken = 0,
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
    activateUrl,
    assetPresenter,
    assetSession,
    keyboardShortcuts,
    themeName,
    timeZone,
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
  const restoreGridFocus = useCallback(() => gridRef.current?.focus(), [])
  const acceptedFocusRequestTokenRef = useRef(focusRequestToken)
  const attachmentThumbnails = useMemo(
    () =>
      new EidosFileAttachmentThumbnailManager(
        assetSession,
        assetPresenter,
        (cells) => gridRef.current?.updateCells(cells)
      ),
    [assetPresenter, assetSession]
  )
  const urlImageThumbnails = useMemo(() => {
    const sourceCache = sharedEidosFileUrlImageSourceCache(
      assetSession,
      assetPresenter
    )
    return new EidosFileUrlImageThumbnailManager(
      assetSession,
      assetPresenter,
      (cells) => gridRef.current?.updateCells(cells),
      undefined,
      sourceCache
    )
  }, [assetPresenter, assetSession])
  const widthSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowsRef = useRef(new Map<number, EidosFileRow>())
  const rowMutationRevisionRef = useRef(new Map<number, number>())
  const pendingRowCreatesRef = useRef(
    new Map<string, Promise<EidosFileRowMutationResult>>()
  )
  const rowIdAliasesRef = useRef(new Map<string, string>())
  // Newly appended rows are pinned to their creation index for the duration
  // of their edit session so a sort/filter revalidation never yanks the row
  // out from under its open editor (Notion/Airtable draft-row behavior).
  const draftRowPinsRef = useRef(new Map<number, { rowId: string }>())
  const deferredRefreshRef = useRef(false)
  const [draftRowsMayReposition, setDraftRowsMayReposition] = useState(false)
  const [pendingDraftFollow, setPendingDraftFollow] = useState<{
    rowId: string
    columnIndex: number
    previousIndex: number
  } | null>(null)
  const explicitDraftLeaveRef = useRef(false)
  const followInteractionRevisionRef = useRef(0)
  const gridSelectionRef = useRef<GridSelection | null>(null)
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

  const openUrl = useCallback(
    (uri: string) => {
      if (!activateUrl || !eidosFileUrlIsActivatable(uri)) return
      try {
        void Promise.resolve(activateUrl(uri)).catch((error) =>
          onErrorRef.current?.(error)
        )
      } catch (error) {
        onErrorRef.current?.(error)
      }
    },
    [activateUrl]
  )
  onRowCountChangeRef.current = onRowCountChange
  onSelectedRowsChangeRef.current = onSelectedRowsChange
  const [cacheRevision, setCacheRevision] = useState(0)
  const [refreshToken, setRefreshToken] = useState(0)
  const [rowCount, setRowCount] = useState(table.rowCount)
  const rowCountRef = useRef(rowCount)
  rowCountRef.current = rowCount
  const [fieldMenu, setFieldMenu] = useState<EidosFileFieldMenuState | null>(
    null
  )
  const [columnStatMenu, setColumnStatMenu] =
    useState<EidosFileFieldMenuState | null>(null)
  const [cellMenu, setCellMenu] = useState<EidosFileCellMenuState | null>(null)
  const cellMenuOpenedFromKeyboardRef = useRef(false)
  const [inspectedRowIndex, setInspectedRowIndex] = useState<number | null>(
    null
  )
  const inspectedRowIndexRef = useRef<number | null>(null)
  inspectedRowIndexRef.current = inspectedRowIndex
  const availableFields = useMemo(
    () => orderedEidosFileFields(table.fields, view),
    [table.fields, view?.hiddenFields, view?.orderMap]
  )
  const rowHistorySchemaKey = useMemo(
    () =>
      JSON.stringify({
        table: {
          id: table.table.id,
          name: table.table.name,
          physicalName: table.table.physicalName,
          rawTableName: table.table.rawTableName,
        },
        fields: table.fields,
      }),
    [table.fields, table.table]
  )
  const [fields, setFields] = useState(availableFields)
  const newRecordTargetColumn = Math.max(
    0,
    fields.findIndex((field) => field.isRecordLabel === true)
  )
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
  const rowCommandInFlightRef = useRef(false)
  const [rowCommandInFlight, setRowCommandInFlight] = useState(false)
  const beginRowCommand = useCallback(() => {
    if (rowCommandInFlightRef.current) return false
    rowCommandInFlightRef.current = true
    setRowCommandInFlight(true)
    return true
  }, [])
  const endRowCommand = useCallback(() => {
    rowCommandInFlightRef.current = false
    setRowCommandInFlight(false)
  }, [])
  const updateFailedMutation = useCallback(
    (next: EidosFileGridFailedMutation | null) => {
      failedMutationRef.current = next
      setFailedMutation(next)
    },
    []
  )
  const gridWriteLocked =
    disabled || failedMutation !== null || rowCommandInFlight
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
    for (const pinnedIndex of draftRowPinsRef.current.keys()) {
      protectedPages.add(Math.floor(pinnedIndex / PAGE_SIZE))
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

  /**
   * Releases draft-row pins whose edit session has ended: the insert and all
   * cell saves have settled and the selection no longer covers the row. Once
   * the last pin is released, any revalidation deferred for the draft is
   * applied so the row lands at its truthful sort/filter position.
   */
  const releaseDraftRowPins = useCallback(
    (selection: GridSelection | null) => {
      const pins = draftRowPinsRef.current
      if (pins.size === 0) return
      let releasedRowId: string | undefined
      let releasedIndex: number | undefined
      for (const [index, pin] of [...pins]) {
        if (pendingRowCreatesRef.current.has(pin.rowId)) continue
        if (rowMutationRevisionRef.current.has(index)) continue
        if (selectionCoversRowIndex(selection, index)) continue
        releasedRowId = canonicalEidosFileRowId(
          pin.rowId,
          rowIdAliasesRef.current
        )
        releasedIndex = index
        pins.delete(index)
      }
      if (pins.size !== 0) return
      const follow =
        releasedRowId &&
        releasedIndex !== undefined &&
        locateRow &&
        !explicitDraftLeaveRef.current
          ? {
              rowId: releasedRowId,
              columnIndex: newRecordTargetColumn,
              previousIndex: releasedIndex,
            }
          : null
      setPendingDraftFollow(follow)
      const hadDeferredRefresh = deferredRefreshRef.current
      if (hadDeferredRefresh) {
        deferredRefreshRef.current = false
        setDraftRowsMayReposition(false)
      }
      // Always revalidate a released draft before locating it. This also
      // covers a fast Enter/Tab that ends editing before the host's mutation
      // refresh has rendered; if the row did not move, the follow is a no-op.
      if (hadDeferredRefresh || follow) {
        setRefreshToken((token) => token + 1)
      }
    },
    [locateRow, newRecordTargetColumn]
  )

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
        const pinnedRows = new Map<string, number>()
        for (const [pinnedIndex, pin] of draftRowPinsRef.current) {
          const rowId = canonicalEidosFileRowId(
            pin.rowId,
            rowIdAliasesRef.current
          )
          if (rowId !== undefined) pinnedRows.set(rowId, pinnedIndex)
        }
        const relocatesPinnedDraft = page.rows.some((row, index) => {
          const rowId = canonicalEidosFileRowId(
            eidosFileRowIdentity(row),
            rowIdAliasesRef.current
          )
          if (rowId === undefined) return false
          const pinnedIndex = pinnedRows.get(rowId)
          return (
            pinnedIndex !== undefined && pinnedIndex !== page.offset + index
          )
        })
        if (relocatesPinnedDraft) {
          // Applying only this page would either duplicate the draft at its
          // truthful sorted position or leave a hole after filtering it out.
          // Keep the current coherent snapshot and refresh once editing ends.
          deferredRefreshRef.current = true
          setDraftRowsMayReposition(true)
          return false
        }
        page.rows.forEach((row, index) => {
          const rowIndex = page.offset + index
          // A refetched page may have been read before a pending optimistic
          // edit landed. Never clobber such rows: an open editor would reset
          // to the stale value mid-typing, and the mutation result reapplies
          // the authoritative row once the save completes.
          if (!rowMutationRevisionRef.current.has(rowIndex)) {
            // Draft rows stay pinned at their creation index until their edit
            // session ends, even when the refetch sorts them elsewhere.
            if (!draftRowPinsRef.current.has(rowIndex)) {
              rowsRef.current.set(rowIndex, row)
            }
          }
        })
        for (const rowIndex of [...rowsRef.current.keys()]) {
          // Drop cached rows beyond the authoritative total (deleted or
          // filtered out) so a stale entry can never be edited by accident.
          // Pinned draft rows survive: a filter must not hide a row whose
          // editor is still open.
          if (
            rowIndex >= page.total &&
            !rowMutationRevisionRef.current.has(rowIndex) &&
            !draftRowPinsRef.current.has(rowIndex)
          ) {
            rowsRef.current.delete(rowIndex)
          }
        }
        loadedPagesRef.current.add(pageIndex)
        touchPage(pageIndex)
        prunePageCache()
        const nextRowCount = Math.max(
          page.total,
          draftRowPinLimit(draftRowPinsRef.current)
        )
        setRowCount(nextRowCount)
        onRowCountChangeRef.current?.(nextRowCount)
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
    if (preserveData && draftRowPinsRef.current.size > 0) {
      // A draft row is pinned at the bottom with its edit session open.
      // Defer the revalidation so the sorted/filtered snapshot cannot move or
      // hide the row mid-edit; the refresh is applied once the session ends.
      deferredRefreshRef.current = true
      setDraftRowsMayReposition(true)
      return
    }
    deferredRefreshRef.current = false
    setDraftRowsMayReposition(false)
    const pagesToRefresh = preserveData
      ? new Set([0, ...visiblePagesRef.current])
      : new Set([0])
    dataScopeRef.current = scope
    if (thumbnailScopeRef.current !== thumbnailScope) {
      thumbnailScopeRef.current = thumbnailScope
      attachmentThumbnails.clear()
      urlImageThumbnails.clear()
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
      pendingRowCreatesRef.current.clear()
      rowIdAliasesRef.current.clear()
      draftRowPinsRef.current.clear()
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
    refreshToken,
    reloadToken,
    scheduleLatestPageRequest,
    table.table.id,
    updateFailedMutation,
    urlImageThumbnails,
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

  // Keyboard activation chain: opening a file or switching a view hands
  // focus to the Grid so arrow keys and Grid shortcuts work immediately
  // (e.g. after Quick Open or view tab cycling). Glide mounts its canvas a
  // commit after the editor shell, so focus is retried on animation frames
  // until it lands; a user pointer interaction cancels the retry by moving
  // the focus elsewhere.
  const gridFocusKey = `${table.table.id}:${view?.id ?? "default"}`
  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const initiallyActiveElement = document.activeElement
    const tryFocus = () => {
      if (cancelled) return
      const container = containerRef.current
      if (!container) return
      if (container.contains(document.activeElement)) return
      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        active !== document.body &&
        (attempts > 0 || active !== initiallyActiveElement)
      ) {
        return
      }
      attempts += 1
      gridRef.current?.focus?.()
      if (attempts < 30 && !container.contains(document.activeElement)) {
        requestAnimationFrame(tryFocus)
      }
    }
    requestAnimationFrame(tryFocus)
    return () => {
      cancelled = true
    }
  }, [gridFocusKey])

  useEffect(
    () => () => {
      generationRef.current += 1
      columnStatGenerationRef.current += 1
      latestPageRequestRef.current = null
      attachmentThumbnails.clear()
      urlImageThumbnails.clear()
      if (widthSaveTimerRef.current) clearTimeout(widthSaveTimerRef.current)
    },
    [attachmentThumbnails, urlImageThumbnails]
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
      rowMarkers: showRowMarkers ? defaultConfig.rowMarkers : "none",
      ...eidosFileGridScrollbarConfig(hasHorizontalScroll),
    }),
    [hasHorizontalScroll, showRowMarkers, t]
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
        t("Unavailable record"),
        view?.properties?.textWrapping === true,
        timeZone
      )
      if (
        cell.kind === GridCellKind.Custom &&
        (cell.data as { kind?: unknown }).kind === "eidos-file-file-cell"
      ) {
        const fileCell = cell as EidosFileAttachmentCell
        return tagGridCellRowIdentity(
          {
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
          } as EidosFileAttachmentCell,
          row,
          rowIndex
        )
      }
      if (
        cell.kind === GridCellKind.Custom &&
        (cell.data as { kind?: unknown }).kind === "eidos-file-url-image-cell"
      ) {
        const imageCell = cell as EidosFileUrlImageCell
        return tagGridCellRowIdentity(
          {
            ...imageCell,
            data: {
              ...imageCell.data,
              thumbnail: urlImageThumbnails.prepare(
                imageCell.data.uri,
                columnIndex,
                rowIndex
              ),
            },
          } as EidosFileUrlImageCell,
          row,
          rowIndex
        )
      }
      if (
        cell.kind === GridCellKind.Custom &&
        (cell.data as { kind?: unknown }).kind === "eidos-file-relation-cell"
      ) {
        return tagGridCellRowIdentity(
          {
            ...cell,
            data: {
              ...cell.data,
              onSearch: onSearchRelation
                ? (query: string) => onSearchRelation(field, query)
                : undefined,
            },
          } as EidosFileRelationCell,
          row,
          rowIndex
        )
      }
      if (
        cell.kind === GridCellKind.Custom &&
        ((cell.data as { kind?: unknown }).kind === "select-cell" ||
          (cell.data as { kind?: unknown }).kind === "multi-select-cell")
      ) {
        const allowCreate = !gridWriteLocked && Boolean(onFieldUpdate)
        return tagGridCellRowIdentity(
          {
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
          },
          row,
          rowIndex
        )
      }
      if (
        cell.kind === GridCellKind.Uri &&
        activateUrl &&
        eidosFileUrlIsActivatable(cell.data)
      ) {
        const uri = cell.data
        return tagGridCellRowIdentity(
          {
            ...cell,
            hoverEffect: true,
            onClickUri: (event) => {
              event.preventDefault()
              openUrl(uri)
            },
          },
          row,
          rowIndex
        )
      }
      return tagGridCellRowIdentity(cell, row, rowIndex)
    },
    [
      attachmentThumbnails,
      activateUrl,
      cacheRevision,
      fields,
      gridWriteLocked,
      onImportFiles,
      openUrl,
      onFieldUpdate,
      onError,
      onSearchRelation,
      t,
      timeZone,
      view?.properties?.textWrapping,
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
      urlImageThumbnails.retainVisibleRows(range.y, range.height)
      requestVisiblePages(range)
    },
    [attachmentThumbnails, requestVisiblePages, urlImageThumbnails]
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

  const canonicalRowId = useCallback((value: unknown): string | undefined => {
    return canonicalEidosFileRowId(value, rowIdAliasesRef.current)
  }, [])

  const sameRowIdentity = useCallback(
    (left: unknown, right: unknown) => {
      const leftId = canonicalRowId(left)
      return leftId !== undefined && leftId === canonicalRowId(right)
    },
    [canonicalRowId]
  )

  const resolvePendingRow = useCallback(
    (row: EidosFileRow): EidosFileRow | Promise<EidosFileRow> => {
      const id = eidosFileRowIdentity(row)
      if (!id) return row
      const pending = pendingRowCreatesRef.current.get(id)
      if (pending) {
        return pending.then((created) => {
          const authoritativeId = eidosFileRowIdentity(created.row)
          if (authoritativeId) rowIdAliasesRef.current.set(id, authoritativeId)
          return created.row
        })
      }
      const canonical = canonicalRowId(id)
      if (!canonical || canonical === id) return row
      for (const current of rowsRef.current.values()) {
        if (eidosFileRowIdentity(current) === canonical) return current
      }
      return { ...row, _id: canonical }
    },
    [canonicalRowId]
  )

  const persistRowEdits = useCallback(
    async (
      rowEdits: EidosFileGridPendingRowEdit[],
      editedCellCount: number
    ): Promise<EidosFileRowsMutationResult> => {
      const hasPendingCreate = rowEdits.some((edit) => {
        const id = eidosFileRowIdentity(edit.previous)
        return id ? pendingRowCreatesRef.current.has(id) : false
      })
      if (onRowsEdit && editedCellCount > 1 && !hasPendingCreate) {
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
        const resolved = resolvePendingRow(edit.previous)
        let latest = resolved instanceof Promise ? await resolved : resolved
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
    [onCellEdit, onRowsEdit, resolvePendingRow, rowCount, table.table.id]
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
          const persistedId = canonicalRowId(edit.previous._id)
          const persisted = persistedId ? rowsById.get(persistedId) : undefined
          if (
            persisted &&
            current &&
            sameRowIdentity(current._id, edit.previous._id) &&
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
        // A settled save may be the last thing keeping a draft row pinned
        // after the user already moved on.
        releaseDraftRowPins(gridSelectionRef.current)
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
      canonicalRowId,
      persistRowEdits,
      prunePageCache,
      refreshColumnStats,
      releaseDraftRowPins,
      sameRowIdentity,
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

  // Grid coordinates are only a viewport address. Overlay editors can remain
  // open while a refresh re-sorts the underlying records, so their commit
  // location may no longer identify the row that opened the editor. Cells
  // carry that row identity and their source index. The source index lets us
  // distinguish an editor commit from a fill operation, where Glide copies a
  // source cell into a deliberately different target row.
  const retargetEditedCellLocation = useCallback(
    (location: Item, cell: GridCell): Item | null => {
      const identity = cell as {
        eidosFileRowId?: unknown
        eidosFileRowIndex?: unknown
      }
      const rowId = identity.eidosFileRowId
      if (typeof rowId !== "string") return location
      if (identity.eidosFileRowIndex !== location[1]) return location
      const currentRow = rowsRef.current.get(location[1])
      if (currentRow && sameRowIdentity(currentRow._id, rowId)) {
        return location
      }
      for (const [rowIndex, row] of rowsRef.current) {
        if (sameRowIdentity(row._id, rowId)) {
          return [location[0], rowIndex]
        }
      }
      return null
    },
    [sameRowIdentity]
  )

  const commitCells = useCallback(
    (edits: readonly UndoRedoEdit[]) => {
      if (disabled || failedMutationRef.current) {
        return
      }
      const grouped = new Map<number, EidosFileGridPendingRowEdit>()
      for (const { cell, newValue } of edits) {
        const target = retargetEditedCellLocation(cell, newValue)
        if (!target) continue
        const [columnIndex, rowIndex] = target
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
    [disabled, enqueueGridMutation, fields, retargetEditedCellLocation]
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
    const generation = generationRef.current
    try {
      const result = await onAddRow()
      const optimistic = result.settled !== undefined
      const index = optimistic
        ? rowCountRef.current
        : Math.max(0, result.rowCount - 1)
      rowsRef.current.set(index, result.row)
      rowCountRef.current = optimistic
        ? rowCountRef.current + 1
        : result.rowCount
      setRowCount(rowCountRef.current)
      setCacheRevision((current) => current + 1)
      const draftRowId = eidosFileRowIdentity(result.row)
      if (draftRowId) {
        // Pin the draft at its creation index so a sorted/filtered
        // revalidation cannot move or hide it while its editor is open.
        explicitDraftLeaveRef.current = false
        draftRowPinsRef.current.set(index, { rowId: draftRowId })
      }
      if (!result.settled) {
        refreshColumnStats()
        return "bottom" as const
      }

      const optimisticId = eidosFileRowIdentity(result.row)
      if (!optimisticId) {
        throw new Error("An optimistic Eidos File row requires a temporary ID")
      }
      pendingRowCreatesRef.current.set(optimisticId, result.settled)
      void result.settled
        .then((settled) => {
          pendingRowCreatesRef.current.delete(optimisticId)
          if (generation !== generationRef.current) return
          const authoritativeId = eidosFileRowIdentity(settled.row)
          if (!authoritativeId) {
            throw new Error("The created Eidos File row has no Row ID")
          }
          rowIdAliasesRef.current.set(optimisticId, authoritativeId)
          for (const [rowIndex, current] of rowsRef.current) {
            if (eidosFileRowIdentity(current) !== optimisticId) continue
            rowsRef.current.set(rowIndex, {
              ...settled.row,
              ...current,
              _id: settled.row._id,
            })
            break
          }
          // The mutation result reports the full table count, while this Grid
          // may be rendering a filtered or searched query. The optimistic row
          // was already included above, so keep the query-local count until a
          // page revalidation returns its authoritative `total`.
          setCacheRevision((current) => current + 1)
          refreshColumnStats()
          releaseDraftRowPins(gridSelectionRef.current)
        })
        .catch((error) => {
          pendingRowCreatesRef.current.delete(optimisticId)
          if (generation !== generationRef.current) return
          const failedIndex = [...rowsRef.current].find(
            ([, row]) => eidosFileRowIdentity(row) === optimisticId
          )?.[0]
          if (failedIndex !== undefined) {
            rowsRef.current.delete(failedIndex)
            rowMutationRevisionRef.current.delete(failedIndex)
            draftRowPinsRef.current.delete(failedIndex)
            for (
              let rowIndex = failedIndex + 1;
              rowIndex < rowCountRef.current;
              rowIndex += 1
            ) {
              const shifted = rowsRef.current.get(rowIndex)
              if (shifted) rowsRef.current.set(rowIndex - 1, shifted)
              rowsRef.current.delete(rowIndex)
              const revision = rowMutationRevisionRef.current.get(rowIndex)
              if (revision !== undefined) {
                rowMutationRevisionRef.current.set(rowIndex - 1, revision)
              }
              rowMutationRevisionRef.current.delete(rowIndex)
              const shiftedPin = draftRowPinsRef.current.get(rowIndex)
              if (shiftedPin) {
                draftRowPinsRef.current.set(rowIndex - 1, shiftedPin)
              }
              draftRowPinsRef.current.delete(rowIndex)
            }
            rowCountRef.current = Math.max(0, rowCountRef.current - 1)
            setRowCount(rowCountRef.current)
            setCacheRevision((current) => current + 1)
          }
          onErrorRef.current?.(error)
        })
      return "bottom" as const
    } catch (error) {
      onError?.(error)
      return undefined
    }
  }, [onAddRow, onError, refreshColumnStats, releaseDraftRowPins])

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
  gridSelectionRef.current = history.gridSelection

  useEffect(() => {
    if (acceptedFocusRequestTokenRef.current === focusRequestToken) return
    acceptedFocusRequestTokenRef.current = focusRequestToken
    restoreGridFocus()
  }, [focusRequestToken, restoreGridFocus])

  const refreshAfterRowCommand = useCallback((nextRowCount: number) => {
    rowCountRef.current = nextRowCount
    setRowCount(nextRowCount)
    onRowCountChangeRef.current?.(nextRowCount)
    setInspectedRowIndex(null)
    setRefreshToken((token) => token + 1)
  }, [])

  const rowHistoryCommand = useCallback(
    (command: EidosFileGridUndoCommand): UndoRedoCommand => {
      const wrap = (current: EidosFileGridUndoCommand): UndoRedoCommand => ({
        apply: async () => {
          if (!beginRowCommand()) {
            throw new Error("Another record operation is still in progress")
          }
          try {
            const inverse = await current.apply()
            refreshAfterRowCommand(
              Math.max(0, rowCountRef.current + current.rowCountDelta)
            )
            return wrap(inverse)
          } finally {
            endRowCommand()
          }
        },
        onError: (error) => onErrorRef.current?.(error),
      })
      return wrap(command)
    },
    [beginRowCommand, endRowCommand, refreshAfterRowCommand]
  )

  const requestDeleteRows = useCallback(
    (ranges: EidosFileRowRange[]) => {
      if (!onRequestDeleteRows || !beginRowCommand()) return
      void Promise.resolve(onRequestDeleteRows(ranges))
        .then((result) => {
          if (!result) return
          refreshAfterRowCommand(result.rowCount)
          if (result.undo) {
            history.recordCommand(rowHistoryCommand(result.undo))
          }
        })
        .catch((error) => onErrorRef.current?.(error))
        .finally(endRowCommand)
    },
    [
      beginRowCommand,
      endRowCommand,
      history.recordCommand,
      onRequestDeleteRows,
      refreshAfterRowCommand,
      rowHistoryCommand,
    ]
  )

  const followRequestRef = useRef(0)

  useEffect(() => {
    if (!pendingDraftFollow || !locateRow) return
    const request = ++followRequestRef.current
    const interactionRevision = followInteractionRevisionRef.current
    const { rowId, columnIndex, previousIndex } = pendingDraftFollow

    void locateRow(rowId)
      .then(async (rowIndex) => {
        if (
          request !== followRequestRef.current ||
          interactionRevision !== followInteractionRevisionRef.current
        ) {
          return
        }
        if (rowIndex === null) {
          setPendingDraftFollow((current) =>
            current?.rowId === rowId ? null : current
          )
          return
        }
        if (rowIndex === previousIndex) {
          setPendingDraftFollow((current) =>
            current?.rowId === rowId ? null : current
          )
          return
        }

        await loadPageIndexRef.current(Math.floor(rowIndex / PAGE_SIZE))
        if (
          request !== followRequestRef.current ||
          interactionRevision !== followInteractionRevisionRef.current
        ) {
          return
        }

        const targetColumn = Math.min(
          Math.max(0, columnIndex),
          Math.max(0, fields.length - 1)
        )
        const selection: GridSelection = {
          columns: CompactSelection.empty(),
          rows: CompactSelection.empty(),
          current: {
            cell: [targetColumn, rowIndex],
            range: {
              x: targetColumn,
              y: rowIndex,
              width: 1,
              height: 1,
            },
            rangeStack: [],
          },
        }
        history.onGridSelectionChange(selection)
        gridRef.current?.scrollTo(targetColumn, rowIndex, "both", 0, 24, {
          vAlign: "center",
        })
        gridRef.current?.focus()
        setPendingDraftFollow((current) =>
          current?.rowId === rowId ? null : current
        )
      })
      .catch((error) => {
        if (request !== followRequestRef.current) return
        setPendingDraftFollow((current) =>
          current?.rowId === rowId ? null : current
        )
        onErrorRef.current?.(error)
      })

    return () => {
      if (request === followRequestRef.current) {
        followRequestRef.current += 1
      }
    }
  }, [
    fields.length,
    history.onGridSelectionChange,
    locateRow,
    pendingDraftFollow,
  ])

  const handleGridSelectionChangeWithDraftRelease = useCallback(
    (selection: GridSelection) => {
      history.onGridSelectionChange(selection)
      releaseDraftRowPins(selection)
    },
    [history.onGridSelectionChange, releaseDraftRowPins]
  )

  useEffect(() => {
    history.reset()
  }, [
    history.reset,
    historyScopeKey,
    reloadToken,
    rowHistorySchemaKey,
    table.table.id,
    view?.id,
  ])

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
  const [draftMoveTooltip, setDraftMoveTooltip] = useState<{
    rowIndex: number
    left: number
    top: number
  } | null>(null)
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
  const draftMoveHighlightRegions: NonNullable<
    DataEditorProps["highlightRegions"]
  > = draftRowsMayReposition
    ? [...draftRowPinsRef.current.keys()].map((rowIndex) => ({
        color: themeColorWithAlpha(theme.accentColor, 0.1),
        range: {
          x: 0,
          y: rowIndex,
          width: Math.max(1, columns.length),
          height: 1,
        },
        style: "no-outline" as const,
      }))
    : []

  const onItemHovered = useCallback<
    NonNullable<DataEditorProps["onItemHovered"]>
  >(
    (args) => {
      if (
        !draftRowsMayReposition ||
        args.kind !== "cell" ||
        !draftRowPinsRef.current.has(args.location[1])
      ) {
        setDraftMoveTooltip((current) => (current ? null : current))
        return
      }
      const rowIndex = args.location[1]
      const left = Math.max(
        8,
        Math.min(args.bounds.x + 8, window.innerWidth - 296)
      )
      const below = args.bounds.y + args.bounds.height + 6
      const top =
        below + 64 <= window.innerHeight
          ? below
          : Math.max(8, args.bounds.y - 58)
      setDraftMoveTooltip((current) =>
        current?.rowIndex === rowIndex &&
        current.left === left &&
        current.top === top
          ? current
          : { rowIndex, left, top }
      )
    },
    [draftRowsMayReposition]
  )

  useEffect(() => {
    if (!draftRowsMayReposition) setDraftMoveTooltip(null)
  }, [draftRowsMayReposition])
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
  const onCellEditedWithRetarget = useCallback(
    (location: Item, cell: EditableGridCell) => {
      const target = retargetEditedCellLocation(location, cell)
      if (!target) return
      history.onCellEdited(target, cell)
    },
    [history.onCellEdited, retargetEditedCellLocation]
  )
  const onCellActivated = useCallback<
    NonNullable<DataEditorProps["onCellActivated"]>
  >(
    ([columnIndex, rowIndex]) => {
      const field = fields[columnIndex]
      const row = rowsRef.current.get(rowIndex)
      if (field?.type !== "formula" || !row || !onEditFormula) return
      const rowId = canonicalEidosFileRowId(row._id, rowIdAliasesRef.current)
      const bounds = gridRef.current?.getBounds?.(columnIndex, rowIndex)
      onPropertyFieldClose?.()
      onEditFormula(
        field,
        rowId?.startsWith("optimistic:") ? undefined : rowId,
        bounds
          ? {
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
            }
          : undefined
      )
    },
    [fields, onEditFormula, onPropertyFieldClose]
  )

  const importFilesIntoAttachmentCell = useCallback(
    (
      location: Item,
      files: readonly File[],
      source: "drop" | "paste"
    ): boolean => {
      if (!onImportDroppedFiles || gridWriteLocked || files.length === 0) {
        return false
      }
      const current = getCellContent(location)
      if (
        current.kind !== GridCellKind.Custom ||
        (current.data as { kind?: unknown }).kind !== "eidos-file-file-cell" ||
        current.readonly === true
      ) {
        return false
      }
      void onImportDroppedFiles([...files], source)
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
          onCellEditedWithRetarget(location, {
            ...fileCell,
            copyData: encodeEidosFileValues(entries),
            data: {
              ...fileCell.data,
              entries,
            },
          })
        })
        .catch((error) => onError?.(error))
      return true
    },
    [
      getCellContent,
      gridWriteLocked,
      onCellEditedWithRetarget,
      onError,
      onImportDroppedFiles,
    ]
  )
  const onDrop = useCallback<NonNullable<DataEditorProps["onDrop"]>>(
    (location, transfer) => {
      setFileDropHighlights([])
      if (!transfer) return
      importFilesIntoAttachmentCell(
        location,
        Array.from(transfer.files),
        "drop"
      )
    },
    [importFilesIntoAttachmentCell]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || !onImportDroppedFiles) return
    const ownerDocument = container.ownerDocument
    const onPasteFiles = (event: ClipboardEvent) => {
      const target = event.target
      const NodeConstructor = ownerDocument.defaultView?.Node
      const targetIsInsideGrid =
        NodeConstructor !== undefined &&
        target instanceof NodeConstructor &&
        container.contains(target)
      if (
        target !== ownerDocument.body &&
        target !== ownerDocument.documentElement &&
        !targetIsInsideGrid
      ) {
        return
      }
      const files = event.clipboardData?.files
      if (!files || files.length === 0) return
      const cell = history.gridSelection?.current?.cell
      if (!cell) return
      if (!importFilesIntoAttachmentCell(cell, Array.from(files), "paste"))
        return
      event.preventDefault()
    }
    ownerDocument.addEventListener("paste", onPasteFiles, true)
    return () => ownerDocument.removeEventListener("paste", onPasteFiles, true)
  }, [
    history.gridSelection,
    importFilesIntoAttachmentCell,
    onImportDroppedFiles,
  ])

  useEffect(() => {
    history.reset()
  }, [history.reset, reloadToken, table.table.id])

  const onCellsEdited = useCallback<
    NonNullable<DataEditorProps["onCellsEdited"]>
  >(
    (edits) => {
      const retargeted = edits.flatMap((edit) => {
        const target = retargetEditedCellLocation(edit.location, edit.value)
        return target ? [{ cell: target, newValue: edit.value }] : []
      })
      history.onCellsEdited(retargeted)
      return true
    },
    [history.onCellsEdited, retargetEditedCellLocation]
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

  const presentCellMenu = useCallback(
    (
      fieldIndex: number,
      rowIndex: number,
      bounds: Rectangle,
      point?: { x: number; y: number },
      openedFromKeyboard = false
    ) => {
      const field = fields[fieldIndex]
      const row = rowsRef.current.get(rowIndex)
      if (!field || !row) return
      cellMenuOpenedFromKeyboardRef.current = openedFromKeyboard
      setFieldMenu(null)
      setColumnStatMenu(null)
      setCellMenu({
        bounds,
        field,
        fieldIndex,
        point: point ?? {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
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

  const onCellContextMenu = useCallback<
    NonNullable<DataEditorProps["onCellContextMenu"]>
  >(
    ([fieldIndex, rowIndex], event) => {
      const field = fields[fieldIndex]
      const row = rowsRef.current.get(rowIndex)
      if (!field || !row) return
      event.preventDefault()
      presentCellMenu(fieldIndex, rowIndex, event.bounds, {
        x:
          event.bounds.x +
          Math.min(event.bounds.width, Math.max(0, event.localEventX)),
        y:
          event.bounds.y +
          Math.min(event.bounds.height, Math.max(0, event.localEventY)),
      })
    },
    [fields, presentCellMenu]
  )

  const markExplicitDraftLeave = useCallback(() => {
    followInteractionRevisionRef.current += 1
    setPendingDraftFollow(null)
    if (draftRowPinsRef.current.size === 0) return
    explicitDraftLeaveRef.current = true
    window.setTimeout(() => {
      explicitDraftLeaveRef.current = false
    }, 0)
  }, [])

  // Capture the shortcut before Glide handles primary+Enter as a navigation
  // command. Calling its public append API preserves the same optimistic row,
  // scrolling, selection, and editor-opening behavior as the trailing row.
  const onGridContainerKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
        ].includes(event.key)
      ) {
        markExplicitDraftLeave()
      }
      if (gridWriteLocked) return
      const bindings = keyboardShortcuts?.newRecord ?? [
        "Meta+Enter",
        "Control+Enter",
      ]
      if (
        !bindings.some((binding) =>
          eidosFileKeyboardEventMatchesBinding(event, binding)
        )
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      void gridRef.current?.appendRow(newRecordTargetColumn, true)
    },
    [
      gridWriteLocked,
      keyboardShortcuts?.newRecord,
      markExplicitDraftLeave,
      newRecordTargetColumn,
    ]
  )

  // Keyboard equivalent of a right click (Shift+F10 / the Menu key): opens
  // the cell menu for the focused cell or the first selected row, so row
  // actions like Delete stay reachable without a pointer.
  const onGridContainerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const bindings = keyboardShortcuts?.openCellActions ?? ["Shift+F10"]
      const isContextMenuKey =
        event.key === "ContextMenu" ||
        bindings.some((binding) =>
          eidosFileKeyboardEventMatchesBinding(event, binding)
        )
      if (!isContextMenuKey) return
      const selection = gridSelectionRef.current
      let target: Item | null = selection?.current?.cell ?? null
      if (!target && selection && selection.rows.length > 0) {
        const firstRow = selection.rows.first()
        if (firstRow !== undefined) target = [0, firstRow]
      }
      if (!target) return
      const bounds = gridRef.current?.getBounds?.(target[0], target[1])
      if (!bounds) return
      event.preventDefault()
      presentCellMenu(target[0], target[1], bounds, undefined, true)
    },
    [keyboardShortcuts?.openCellActions, presentCellMenu]
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
    ? eidosFileRecordFieldText(cellMenu.row, cellMenu.field, timeZone)
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
      <div
        className={`relative min-w-0 flex-1 overflow-hidden ${showRowMarkers ? "" : "pl-2"}`}
        onPointerDownCapture={markExplicitDraftLeave}
        onKeyDownCapture={onGridContainerKeyDownCapture}
        onKeyDown={onGridContainerKeyDown}
      >
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
          onItemHovered={onItemHovered}
          customRenderers={EIDOS_FILE_GRID_CUSTOM_RENDERERS}
          onDragOverCell={onDragOverCell}
          onDragLeave={() => setFileDropHighlights([])}
          onDrop={onDrop}
          highlightRegions={[
            ...searchHighlightRegions,
            ...draftMoveHighlightRegions,
            ...fileDropHighlights,
          ]}
          fillHandle={!gridWriteLocked}
          gridSelection={history.gridSelection ?? undefined}
          onCellEdited={gridWriteLocked ? undefined : onCellEditedWithRetarget}
          onCellsEdited={gridWriteLocked ? undefined : onCellsEdited}
          onGridSelectionChange={handleGridSelectionChangeWithDraftRelease}
          onCellActivated={onEditFormula ? onCellActivated : undefined}
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
        {draftRowsMayReposition && draftMoveTooltip
          ? createPortal(
              <div
                role="tooltip"
                data-eidos-file-draft-move-tooltip
                className="pointer-events-none fixed z-[1000] max-w-72 rounded-md border bg-popover px-2.5 py-1.5 text-xs leading-relaxed text-popover-foreground shadow-md"
                style={{
                  left: draftMoveTooltip.left,
                  top: draftMoveTooltip.top,
                }}
              >
                {t(
                  "Pinned while editing. This record may move or leave the view afterward to match the current sort and filters."
                )}
              </div>,
              document.body
            )
          : null}
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
            if (open) return
            const shouldRestoreFocus = cellMenuOpenedFromKeyboardRef.current
            cellMenuOpenedFromKeyboardRef.current = false
            setCellMenu(null)
            if (shouldRestoreFocus) {
              // The menu has no DOM trigger for Radix to return to. Restore
              // immediately for the next keypress, then once more after its
              // deferred close-focus phase has completed.
              restoreGridFocus()
              requestAnimationFrame(restoreGridFocus)
            }
          }}
          onOpenRecord={(state) => {
            onPropertyFieldClose?.()
            setInspectedRowIndex(state.rowIndex)
          }}
          onCopyCell={copyText}
          onCopyRecordId={copyText}
          onOpenUrl={activateUrl ? openUrl : undefined}
          onDeleteRows={requestDeleteRows}
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
