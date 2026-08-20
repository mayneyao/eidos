import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowLeft, ChevronRight, LoaderCircle, RotateCcw } from "lucide-react"

import type {
  SpaceVersionColumnChange,
  SpaceVersionRowChange,
  SpaceVersionTableDiff,
  SpaceVersionTextContentDiff,
} from "../shared/contracts"
import type { ResolvedAppearance } from "./app-appearance"
import { InlineTextDiff } from "./version-text-diff"

const VERSION_ROW_DIFF_ESTIMATED_HEIGHT = 40
const VERSION_ROW_DIFF_LOAD_AHEAD = 12
const VERSION_ROW_DIFF_OVERSCAN = 8

type ColumnMode = "changed" | "all"
type RowChangeKind = "insert" | "delete" | "update"
type RowKindFilter = RowChangeKind | "all"

export type VersionTableRecordSelection = {
  index: number
  label: string
}

const ROW_KIND_FILTER_OPTIONS: Array<{
  value: RowKindFilter
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "insert", label: "Added" },
  { value: "delete", label: "Deleted" },
  { value: "update", label: "Updated" },
]

function displayValue(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return "—"
  if (typeof value === "string") return value || '""'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function isEidosMetadataJsonColumn(
  tableName: string,
  columnName: string
): boolean {
  return tableName.startsWith("eidos__") && columnName.endsWith("_json")
}

function formatJsonForDiff(value: string): string | null {
  try {
    const formatted = JSON.stringify(JSON.parse(value), null, 2)
    return formatted === undefined ? null : `${formatted}\n`
  } catch {
    return null
  }
}

function rowChangeKind(change: SpaceVersionRowChange): RowChangeKind {
  const op = change.op.toLocaleLowerCase()
  if (op === "insert" || op === "add" || op === "added") return "insert"
  if (op === "delete" || op === "remove" || op === "deleted") {
    return "delete"
  }
  return "update"
}

function estimatedRowHeight(change: SpaceVersionRowChange): number {
  return rowChangeKind(change) === "update"
    ? VERSION_ROW_DIFF_ESTIMATED_HEIGHT + 16
    : VERSION_ROW_DIFF_ESTIMATED_HEIGHT
}

function valueBefore(change: SpaceVersionRowChange, index: number): unknown {
  const kind = rowChangeKind(change)
  if (kind === "insert") return undefined
  if (change.oldValues && index in change.oldValues) {
    return change.oldValues[index]
  }
  return kind === "delete" ? change.values?.[index] : undefined
}

function valueAfter(change: SpaceVersionRowChange, index: number): unknown {
  return rowChangeKind(change) === "delete" ? undefined : change.values?.[index]
}

function columnChanged(change: SpaceVersionRowChange, index: number): boolean {
  const kind = rowChangeKind(change)
  if (kind === "insert") return valueAfter(change, index) !== undefined
  if (kind === "delete") return valueBefore(change, index) !== undefined
  return (
    displayValue(valueBefore(change, index)) !==
    displayValue(valueAfter(change, index))
  )
}

function rowIdentity(change: SpaceVersionRowChange, fallback: number) {
  const entries = Object.entries(change.key)
  if (!entries.length) {
    return { value: `Row ${fallback.toLocaleString()}`, fields: "Position" }
  }
  return {
    value: entries.map(([, value]) => displayValue(value)).join(" · "),
    fields: entries.map(([field]) => field).join(" · "),
  }
}

function Value({ value }: { value: unknown }) {
  const text = displayValue(value)
  return (
    <span
      className="version-table-value"
      data-value-kind={value === null ? "null" : typeof value}
      title={text}
    >
      {text}
    </span>
  )
}

function SchemaValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <span className="version-table-schema-empty" aria-label="Empty value" />
    )
  }
  return <Value value={value} />
}

function columnChangeLabel(change: SpaceVersionColumnChange): string {
  if (change.kind === "added") return "Added"
  if (change.kind === "deleted") return "Removed"
  return "Renamed"
}

