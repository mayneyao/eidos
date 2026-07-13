import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
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

import { BaseRecordCard } from "./base-record-card"
import { BaseRecordDeleteDialog } from "./base-record-delete-dialog"
import { BaseRecordInspector } from "./base-record-inspector"
import { orderedBaseFields } from "./base-view-layout"
import { useBaseVirtualLoadMore } from "./use-base-virtual-load-more"

const GALLERY_PAGE_SIZE = 100
const GALLERY_GAP = 12
const GALLERY_HORIZONTAL_PADDING = 32
const GALLERY_OVERSCAN_ROWS = 2

function galleryCardWidth(view: BaseViewInfo): number {
  const size = view.properties?.cardSize
  if (size === "small") return 220
  if (size === "large") return 340
  return 280
}

function estimatedGalleryCardHeight(
  table: BaseTableSnapshot,
  view: BaseViewInfo
): number {
  const hasCover = typeof view.properties?.coverPreview === "string"
  const visibleFieldCount = orderedBaseFields(table.fields, view)
    .filter(
      (field) =>
        field.tableColumnName !== "title" && field.valueKind !== "system"
    )
    .slice(0, 6).length
  return 72 + (hasCover ? 144 : 0) + visibleFieldCount * 32
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
  loadPage: (offset: number, limit: number) => Promise<BaseRowPage>
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
  const generationRef = useRef(0)
  const requestRef = useRef<{ generation: number; offset: number } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(1024)
  const [rows, setRows] = useState<BaseRow[]>([])
  const [total, setTotal] = useState(table.rowCount)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [inspectedRow, setInspectedRow] = useState<BaseRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<BaseRow | null>(null)
  const fields = orderedBaseFields(table.fields, view)

  const requestPage = useCallback(
    async (offset: number, append: boolean) => {
      const generation = generationRef.current
      if (
        requestRef.current?.generation === generation &&
        requestRef.current.offset === offset
      ) {
        return
      }
      requestRef.current = { generation, offset }
      append ? setLoadingMore(true) : setLoading(true)
      try {
        const page = await loadPage(offset, GALLERY_PAGE_SIZE)
        if (generation !== generationRef.current) return
        setRows((current) => {
          if (!append) return page.rows
          const existingIds = new Set(
            current.map((row) => String(row._id ?? ""))
          )
          return [
            ...current,
            ...page.rows.filter(
              (row) => !existingIds.has(String(row._id ?? ""))
            ),
          ]
        })
        setTotal(page.total)
        onRowCountChange?.(page.total)
      } catch (error) {
        if (generation === generationRef.current) onError?.(error)
      } finally {
        if (generation === generationRef.current) {
          if (requestRef.current?.offset === offset) requestRef.current = null
          append ? setLoadingMore(false) : setLoading(false)
        }
      }
    },
    [loadPage, onError, onRowCountChange]
  )

  useEffect(() => {
    generationRef.current += 1
    requestRef.current = null
    setRows([])
    setTotal(table.rowCount)
    setInspectedRow(null)
    onRowCountChange?.(null)
    void requestPage(0, false)
    return () => {
      generationRef.current += 1
    }
  }, [
    onRowCountChange,
    reloadToken,
    requestPage,
    table.rowCount,
    table.table.id,
    view.id,
  ])

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
  const virtualRowCount = Math.ceil(rows.length / columnCount)
  const rowVirtualizer = useVirtualizer({
    count: virtualRowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimatedGalleryCardHeight(table, view),
    getItemKey: (index) =>
      String(rows[index * columnCount]?._id ?? `gallery-row-${index}`),
    gap: GALLERY_GAP,
    initialRect: { width: 1024, height: 640 },
    overscan: GALLERY_OVERSCAN_ROWS,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const lastVirtualRowIndex = virtualRows.at(-1)?.index ?? -1
  const loadNextPage = useCallback(() => {
    void requestPage(rows.length, true)
  }, [requestPage, rows.length])

  useBaseVirtualLoadMore({
    enabled: !loading && !loadingMore && rows.length < total,
    lastVirtualIndex: lastVirtualRowIndex,
    loadBoundary: Math.max(0, virtualRowCount - GALLERY_OVERSCAN_ROWS),
    onLoadMore: loadNextPage,
  })

  useEffect(() => {
    rowVirtualizer.measure()
  }, [columnCount, rowVirtualizer, table.fields, view.properties])

  const focusedRow =
    searchResultIndex !== null ? rows[searchResultIndex] : undefined

  useEffect(() => {
    if (searchResultIndex === null || searchResultIndex < 0) return
    if (searchResultIndex >= total) return
    if (searchResultIndex >= rows.length) {
      if (!loading && !loadingMore && rows.length < total) {
        void requestPage(rows.length, true)
      }
      return
    }
    const row = rows[searchResultIndex]
    if (!row) return
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
    requestPage,
    rowVirtualizer,
    rows,
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
    setRows((current) =>
      current.map((candidate) =>
        String(candidate._id) === String(result.row._id)
          ? result.row
          : candidate
      )
    )
    setInspectedRow(result.row)
    return result
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div
        ref={scrollContainerRef}
        data-base-gallery-scroll
        className="min-w-0 flex-1 overflow-y-auto p-4"
      >
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading gallery…
          </div>
        ) : rows.length === 0 ? (
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
                  {rows.slice(start, start + columnCount).map((row) => (
                    <BaseRecordCard
                      key={String(row._id)}
                      row={row}
                      fields={table.fields}
                      view={view}
                      readBinary={readBinary}
                      role="listitem"
                      focused={
                        focusedRow !== undefined &&
                        String(focusedRow._id) === String(row._id)
                      }
                      onOpen={setInspectedRow}
                      onDelete={onDeleteRow ? setDeleteRow : undefined}
                    />
                  ))}
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
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Loading more records…
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
          onDelete={onDeleteRow}
          onError={onError}
        />
      ) : null}
    </div>
  )
}
