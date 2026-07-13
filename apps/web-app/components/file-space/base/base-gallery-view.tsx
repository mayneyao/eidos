import {
  useCallback,
  useEffect,
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
import type { SpaceBinaryFile } from "@eidos.space/file-space"
import { useVirtualizer } from "@tanstack/react-virtual"
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
  type BaseRowWindowMergeMode,
} from "./base-row-window"
import { orderedBaseFields } from "./base-view-layout"
import { useBaseCoverReader } from "./use-base-cover-reader"

const GALLERY_PAGE_SIZE = 100
const GALLERY_MAX_WINDOW_ROWS = 500
const GALLERY_GAP = 12
const GALLERY_HORIZONTAL_PADDING = 32
const GALLERY_OVERSCAN_ROWS = 2
const GALLERY_PREFETCH_ROWS = Math.floor(GALLERY_PAGE_SIZE / 2)

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

export function BaseGalleryView({
  table,
  view,
  reloadToken = 0,
  searchResultIndex = null,
  loadPage,
  readBinary,
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
  reloadToken?: number
  searchResultIndex?: number | null
  loadPage: (
    offset: number,
    limit: number,
    totalHint?: number
  ) => Promise<BaseRowPage>
  readBinary?: (path: string) => Promise<SpaceBinaryFile>
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
  const acquireCover = useBaseCoverReader(readBinary)
  const generationRef = useRef(0)
  const scopeRef = useRef("")
  const requestRef = useRef<{ generation: number; offset: number } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(1024)
  const [rowWindow, setRowWindow] = useState({
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
      totalHint?: number
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
        const page =
          totalHint === undefined
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
          setFailedRequest({ offset, mode, totalHint })
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

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const updateWidth = (width: number) => {
      if (width > 0) setContainerWidth(width)
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
  const rowVirtualizer = useVirtualizer({
    count: virtualRowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimatedGalleryCardHeight(cardLayout),
    getItemKey: (index) =>
      String(
        rowFromWindow(rowWindow, index * columnCount)?._id ??
          `gallery-row-${index}`
      ),
    gap: GALLERY_GAP,
    initialRect: { width: 1024, height: 640 },
    overscan: GALLERY_OVERSCAN_ROWS,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    const first = virtualRows.at(0)
    const last = virtualRows.at(-1)
    if (!first || !last || loading || loadingMore) return
    const request = requestForPrefetchedRowWindow(
      rowWindow,
      first.index * columnCount,
      Math.min(total, (last.index + 1) * columnCount),
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
    void requestPage(request.offset, request.mode, rowWindow.total)
  }, [
    columnCount,
    failedRequest,
    loading,
    loadingMore,
    requestPage,
    rowWindow,
    total,
    virtualRows,
  ])

  useEffect(() => {
    rowVirtualizer.measure()
  }, [columnCount, rowVirtualizer, table.fields, view.properties])

  const focusedRow =
    searchResultIndex !== null
      ? rowFromWindow(rowWindow, searchResultIndex)
      : undefined

  useEffect(() => {
    if (searchResultIndex === null || searchResultIndex < 0) return
    if (searchResultIndex >= total) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      rowVirtualizer.scrollToIndex(
        Math.floor(searchResultIndex / columnCount),
        { align: "auto" }
      )
    })
    return () => {
      active = false
    }
  }, [
    columnCount,
    loading,
    loadingMore,
    rowVirtualizer,
    searchResultIndex,
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
    if (!onDeleteRow) return
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
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div
        ref={scrollContainerRef}
        data-base-gallery-scroll
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
                  failedRequest.totalHint
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
            style={{
              height: rowVirtualizer.getTotalSize(),
            }}
          >
            {virtualRows.map((virtualRow) => {
              const start = virtualRow.index * columnCount
              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 top-0 grid w-full items-start gap-3"
                  data-index={virtualRow.index}
                  style={{
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                    transform: `translateY(${virtualRow.start}px)`,
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
                          fields={table.fields}
                          view={view}
                          layout={cardLayout}
                          acquireCover={acquireCover}
                          role="listitem"
                          focused={
                            focusedRow !== undefined &&
                            String(focusedRow._id) === String(row._id)
                          }
                          onOpen={setInspectedRow}
                          onDelete={onDeleteRow ? setDeleteRow : undefined}
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
            })}
          </div>
        )}
        {loadingMore ? (
          <div
            className="flex h-10 items-center justify-center gap-1.5 text-[11px] text-muted-foreground"
            role="status"
          >
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            Loading more records…
          </div>
        ) : failedRequest !== null && rows.length > 0 ? (
          <div
            className="flex h-10 items-center justify-center gap-2 text-[11px] text-muted-foreground"
            role="alert"
          >
            <span>
              {failedRequest.mode !== "replace"
                ? "Could not load more records."
                : "Could not refresh records."}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() =>
                void requestPage(
                  failedRequest.offset,
                  failedRequest.mode,
                  failedRequest.totalHint
                )
              }
            >
              Retry
            </Button>
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
          onOpenChange={(open) => {
            if (!open) setDeleteRow(null)
          }}
          onDelete={deleteRecord}
          onError={onError}
        />
      ) : null}
    </div>
  )
}
