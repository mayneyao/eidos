import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowMutationResult,
  BaseRowPage,
  BaseRelationValue,
  BaseSqlPrimitive,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

import { BaseRecordCard } from "./base-record-card"
import {
  createBaseRecordCardLayout,
  type BaseRecordCardLayout,
} from "./base-record-card-layout"
import { BaseRecordDeleteDialog } from "./base-record-delete-dialog"
import { BaseRecordInspector } from "./base-record-inspector"
import {
  mergeRowWindowPage,
  requestForPrefetchedRowWindow,
  rowFromWindow,
  type BaseRowWindow,
  type BaseRowWindowMergeMode,
} from "./base-row-window"
import { useBaseBoundedVirtualizer } from "./base-virtual-scroll"
import { orderedBaseFields } from "./base-view-layout"

const GALLERY_PAGE_SIZE = 100
const GALLERY_MAX_WINDOW_ROWS = 300
const GALLERY_GAP = 12
const GALLERY_HORIZONTAL_PADDING = 32
const GALLERY_OVERSCAN_ROWS = 2
const GALLERY_PREFETCH_ROWS = Math.floor(GALLERY_PAGE_SIZE / 2)

function galleryVirtualRowKey(index: number): string {
  return `gallery-row:${index}`
}

function galleryCardWidth(view: BaseViewInfo): number {
  const size = view.properties?.cardSize
  if (size === "small") return 220
  if (size === "large") return 340
  return 280
}

function estimatedGalleryCardHeight(layout: BaseRecordCardLayout): number {
  const visibleFieldCount = Math.min(layout.fields.length, layout.fieldLimit)
  return 72 + (layout.coverField ? 144 : 0) + visibleFieldCount * 32
}

interface BaseGalleryVirtualRowProps {
  rowWindow: BaseRowWindow
  globalRowIndex: number
  virtualIndex: number
  offset: number
  columnCount: number
  total: number
  fields: BaseFieldInfo[]
  view: BaseViewInfo
  layout: BaseRecordCardLayout
  focusedRowId: string | null
  canDelete: boolean
  measureElement: (node: HTMLDivElement | null | undefined) => void
  onOpen: (row: BaseRow) => void
  onDelete: (row: BaseRow) => void
}

function galleryVirtualRowPropsEqual(
  previous: BaseGalleryVirtualRowProps,
  next: BaseGalleryVirtualRowProps
): boolean {
  if (
    previous.globalRowIndex !== next.globalRowIndex ||
    previous.virtualIndex !== next.virtualIndex ||
    previous.offset !== next.offset ||
    previous.columnCount !== next.columnCount ||
    previous.total !== next.total ||
    previous.fields !== next.fields ||
    previous.view !== next.view ||
    previous.layout !== next.layout ||
    previous.canDelete !== next.canDelete ||
    previous.measureElement !== next.measureElement ||
    previous.onOpen !== next.onOpen ||
    previous.onDelete !== next.onDelete
  ) {
    return false
  }
  if (
    previous.rowWindow === next.rowWindow &&
    previous.focusedRowId === next.focusedRowId
  ) {
    return true
  }

  const start = next.globalRowIndex * next.columnCount
  const slotCount = Math.min(next.columnCount, next.total - start)
  for (let columnIndex = 0; columnIndex < slotCount; columnIndex += 1) {
    const absoluteIndex = start + columnIndex
    const previousRow = rowFromWindow(previous.rowWindow, absoluteIndex)
    const nextRow = rowFromWindow(next.rowWindow, absoluteIndex)
    if (previousRow !== nextRow) return false
    if (!nextRow) continue
    const rowId = String(nextRow._id)
    if ((previous.focusedRowId === rowId) !== (next.focusedRowId === rowId)) {
      return false
    }
  }
  return true
}