function DiffCell({
  change,
  columnIndex,
  columnChange,
}: {
  change: SpaceVersionRowChange
  columnIndex: number
  columnChange?: SpaceVersionColumnChange | null
}) {
  const kind = rowChangeKind(change)
  const before = valueBefore(change, columnIndex)
  const after = valueAfter(change, columnIndex)
  const changed = columnChanged(change, columnIndex)

  if (columnChange?.kind === "added") {
    return (
      <td data-cell-change="column-insert" data-column-schema-change="added">
        <ins>
          <SchemaValue value={after} />
        </ins>
      </td>
    )
  }
  if (columnChange?.kind === "deleted") {
    return (
      <td data-cell-change="column-delete" data-column-schema-change="deleted">
        <del>
          <SchemaValue value={before} />
        </del>
      </td>
    )
  }
  if (columnChange?.kind === "renamed" && !changed) {
    return (
      <td data-cell-change="unchanged" data-column-schema-change="renamed">
        <SchemaValue value={after ?? before} />
      </td>
    )
  }
  if (kind === "insert") {
    return (
      <td data-cell-change="insert">
        <ins>
          <Value value={after} />
        </ins>
      </td>
    )
  }
  if (kind === "delete") {
    return (
      <td data-cell-change="delete">
        <del>
          <Value value={before} />
        </del>
      </td>
    )
  }
  if (!changed) {
    return (
      <td data-cell-change="unchanged">
        <Value value={after} />
      </td>
    )
  }
  return (
    <td data-cell-change="update">
      <span className="version-table-cell-delta">
        <del>
          <b aria-hidden="true">−</b>
          <Value value={before} />
        </del>
        <ins>
          <b aria-hidden="true">+</b>
          <Value value={after} />
        </ins>
      </span>
    </td>
  )
}

function RowChangeBadge({ change }: { change: SpaceVersionRowChange }) {
  const kind = rowChangeKind(change)
  const presentation =
    kind === "insert"
      ? { mark: "+", label: "Added" }
      : kind === "delete"
        ? { mark: "−", label: "Deleted" }
        : { mark: "~", label: "Updated" }
  return (
    <span
      className="version-table-change-badge"
      aria-label={presentation.label}
    >
      <b aria-hidden="true">{presentation.mark}</b>
      <small>{presentation.label}</small>
    </span>
  )
}

function changedFieldIndexes(
  table: SpaceVersionTableDiff,
  change: SpaceVersionRowChange
): number[] {
  return table.columns
    .map((_, index) => index)
    .filter(
      (index) =>
        Boolean(table.columnChanges?.[index]) || columnChanged(change, index)
    )
}

function preferredFieldIndex(
  table: SpaceVersionTableDiff,
  change: SpaceVersionRowChange,
  changedIndexes: number[]
): number {
  const longText = changedIndexes.find((index) =>
    [valueBefore(change, index), valueAfter(change, index)].some(
      (value) =>
        typeof value === "string" && (value.length > 80 || value.includes("\n"))
    )
  )
  if (longText !== undefined) return longText
  return (
    changedIndexes.find(
      (index) => !table.primaryKeyColumns.includes(table.columns[index]!)
    ) ??
    changedIndexes[0] ??
    (table.columns.length ? 0 : -1)
  )
}

function cellChangeLabel(
  table: SpaceVersionTableDiff,
  change: SpaceVersionRowChange,
  index: number
): string {
  const schemaChange = table.columnChanges?.[index]
  if (schemaChange) return columnChangeLabel(schemaChange)
  if (!columnChanged(change, index)) return "Unchanged"
  const kind = rowChangeKind(change)
  if (kind === "insert") return "Added"
  if (kind === "delete") return "Deleted"
  return "Changed"
}

