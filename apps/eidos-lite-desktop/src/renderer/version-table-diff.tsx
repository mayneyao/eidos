import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { LoaderCircle, RotateCcw } from "lucide-react"

import type {
  SpaceVersionRowChange,
  SpaceVersionTableDiff,
} from "../shared/contracts"

const VERSION_ROW_DIFF_ESTIMATED_HEIGHT = 40
const VERSION_ROW_DIFF_LOAD_AHEAD = 12
const VERSION_ROW_DIFF_OVERSCAN = 8

type ColumnMode = "changed" | "all"
type RowChangeKind = "insert" | "delete" | "update"
type RowKindFilter = RowChangeKind | "all"

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

function DiffCell({
  change,
  columnIndex,
}: {
  change: SpaceVersionRowChange
  columnIndex: number
}) {
  const kind = rowChangeKind(change)
  const before = valueBefore(change, columnIndex)
  const after = valueAfter(change, columnIndex)
  const changed = columnChanged(change, columnIndex)

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
  showHeading = true,
  identityKey = table.name,
  onLoadMore,
  loadingMore = false,
  loadError,
  onRetryLoad,
}: {
  table: SpaceVersionTableDiff
  showHeading?: boolean
  identityKey?: string
  onLoadMore?(): Promise<boolean>
  loadingMore?: boolean
  loadError?: string
  onRetryLoad?(): void
}) {
  const [columnMode, setColumnMode] = useState<ColumnMode>("changed")
  const [kindFilter, setKindFilter] = useState<RowKindFilter>("all")
  const [automaticLoadingPaused, setAutomaticLoadingPaused] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const loadInFlightRef = useRef(false)
  const canLoadMore = table.hasMore === true && Boolean(onLoadMore)
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
        .filter((index) =>
          visibleChanges.some((change) => columnChanged(change, index))
        ),
    [visibleChanges, table.columns]
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
    setKindFilter("all")
    setAutomaticLoadingPaused(false)
    loadInFlightRef.current = false
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0
      viewportRef.current.scrollLeft = 0
    }
  }, [identityKey])

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
        <div className="version-table-diff-toolbar-summary" aria-live="polite">
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
        {columnsAreFiltered || columnMode === "all" ? (
          <div
            className="version-text-diff-layout"
            aria-label="Visible table columns"
          >
            <button
              type="button"
              aria-pressed={columnMode === "changed"}
              onClick={() => setColumnMode("changed")}
            >
              Changed
            </button>
            <button
              type="button"
              aria-pressed={columnMode === "all"}
              onClick={() => setColumnMode("all")}
            >
              All columns
            </button>
          </div>
        ) : (
          <span className="version-table-diff-toolbar-note">
            All columns changed
          </span>
        )}
      </header>

      {visibleChanges.length ? (
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
                {visibleColumnIndexes.map((index) => (
                  <th key={`${table.columns[index]}-${index}`} scope="col">
                    <span>{table.columns[index]}</span>
                    {table.primaryKeyColumns.includes(table.columns[index]!) ? (
                      <small>Key</small>
                    ) : null}
                  </th>
                ))}
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
                      <span title={identity.value}>{identity.value}</span>
                      <small title={identity.fields}>{identity.fields}</small>
                    </td>
                    {visibleColumnIndexes.map((index) => (
                      <DiffCell
                        key={`${table.columns[index]}-${index}`}
                        change={change}
                        columnIndex={index}
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