const BaseGalleryVirtualRow = memo(function BaseGalleryVirtualRow({
  rowWindow,
  globalRowIndex,
  virtualIndex,
  offset,
  columnCount,
  total,
  fields,
  view,
  layout,
  focusedRowId,
  canDelete,
  measureElement,
  onOpen,
  onDelete,
}: BaseGalleryVirtualRowProps) {
  const start = globalRowIndex * columnCount
  return (
    <div
      ref={measureElement}
      role="presentation"
      className="absolute left-0 top-0 grid w-full items-start gap-3 [contain:layout_style]"
      data-index={globalRowIndex}
      data-base-virtual-index={virtualIndex}
      style={{
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        transform: `translate3d(0, ${offset}px, 0)`,
      }}
    >
      {Array.from(
        { length: Math.min(columnCount, total - start) },
        (_, columnIndex) => {
          const absoluteIndex = start + columnIndex
          const row = rowFromWindow(rowWindow, absoluteIndex)
          return row ? (
            <BaseRecordCard
              key={String(row._id)}
              row={row}
              fields={fields}
              view={view}
              layout={layout}
              role="listitem"
              positionInSet={absoluteIndex + 1}
              setSize={total}
              focused={focusedRowId === String(row._id)}
              onOpen={onOpen}
              onDelete={canDelete ? onDelete : undefined}
            />
          ) : (
            <div
              key={`gallery-placeholder-${absoluteIndex}`}
              data-base-gallery-placeholder
              className="min-h-24 rounded-lg border bg-muted/20"
              aria-hidden="true"
            />
          )
        }
      )}
    </div>
  )
}, galleryVirtualRowPropsEqual)