function cellTextDiff(
  table: SpaceVersionTableDiff,
  change: SpaceVersionRowChange,
  index: number
): SpaceVersionTextContentDiff | null {
  if (!columnChanged(change, index)) return null
  const before = valueBefore(change, index)
  const after = valueAfter(change, index)
  if (
    !(
      (before === undefined || typeof before === "string") &&
      (after === undefined || typeof after === "string") &&
      (typeof before === "string" || typeof after === "string")
    )
  ) {
    return null
  }
  const column = table.columns[index]!
  let beforeContent = before
  let afterContent = after
  let extension = "txt"
  if (isEidosMetadataJsonColumn(table.name, column)) {
    const formattedBefore =
      before === undefined ? undefined : formatJsonForDiff(before)
    const formattedAfter =
      after === undefined ? undefined : formatJsonForDiff(after)
    if (formattedBefore !== null && formattedAfter !== null) {
      beforeContent = formattedBefore
      afterContent = formattedAfter
      extension = "json"
    }
  }
  const state = (value: string | undefined) =>
    value === undefined
      ? ({ state: "absent" } as const)
      : ({
          state: "utf8" as const,
          content: value,
          size: new TextEncoder().encode(value).byteLength,
        } as const)
  return {
    path: `${table.name}/${column}.${extension}`,
    before: state(beforeContent),
    after: state(afterContent),
  }
}

function defaultRecordDiffLayout(
  table: SpaceVersionTableDiff,
  change: SpaceVersionRowChange,
  index: number
): "split" | "unified" {
  return cellTextDiff(table, change, index)?.path.endsWith(".json")
    ? "split"
    : "unified"
}

function FullCellValue({
  label,
  value,
  tone,
}: {
  label: string
  value: unknown
  tone: "before" | "after" | "current"
}) {
  return (
    <section className="version-row-cell-value" data-value-version={tone}>
      <span>{label}</span>
      <pre>{displayValue(value)}</pre>
    </section>
  )
}

function VersionRowDiffDetail({
  table,
  change,
  fallbackIndex,
  fieldMode,
  diffLayout,
  softWrap,
  theme,
  onDefaultDiffLayoutChange,
}: {
  table: SpaceVersionTableDiff
  change: SpaceVersionRowChange
  fallbackIndex: number
  fieldMode: ColumnMode
  diffLayout: "split" | "unified"
  softWrap: boolean
  theme: ResolvedAppearance
  onDefaultDiffLayoutChange(layout: "split" | "unified"): void
}) {
  const changedIndexes = useMemo(
    () => changedFieldIndexes(table, change),
    [change, table]
  )
  const changedIndexSet = useMemo(
    () => new Set(changedIndexes),
    [changedIndexes]
  )
  const visibleFieldIndexes = useMemo(
    () =>
      fieldMode === "changed"
        ? changedIndexes
        : table.columns.map((_, index) => index),
    [changedIndexes, fieldMode, table.columns]
  )
  const preferredIndex = preferredFieldIndex(table, change, changedIndexes)
  const [activeIndex, setActiveIndex] = useState(preferredIndex)
  useEffect(() => {
    if (!visibleFieldIndexes.includes(activeIndex)) {
      setActiveIndex(preferredIndex)
    }
  }, [activeIndex, preferredIndex, visibleFieldIndexes])
  const identity = rowIdentity(change, fallbackIndex)
  const activeColumn = table.columns[activeIndex]
  const before = valueBefore(change, activeIndex)
  const after = valueAfter(change, activeIndex)
  const changed = activeIndex >= 0 && columnChanged(change, activeIndex)
  const textDiff =
    activeIndex >= 0 ? cellTextDiff(table, change, activeIndex) : null

  useEffect(() => {
    onDefaultDiffLayoutChange(
      defaultRecordDiffLayout(table, change, activeIndex)
    )
  }, [activeIndex, change, onDefaultDiffLayoutChange, table])

  return (
    <div
      className="version-table-row-detail"
      data-version-table-row-detail="true"
    >
      {activeColumn ? (
        <div className="version-row-detail-body">
          <nav aria-label={`Fields in row ${identity.value}`}>
            <header>
              <strong>Field</strong>
              <span>{visibleFieldIndexes.length.toLocaleString()}</span>
            </header>
            <div>
              {visibleFieldIndexes.map((index) => {
                const column = table.columns[index]!
                const fieldChanged = changedIndexSet.has(index)
                const afterValue = valueAfter(change, index)
                const preview = fieldChanged
                  ? afterValue === undefined
                    ? valueBefore(change, index)
                    : afterValue
                  : afterValue
                return (
                  <button
                    key={`${column}-${index}`}
                    type="button"
                    aria-pressed={activeIndex === index}
                    data-field-changed={fieldChanged ? "true" : "false"}
                    onClick={() => setActiveIndex(index)}
                  >
                    <span>
                      <strong>{column}</strong>
                      <small>{cellChangeLabel(table, change, index)}</small>
                    </span>
                    <code title={displayValue(preview)}>
                      {displayValue(preview)}
                    </code>
                  </button>
                )
              })}
            </div>
          </nav>
          <section
            className="version-row-cell-detail"
            data-text-diff={textDiff ? "true" : "false"}
            aria-label={`Changes for field ${activeColumn}`}
          >
            {textDiff ? (
              <div
                className="version-row-cell-text-diff"
                data-version-cell-text-diff
              >
                <InlineTextDiff
                  content={textDiff}
                  theme={theme}
                  title={activeColumn}
                  fixedLayout={diffLayout}
                  fixedSoftWrap={softWrap}
                />
              </div>
            ) : changed ? (
              <>
                <header>
                  <div>
                    <strong>{activeColumn}</strong>
                    {table.primaryKeyColumns.includes(activeColumn) ? (
                      <small>Key</small>
                    ) : null}
                  </div>
                  <span data-field-change="changed">
                    {cellChangeLabel(table, change, activeIndex)}
                  </span>
                </header>
                <div className="version-row-cell-comparison">
                  <FullCellValue label="Before" value={before} tone="before" />
                  <FullCellValue label="After" value={after} tone="after" />
                </div>
              </>
            ) : (
              <>
                <header>
                  <div>
                    <strong>{activeColumn}</strong>
                    {table.primaryKeyColumns.includes(activeColumn) ? (
                      <small>Key</small>
                    ) : null}
                  </div>
                  <span data-field-change="unchanged">Unchanged</span>
                </header>
                <div className="version-row-cell-comparison">
                  <FullCellValue
                    label="Value"
                    value={after === undefined ? before : after}
                    tone="current"
                  />
                </div>
              </>
            )}
          </section>
        </div>
      ) : (
        <div className="version-table-diff-empty">
          This changed record has no reported fields.
        </div>
      )}
    </div>
  )
}

function changedRowsSummary(table: SpaceVersionTableDiff): string {
  const loaded = table.changes.length
  const total = table.summary
    ? table.summary.inserts + table.summary.deletes + table.summary.updates
    : loaded
  if (table.hasMore) {
    return table.summary
      ? `${loaded.toLocaleString()} of ${total.toLocaleString()} changed rows`
      : `${loaded.toLocaleString()} changed rows loaded`
  }
  return `${total.toLocaleString()} changed ${total === 1 ? "row" : "rows"}`
}

function filteredRowsSummary(
  table: SpaceVersionTableDiff,
  kindFilter: RowKindFilter,
  visibleCount: number,
  kindTotal: number
): string {
  const base = changedRowsSummary(table)
  if (kindFilter === "all") return base
  const label =
    kindFilter === "insert"
      ? "added"
      : kindFilter === "delete"
        ? "deleted"
        : "updated"
  return `${visibleCount.toLocaleString()} of ${kindTotal.toLocaleString()} ${label} rows`
}