export const BaseGalleryView = memo(function BaseGalleryView({
  table,
  view,
  disabled = false,
  reloadToken = 0,
  searchResultIndex = null,
  loadPage,
  onCellEdit,
  onImportFiles,
  onImportDroppedFiles,
  onSearchRelation,
  onDeleteRow,
  onOpenFile,
  onRevealFile,
  onRowCountChange,
  onError,
  sidePanel,
}: {
  table: BaseTableSnapshot
  view: BaseViewInfo
  disabled?: boolean
  reloadToken?: number
  searchResultIndex?: number | null
  loadPage: (
    offset: number,
    limit: number,
    totalHint?: number,
    cursor?: string
  ) => Promise<BaseRowPage>
  onCellEdit?: (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => Promise<BaseRowMutationResult>
  onImportFiles?: () => Promise<string[]>
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>
  onSearchRelation?: (
    field: BaseFieldInfo,
    query: string
  ) => Promise<BaseRelationValue[]>
  onDeleteRow?: (row: BaseRow) => Promise<void>
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => Promise<void> | void
  onRowCountChange?: (rowCount: number | null) => void
  onError?: (error: unknown) => void
  sidePanel?: ReactNode
}) {
  const generationRef = useRef(0)
  const scopeRef = useRef("")
  const requestRef = useRef<{ generation: number; offset: number } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const previousColumnCountRef = useRef<number | null>(null)
  const previousLayoutFieldsRef = useRef<BaseFieldInfo[] | null>(null)
  const previousViewPropertiesRef = useRef<BaseViewInfo["properties"]>(null)
  const visibleAnchorIndexRef = useRef(0)
  const skipAnchorCaptureRef = useRef(false)
  const relayoutFrameRef = useRef<number | null>(null)
  const relayoutGenerationRef = useRef(0)
  const relayoutCleanupRef = useRef<(() => void) | null>(null)
  const suppressRelayoutScrollAdjustmentRef = useRef(() => false)
  const [containerWidth, setContainerWidth] = useState(1024)
  const [rowWindow, setRowWindow] = useState<BaseRowWindow>({
    rows: [] as BaseRow[],
    startOffset: 0,
    total: table.rowCount,
  })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failedRequest, setFailedRequest] = useState<{
    offset: number
    mode: BaseRowWindowMergeMode
    totalHint?: number
    cursor?: string
  } | null>(null)
  const [inspectedRow, setInspectedRow] = useState<BaseRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<BaseRow | null>(null)
  const fields = useMemo(
    () => orderedBaseFields(table.fields, view),
    [table.fields, view]
  )
  const cardLayout = useMemo(
    () => createBaseRecordCardLayout(table.fields, view),
    [table.fields, view]
  )
  const { rows, total } = rowWindow

  const requestPage = useCallback(
    async (
      offset: number,
      mode: BaseRowWindowMergeMode,
      totalHint?: number,
      cursor?: string
    ) => {
      const generation = generationRef.current
      if (
        requestRef.current?.generation === generation &&
        requestRef.current.offset === offset
      ) {
        return
      }
      requestRef.current = { generation, offset }
      setFailedRequest(null)
      mode === "replace" ? setLoading(true) : setLoadingMore(true)
      try {
        const page = cursor
          ? await loadPage(offset, GALLERY_PAGE_SIZE, totalHint, cursor)
          : totalHint === undefined
            ? await loadPage(offset, GALLERY_PAGE_SIZE)
            : await loadPage(offset, GALLERY_PAGE_SIZE, totalHint)
        if (generation !== generationRef.current) return
        setRowWindow((current) =>
          mergeRowWindowPage(current, page, mode, GALLERY_MAX_WINDOW_ROWS)
        )
        onRowCountChange?.(
          page.rows.length === 0 && page.offset > 0
            ? Math.min(page.total, page.offset)
            : page.total
        )
      } catch {
        if (generation === generationRef.current) {
          setFailedRequest({ offset, mode, totalHint, cursor })
        }
      } finally {
        if (generation === generationRef.current) {
          if (requestRef.current?.offset === offset) requestRef.current = null
          mode === "replace" ? setLoading(false) : setLoadingMore(false)
        }
      }
    },
    [loadPage, onRowCountChange]
  )

  useEffect(() => {
    generationRef.current += 1
    requestRef.current = null
    setLoadingMore(false)
    setFailedRequest(null)
    const scope = `${table.table.id}:${view.id}`
    const preserveWindow = scopeRef.current === scope
    scopeRef.current = scope
    setRowWindow((current) =>
      preserveWindow
        ? current
        : { rows: [], startOffset: 0, total: table.rowCount }
    )
    setInspectedRow(null)
    onRowCountChange?.(null)
    void requestPage(0, "replace")
    return () => {
      generationRef.current += 1
    }
  }, [onRowCountChange, reloadToken, requestPage, table.table.id, view.id])

  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const updateWidth = (width: number) => {
      if (width <= 0) return
      const nextWidth = Math.round(width)
      setContainerWidth((current) =>
        current === nextWidth ? current : nextWidth
      )
    }
    updateWidth(container.clientWidth)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (typeof width === "number") updateWidth(width)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const targetCardWidth = galleryCardWidth(view)
  const availableWidth = Math.max(
    targetCardWidth,
    containerWidth - GALLERY_HORIZONTAL_PADDING
  )
  const columnCount = Math.max(
    1,
    Math.floor((availableWidth + GALLERY_GAP) / (targetCardWidth + GALLERY_GAP))
  )
  const virtualRowCount = Math.ceil(total / columnCount)
  const {
    virtualizer: rowVirtualizer,
    virtualItems: virtualRows,
    logicalSize: logicalVirtualSize,
    physicalSize: physicalVirtualSize,
    localScrollOffset,
    measurementCount,
    globalIndex: globalVirtualRowIndex,
    itemOffset: virtualRowOffset,
    scrollToIndex: scrollToVirtualRowIndex,
  } = useBaseBoundedVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: virtualRowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimatedItemSize: estimatedGalleryCardHeight(cardLayout),
    getItemKey: galleryVirtualRowKey,
    gap: GALLERY_GAP,
    initialRect: { width: 1024, height: 640 },
    overscan: GALLERY_OVERSCAN_ROWS,
    useAnimationFrameWithResizeObserver: true,
  })

  useLayoutEffect(() => {
    const previousColumnCount = previousColumnCountRef.current
    const layoutChanged =
      previousColumnCount === null ||
      previousColumnCount !== columnCount ||
      previousLayoutFieldsRef.current !== table.fields ||
      previousViewPropertiesRef.current !== view.properties
    previousColumnCountRef.current = columnCount
    previousLayoutFieldsRef.current = table.fields
    previousViewPropertiesRef.current = view.properties
    if (!layoutChanged) return
    const columnCountChanged =
      previousColumnCount !== null && previousColumnCount !== columnCount
    const targetWindow = scrollContainerRef.current?.ownerDocument.defaultView
    const suppressAdjustment = suppressRelayoutScrollAdjustmentRef.current
    if (!columnCountChanged) {
      rowVirtualizer.measure()
      return
    }
    relayoutCleanupRef.current?.()
    const generation = relayoutGenerationRef.current + 1
    relayoutGenerationRef.current = generation
    rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange =
      suppressAdjustment
    skipAnchorCaptureRef.current = true
    const targetRowIndex = Math.floor(
      visibleAnchorIndexRef.current / columnCount
    )
    rowVirtualizer.measure()
    if (!targetWindow) {
      rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined
      return
    }
    relayoutCleanupRef.current = () => {
      relayoutGenerationRef.current += 1
      if (relayoutFrameRef.current !== null) {
        targetWindow.cancelAnimationFrame(relayoutFrameRef.current)
      }
      if (
        rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange ===
        suppressAdjustment
      ) {
        rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined
      }
      relayoutFrameRef.current = null
    }
    queueMicrotask(() => {
      if (relayoutGenerationRef.current !== generation) return
      scrollToVirtualRowIndex(targetRowIndex, { align: "start" })
      relayoutFrameRef.current = targetWindow.requestAnimationFrame(() => {
        scrollToVirtualRowIndex(targetRowIndex, { align: "start" })
        relayoutFrameRef.current = targetWindow.requestAnimationFrame(() => {
          if (
            rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange ===
            suppressAdjustment
          ) {
            rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange =
              undefined
          }
          relayoutFrameRef.current = null
          relayoutCleanupRef.current = null
        })
      })
    })
  }, [
    columnCount,
    rowVirtualizer,
    scrollToVirtualRowIndex,
    table.fields,
    view.properties,
  ])

  useEffect(() => () => relayoutCleanupRef.current?.(), [])

  useLayoutEffect(() => {
    if (skipAnchorCaptureRef.current) {
      skipAnchorCaptureRef.current = false
      return
    }
    const firstVisibleRow = virtualRows.find(
      (virtualRow) => virtualRow.end > localScrollOffset
    )
    if (firstVisibleRow) {
      visibleAnchorIndexRef.current =
        globalVirtualRowIndex(firstVisibleRow.index) * columnCount
    }
  }, [columnCount, globalVirtualRowIndex, localScrollOffset, virtualRows])

  useEffect(() => {
    const first = virtualRows.at(0)
    const last = virtualRows.at(-1)
    if (!first || !last || loading || loadingMore) return
    const firstGlobalIndex = globalVirtualRowIndex(first.index)
    const lastGlobalIndex = globalVirtualRowIndex(last.index)
    const request = requestForPrefetchedRowWindow(
      rowWindow,
      firstGlobalIndex * columnCount,
      Math.min(total, (lastGlobalIndex + 1) * columnCount),
      GALLERY_PAGE_SIZE,
      GALLERY_PREFETCH_ROWS
    )
    if (
      !request ||
      (failedRequest?.offset === request.offset &&
        failedRequest.mode === request.mode)
    ) {
      return
    }
    const cursor =
      request.mode === "append" &&
      request.offset === rowWindow.startOffset + rowWindow.rows.length
        ? rowWindow.nextCursor
        : undefined
    void requestPage(request.offset, request.mode, rowWindow.total, cursor)
  }, [
    columnCount,
    failedRequest,
    globalVirtualRowIndex,
    loading,
    loadingMore,
    requestPage,
    rowWindow,
    total,
    virtualRows,
  ])

  const focusedRow =
    searchResultIndex !== null
      ? rowFromWindow(rowWindow, searchResultIndex)
      : undefined
  const focusedRowId = focusedRow === undefined ? null : String(focusedRow._id)

  useEffect(() => {
    if (searchResultIndex === null || searchResultIndex < 0) return
    if (searchResultIndex >= total) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      scrollToVirtualRowIndex(Math.floor(searchResultIndex / columnCount), {
        align: "auto",
      })
    })
    return () => {
      active = false
    }
  }, [
    columnCount,
    loading,
    loadingMore,
    searchResultIndex,
    scrollToVirtualRowIndex,
    total,
  ])

  const copyRecordId = (id: string) => {
    if (!navigator.clipboard) {
      onError?.(new Error("Clipboard access is unavailable"))
      return
    }
    void navigator.clipboard.writeText(id).catch((error) => onError?.(error))
  }

  const editRecord = async (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => {
    if (disabled) throw new Error("Record editing is temporarily unavailable")
    if (!onCellEdit) throw new Error("Record editing is unavailable")
    const result = await onCellEdit(row, field, value)
    setRowWindow((current) => ({
      ...current,
      rows: current.rows.map((candidate) =>
        String(candidate._id) === String(result.row._id)
          ? result.row
          : candidate
      ),
    }))
    setInspectedRow(result.row)
    return result
  }

  const deleteRecord = async (row: BaseRow) => {
    if (disabled || !onDeleteRow) return
    await onDeleteRow(row)
    const rowId = String(row._id)
    setRowWindow((current) => ({
      ...current,
      rows: current.rows.filter((candidate) => String(candidate._id) !== rowId),
      total: Math.max(0, current.total - 1),
    }))
    const nextTotal = Math.max(0, total - 1)
    onRowCountChange?.(nextTotal)
    setInspectedRow((current) =>
      current && String(current._id) === rowId ? null : current
    )
  }

  return (
    <div className="base-detail-layout flex h-full min-h-0 w-full overflow-hidden">
      <div
        ref={scrollContainerRef}
        data-base-gallery-scroll
        data-base-column-count={columnCount}
        data-base-window-size={rows.length}
        data-base-window-start={rowWindow.startOffset}
        aria-busy={loading || loadingMore}
        className="relative min-w-0 flex-1 overflow-y-auto p-4"
      >
        {loading && rows.length === 0 ? (
          <div
            className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground"
            role="status"
          >
            <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            Loading gallery…
          </div>
        ) : failedRequest !== null && rows.length === 0 ? (
          <div
            className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground"
            role="alert"
          >
            <span>Could not load gallery records.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() =>
                void requestPage(
                  failedRequest.offset,
                  failedRequest.mode,
                  failedRequest.totalHint,
                  failedRequest.cursor
                )
              }
            >
              Retry
            </Button>
          </div>
        ) : total === 0 ? (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            No records in this view.
          </div>
        ) : (
          <div
            className="relative"
            role="list"
            aria-label={`${view.name} records`}
            data-base-logical-size={logicalVirtualSize}
            data-base-physical-size={physicalVirtualSize}
            data-base-measurement-count={measurementCount}
            style={{
              height: physicalVirtualSize,
            }}
          >
            {virtualRows.map((virtualRow) => {
              const globalRowIndex = globalVirtualRowIndex(virtualRow.index)
              return (
                <BaseGalleryVirtualRow
                  key={virtualRow.key}
                  rowWindow={rowWindow}
                  globalRowIndex={globalRowIndex}
                  virtualIndex={virtualRow.index}
                  offset={virtualRowOffset(virtualRow)}
                  columnCount={columnCount}
                  total={total}
                  fields={table.fields}
                  view={view}
                  layout={cardLayout}
                  focusedRowId={focusedRowId}
                  canDelete={!disabled && onDeleteRow !== undefined}
                  measureElement={rowVirtualizer.measureElement}
                  onOpen={setInspectedRow}
                  onDelete={setDeleteRow}
                />
              )
            })}
          </div>
        )}
        {loadingMore ? (
          <div
            data-base-gallery-progress
            className="pointer-events-none sticky inset-x-0 bottom-2 z-10 flex h-0 items-center justify-center text-[11px] text-muted-foreground"
            role="status"
          >
            <span className="flex h-7 items-center gap-1.5 rounded-full border bg-background/95 px-3 shadow-sm backdrop-blur-sm">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              Loading more records…
            </span>
          </div>
        ) : failedRequest !== null && rows.length > 0 ? (
          <div
            data-base-gallery-progress
            className="sticky inset-x-0 bottom-2 z-10 flex h-0 items-center justify-center text-[11px] text-muted-foreground"
            role="alert"
          >
            <span className="flex h-8 items-center gap-2 rounded-full border bg-background/95 pl-3 pr-1 shadow-sm backdrop-blur-sm">
              <span>
                {failedRequest.mode !== "replace"
                  ? "Could not load more records."
                  : "Could not refresh records."}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 rounded-full px-2 text-[11px]"
                onClick={() =>
                  void requestPage(
                    failedRequest.offset,
                    failedRequest.mode,
                    failedRequest.totalHint,
                    failedRequest.cursor
                  )
                }
              >
                Retry
              </Button>
            </span>
          </div>
        ) : null}
      </div>
      {sidePanel ??
        (inspectedRow ? (
          <BaseRecordInspector
            row={inspectedRow}
            fields={fields}
            onClose={() => setInspectedRow(null)}
            onCopyRecordId={copyRecordId}
            onCellEdit={onCellEdit ? editRecord : undefined}
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
        ) : null)}
      {onDeleteRow ? (
        <BaseRecordDeleteDialog
          row={deleteRow}
          disabled={disabled}
          onOpenChange={(open) => {
            if (!open) setDeleteRow(null)
          }}
          onDelete={deleteRecord}
          onError={onError}
        />
      ) : null}
    </div>
  )
})