export function VersionTableDiff({
  table,
  theme = "light",
  showHeading = true,
  identityKey = table.name,
  onLoadMore,
  loadingMore = false,
  loadError,
  onRetryLoad,
  recordSelection,
  onRecordSelectionChange,
}: {
  table: SpaceVersionTableDiff
  theme?: ResolvedAppearance
  showHeading?: boolean
  identityKey?: string
  onLoadMore?(): Promise<boolean>
  loadingMore?: boolean
  loadError?: string
  onRetryLoad?(): void
  recordSelection?: VersionTableRecordSelection | null
  onRecordSelectionChange?(selection: VersionTableRecordSelection | null): void
}) {
  const [columnMode, setColumnMode] = useState<ColumnMode>("changed")
  const [fieldMode, setFieldMode] = useState<ColumnMode>("changed")
  const [recordDiffLayout, setRecordDiffLayout] = useState<"split" | "unified">(
    "unified"
  )
  const recordDiffLayoutIsManualRef = useRef(false)
  const [recordSoftWrap, setRecordSoftWrap] = useState(true)
  const [kindFilter, setKindFilter] = useState<RowKindFilter>("all")
  const [internalRecordSelection, setInternalRecordSelection] =
    useState<VersionTableRecordSelection | null>(null)
  const recordSelectionIsControlled = recordSelection !== undefined
  const activeRecordSelection = recordSelectionIsControlled
    ? recordSelection
    : internalRecordSelection
  const selectedRowIndex = activeRecordSelection?.index ?? null
  const setRecordSelection = useCallback(
    (selection: VersionTableRecordSelection | null) => {
      if (!recordSelectionIsControlled) {
        setInternalRecordSelection(selection)
      }
      onRecordSelectionChange?.(selection)
    },
    [onRecordSelectionChange, recordSelectionIsControlled]
  )
  const [automaticLoadingPaused, setAutomaticLoadingPaused] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const loadInFlightRef = useRef(false)
  const canLoadMore = table.hasMore === true && Boolean(onLoadMore)
  const selectedChange =
    selectedRowIndex === null ? null : (table.changes[selectedRowIndex] ?? null)
  const selectedIdentity =
    selectedChange && selectedRowIndex !== null
      ? rowIdentity(selectedChange, selectedRowIndex + 1)
      : null
  const selectedRecordKey =
    selectedRowIndex === null ? null : `${identityKey}:${selectedRowIndex}`
  const applyDefaultRecordDiffLayout = useCallback(
    (layout: "split" | "unified") => {
      if (!recordDiffLayoutIsManualRef.current) {
        setRecordDiffLayout(layout)
      }
    },
    []
  )
  const kindCounts = useMemo(() => {
    // The backend summary is authoritative for the whole change set; counts
    // derived from loaded rows would shift as pages stream in and hide the
    // kinds that only exist in unloaded pages.
    if (table.summary) {
      return {
        insert: table.summary.inserts,
        delete: table.summary.deletes,
        update: table.summary.updates,
      }
    }
    const counts: Record<RowChangeKind, number> = {
      insert: 0,
      delete: 0,
      update: 0,
    }
    table.changes.forEach((change) => {
      counts[rowChangeKind(change)] += 1
    })
    return counts
  }, [table.changes, table.summary])
  const visibleChanges = useMemo(
    () =>
      kindFilter === "all"
        ? table.changes
        : table.changes.filter(
            (change) => rowChangeKind(change) === kindFilter
          ),
    [kindFilter, table.changes]
  )
  const changedColumnIndexes = useMemo(
    () =>
      table.columns
        .map((_, index) => index)
        .filter(
          (index) =>
            Boolean(table.columnChanges?.[index]) ||
            visibleChanges.some((change) => columnChanged(change, index))
        ),
    [visibleChanges, table.columnChanges, table.columns]
  )
  const visibleColumnIndexes =
    columnMode === "all" || changedColumnIndexes.length === 0
      ? table.columns.map((_, index) => index)
      : changedColumnIndexes
  const columnsAreFiltered = visibleColumnIndexes.length < table.columns.length
  const rowVirtualizer = useVirtualizer({
    count: visibleChanges.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: (index) => estimatedRowHeight(visibleChanges[index]!),
    getItemKey: (index) => `${identityKey}:${kindFilter}:${index}`,
    initialRect: { width: 1024, height: 640 },
    overscan: VERSION_ROW_DIFF_OVERSCAN,
    useAnimationFrameWithResizeObserver: true,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const fallbackRows = useMemo(() => {
    let start = 0
    return visibleChanges.slice(0, 24).map((change, index) => {
      const size = estimatedRowHeight(change)
      const row = {
        key: `${identityKey}:${kindFilter}:${index}`,
        index,
        start,
        end: start + size,
      }
      start += size
      return row
    })
  }, [identityKey, kindFilter, visibleChanges])
  const renderedRows = virtualRows.length > 0 ? virtualRows : fallbackRows
  const firstVirtualRow = renderedRows[0]
  const lastVirtualRow = renderedRows.at(-1)
  const paddingTop = firstVirtualRow?.start ?? 0
  const paddingBottom = Math.max(
    0,
    rowVirtualizer.getTotalSize() - (lastVirtualRow?.end ?? 0)
  )

  useEffect(() => {
    setColumnMode("changed")
    setFieldMode("changed")
    setRecordDiffLayout("unified")
    recordDiffLayoutIsManualRef.current = false
    setRecordSoftWrap(true)
    setKindFilter("all")
    if (!recordSelectionIsControlled) setInternalRecordSelection(null)
    setAutomaticLoadingPaused(false)
    loadInFlightRef.current = false
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0
      viewportRef.current.scrollLeft = 0
    }
  }, [identityKey, recordSelectionIsControlled])

  useEffect(() => {
    recordDiffLayoutIsManualRef.current = false
    if (!selectedChange) return
    const preferredIndex = preferredFieldIndex(
      table,
      selectedChange,
      changedFieldIndexes(table, selectedChange)
    )
    setRecordDiffLayout(
      defaultRecordDiffLayout(table, selectedChange, preferredIndex)
    )
  }, [selectedRecordKey])

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0
    }
  }, [kindFilter])

  useEffect(() => {
    setAutomaticLoadingPaused(false)
  }, [table.changes.length])

  const loadNextBatch = useCallback(async () => {
    if (
      !canLoadMore ||
      !onLoadMore ||
      loadInFlightRef.current ||
      automaticLoadingPaused
    ) {
      return
    }
    loadInFlightRef.current = true
    setAutomaticLoadingPaused(false)
    try {
      if (!(await onLoadMore())) setAutomaticLoadingPaused(true)
    } catch {
      setAutomaticLoadingPaused(true)
    } finally {
      loadInFlightRef.current = false
    }
  }, [automaticLoadingPaused, canLoadMore, onLoadMore])

  useEffect(() => {
    // An empty or short filtered list means the last virtual row sits at the
    // end (or no row exists at all), so pages keep streaming until matching
    // rows appear or the change set is exhausted.
    if (
      lastVirtualRow !== undefined &&
      lastVirtualRow.index < visibleChanges.length - VERSION_ROW_DIFF_LOAD_AHEAD
    ) {
      return
    }
    void loadNextBatch()
  }, [lastVirtualRow?.index, loadNextBatch, visibleChanges.length])

  return (
    <section className="version-table-diff" data-version-table-diff>
      {showHeading ? <h4>{table.name}</h4> : null}
      <header className="version-inspector-diff-bar version-text-diff-toolbar version-table-diff-toolbar">
        {selectedChange && selectedIdentity ? (
          <>
            {!recordSelectionIsControlled ? (
              <button
                type="button"
                className="version-table-diff-back"
                aria-label="Back to table changes"
                onClick={() => setRecordSelection(null)}
              >
                <ArrowLeft aria-hidden="true" />
                Table changes
              </button>
            ) : null}
            <div
              className="version-table-diff-toolbar-summary"
              aria-live="polite"
            >
              <strong>Record changes</strong>
              <span title={selectedIdentity.fields}>
                {selectedIdentity.value}
              </span>
              <span>
                {changedFieldIndexes(
                  table,
                  selectedChange
                ).length.toLocaleString()}{" "}
                of {table.columns.length.toLocaleString()} fields changed
              </span>
            </div>
            <div
              className="version-text-diff-display-controls"
              aria-label="Record diff display"
            >
              <div className="version-diff-wrap-control">
                <span>Wrap</span>
                <button
                  type="button"
                  role="switch"
                  className="version-diff-wrap-switch"
                  aria-label="Wrap lines"
                  aria-checked={recordSoftWrap}
                  onClick={() => setRecordSoftWrap((current) => !current)}
                >
                  <span />
                </button>
              </div>
              <div
                className="version-text-diff-layout"
                aria-label="Record diff layout"
              >
                <button
                  type="button"
                  aria-pressed={recordDiffLayout === "split"}
                  onClick={() => {
                    recordDiffLayoutIsManualRef.current = true
                    setRecordDiffLayout("split")
                  }}
                >
                  Split
                </button>
                <button
                  type="button"
                  aria-pressed={recordDiffLayout === "unified"}
                  onClick={() => {
                    recordDiffLayoutIsManualRef.current = true
                    setRecordDiffLayout("unified")
                  }}
                >
                  Unified
                </button>
              </div>
            </div>
            <div
              className="version-text-diff-layout"
              aria-label="Visible record fields"
            >
              <button
                type="button"
                aria-pressed={fieldMode === "changed"}
                onClick={() => setFieldMode("changed")}
              >
                Changed
              </button>
              <button
                type="button"
                aria-pressed={fieldMode === "all"}
                onClick={() => setFieldMode("all")}
              >
                All
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="version-table-diff-toolbar-summary"
              aria-live="polite"
            >
              <strong>Row changes</strong>
              <span>
                {filteredRowsSummary(
                  table,
                  kindFilter,
                  visibleChanges.length,
                  kindFilter === "all" ? 0 : kindCounts[kindFilter]
                )}
              </span>
              <span>
                {visibleColumnIndexes.length.toLocaleString()} of{" "}
                {table.columns.length.toLocaleString()} columns
              </span>
              {loadingMore ? (
                <span data-load-state="loading">
                  <LoaderCircle className="spin" aria-hidden="true" />
                  Loading…
                </span>
              ) : loadError && onRetryLoad ? (
                <button
                  type="button"
                  className="version-table-diff-load-retry"
                  onClick={onRetryLoad}
                  aria-label={`Retry loading rows: ${loadError}`}
                  title={loadError}
                >
                  <RotateCcw aria-hidden="true" />
                  Retry
                </button>
              ) : null}
            </div>
            <div
              className="version-text-diff-layout version-table-kind-filter"
              aria-label="Row change types"
            >
              {ROW_KIND_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={kindFilter === option.value}
                  onClick={() => setKindFilter(option.value)}
                >
                  {option.label}
                  {option.value !== "all" ? (
                    <small>{kindCounts[option.value].toLocaleString()}</small>
                  ) : null}
                </button>
              ))}
            </div>
            <div
              className="version-text-diff-layout"
              aria-label="Visible table columns"
              title={
                columnsAreFiltered || columnMode === "all"
                  ? undefined
                  : "All columns changed"
              }
            >
              <button
                type="button"
                aria-pressed={columnMode === "changed"}
                disabled={!columnsAreFiltered && columnMode === "changed"}
                onClick={() => setColumnMode("changed")}
              >
                Changed
              </button>
              <button
                type="button"
                aria-pressed={columnMode === "all"}
                disabled={!columnsAreFiltered && columnMode === "changed"}
                onClick={() => setColumnMode("all")}
              >
                All
              </button>
            </div>
          </>
        )}
      </header>

      {selectedChange && selectedRowIndex !== null ? (
        <VersionRowDiffDetail
          key={`${identityKey}:${selectedRowIndex}`}
          table={table}
          change={selectedChange}
          fallbackIndex={selectedRowIndex + 1}
          fieldMode={fieldMode}
          diffLayout={recordDiffLayout}
          softWrap={recordSoftWrap}
          theme={theme}
          onDefaultDiffLayoutChange={applyDefaultRecordDiffLayout}
        />
      ) : visibleChanges.length ? (
        <div
          ref={viewportRef}
          className="version-table-diff-viewport"
          data-scrollable={visibleChanges.length > 12 || canLoadMore}
          onScroll={(event) => {
            const viewport = event.currentTarget
            const loadThreshold = Math.max(viewport.clientHeight, 320)
            if (
              viewport.scrollTop + viewport.clientHeight >=
              viewport.scrollHeight - loadThreshold
            ) {
              void loadNextBatch()
            }
          }}
        >
          <table>
            <caption>Changed rows in {table.name}</caption>
            <thead>
              <tr>
                <th className="version-table-change-column" scope="col">
                  Change
                </th>
                <th className="version-table-key-column" scope="col">
                  Row
                </th>
                {visibleColumnIndexes.map((index) => {
                  const columnChange = table.columnChanges?.[index]
                  return (
                    <th
                      key={`${table.columns[index]}-${index}`}
                      scope="col"
                      data-column-schema-change={columnChange?.kind}
                    >
                      <span>{table.columns[index]}</span>
                      {columnChange ? (
                        <small data-schema-change={columnChange.kind}>
                          {columnChangeLabel(columnChange)}
                        </small>
                      ) : null}
                      {table.primaryKeyColumns.includes(
                        table.columns[index]!
                      ) ? (
                        <small>Key</small>
                      ) : null}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {paddingTop > 0 ? (
                <tr className="version-table-virtual-spacer" aria-hidden="true">
                  <td
                    colSpan={visibleColumnIndexes.length + 2}
                    style={{ height: paddingTop }}
                  />
                </tr>
              ) : null}
              {renderedRows.map((virtualRow) => {
                const change = visibleChanges[virtualRow.index]!
                const kind = rowChangeKind(change)
                const identity = rowIdentity(change, virtualRow.index + 1)
                const sourceIndex = table.changes.indexOf(change)
                return (
                  <tr
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="version-table-diff-row"
                    data-row-change={kind}
                  >
                    <th className="version-table-change-column" scope="row">
                      <RowChangeBadge change={change} />
                    </th>
                    <td className="version-table-key-column">
                      <button
                        type="button"
                        className="version-table-row-open"
                        aria-label={`Open record changes for ${identity.value}`}
                        title="Open record changes"
                        onClick={() => {
                          setFieldMode("changed")
                          setRecordSoftWrap(true)
                          setRecordSelection({
                            index: sourceIndex,
                            label: identity.value,
                          })
                        }}
                      >
                        <span>
                          <strong title={identity.value}>
                            {identity.value}
                          </strong>
                          <small title={identity.fields}>
                            {identity.fields}
                          </small>
                        </span>
                        <ChevronRight aria-hidden="true" />
                      </button>
                    </td>
                    {visibleColumnIndexes.map((index) => (
                      <DiffCell
                        key={`${table.columns[index]}-${index}`}
                        change={change}
                        columnIndex={index}
                        columnChange={table.columnChanges?.[index]}
                      />
                    ))}
                  </tr>
                )
              })}
              {paddingBottom > 0 ? (
                <tr className="version-table-virtual-spacer" aria-hidden="true">
                  <td
                    colSpan={visibleColumnIndexes.length + 2}
                    style={{ height: paddingBottom }}
                  />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : table.changes.length ? (
        <div className="version-table-diff-empty">
          No{" "}
          {kindFilter === "insert"
            ? "added"
            : kindFilter === "delete"
              ? "deleted"
              : "updated"}{" "}
          rows among the loaded changes.
        </div>
      ) : (
        <div className="version-table-diff-empty">
          No row-level changes were returned for this table.
        </div>
      )}
    </section>
  )
}
