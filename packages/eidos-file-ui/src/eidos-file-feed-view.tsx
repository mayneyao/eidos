import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { ChevronDown, LoaderCircle } from "lucide-react"

import { useEidosFileUI } from "./context"
import { cn } from "./lib/cn"
import { Button } from "./ui/primitives"
import { eidosFileErrorMessage } from "./eidos-file-error-message"
import {
  eidosFileContentField,
  isEidosFileRecordLabelField,
} from "./eidos-file-field-visibility"
import { EidosFileMarkdownPreview } from "./eidos-file-markdown-preview"
import { useEidosFileScrollKeys } from "./use-eidos-file-scroll-keys"
import {
  eidosFileRecordFieldText,
  eidosFileRecordTitle,
} from "./eidos-file-record-format"

const FEED_PAGE_SIZE = 30
const FEED_CONTENT_MAX_HEIGHT = 384

const FEED_INTERACTIVE_TARGET =
  'a, button, input, select, textarea, summary, [role="button"], [role="menuitem"], [contenteditable="true"]'

function isFeedInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(FEED_INTERACTIVE_TARGET) !== null
  )
}

/** Feed orders by the Record's created-time system Field. */
export function eidosFileFeedCreatedField(
  fields: readonly EidosFileFieldInfo[]
): EidosFileFieldInfo | null {
  return (
    fields.find((field) => field.systemRole === "created-time") ??
    fields.find((field) => field.type === "created-time") ??
    null
  )
}

export function eidosFileFeedProjection(
  table: EidosFileTableSnapshot
): EidosFileRowPageProjection {
  const labelField = table.fields.find(isEidosFileRecordLabelField)
  const candidates = [
    labelField,
    eidosFileContentField(table),
    eidosFileFeedCreatedField(table.fields),
  ]
  const columns = Array.from(
    new Set(
      candidates.flatMap((field) => (field ? [field.tableColumnName] : []))
    )
  )
  return {
    columns,
    includeRecordLabel: true,
    includeRelationDisplays: false,
  }
}

function feedDateValue(
  row: EidosFileRow,
  field: EidosFileFieldInfo | null
): string | null {
  if (!field) return null
  const value = row[field.tableColumnName]
  return typeof value === "string" && value.length > 0 ? value : null
}

function EidosFileFeedEntry({
  row,
  table,
  positionInSet,
  setSize,
  fields,
  focused,
  onOpen,
  onError,
}: {
  row: EidosFileRow
  table: EidosFileTableSnapshot
  positionInSet: number
  setSize: number
  fields: {
    date: EidosFileFieldInfo | null
    content: EidosFileFieldInfo | null
  }
  focused: boolean
  onOpen?: (row: EidosFileRow) => void
  onError?: (error: unknown) => void
}) {
  const { timeZone, translate: t } = useEidosFileUI()
  const title = eidosFileRecordTitle(row, table.fields)
  const dateRaw = feedDateValue(row, fields.date)
  const dateText = fields.date
    ? eidosFileRecordFieldText(row, fields.date, timeZone)
    : null
  const displayDate = dateText && dateText !== "Empty" ? dateText : null
  const contentValue = fields.content
    ? row[fields.content.tableColumnName]
    : null
  const contentMarkdown =
    typeof contentValue === "string" && contentValue.trim().length > 0
      ? contentValue
      : null

  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () =>
      setOverflowing(content.offsetHeight > FEED_CONTENT_MAX_HEIGHT + 1)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [contentMarkdown])

  const open = (event: ReactMouseEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      isFeedInteractiveTarget(event.target)
    ) {
      return
    }
    onOpen?.(row)
  }

  return (
    <article
      role="article"
      aria-posinset={positionInSet}
      aria-setsize={setSize}
      aria-current={focused ? "true" : undefined}
      data-eidos-file-feed-row={String(row._id)}
      className={cn(
        "group/feed-entry relative min-w-0 cursor-pointer rounded-lg border bg-card px-4 py-3 text-card-foreground shadow-xs outline-hidden transition-[border-color,box-shadow] hover:border-border hover:shadow-sm",
        focused
          ? "border-ring ring-2 ring-ring/45"
          : "border-border/50 focus-visible:ring-2 focus-visible:ring-ring"
      )}
      onClick={open}
    >
      <div className="flex items-baseline gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold leading-6">
          {title === "Empty" ? t("Untitled") : title}
        </h2>
        {displayDate ? (
          <time
            dateTime={dateRaw ?? undefined}
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {displayDate}
          </time>
        ) : null}
      </div>
      {contentMarkdown ? (
        <div className="mt-2">
          <div
            className={cn("relative", !expanded && "max-h-96 overflow-hidden")}
          >
            <div ref={contentRef} data-eidos-file-feed-content="">
              <EidosFileMarkdownPreview
                markdown={contentMarkdown}
                className="text-[14px] leading-6"
                onError={onError}
              />
            </div>
            {!expanded && overflowing ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent"
              />
            ) : null}
          </div>
          {overflowing && !expanded ? (
            <div className="mt-1 flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={false}
                onClick={() => setExpanded(true)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
                {t("See more")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export const EidosFileFeedView = memo(function EidosFileFeedView({
  table,
  view,
  disabled = false,
  reloadToken = 0,
  searchResultIndex = null,
  loadPage,
  onOpenRecord,
  onRowCountChange,
  onError,
  sidePanel,
}: {
  table: EidosFileTableSnapshot
  view: EidosFileViewInfo
  disabled?: boolean
  reloadToken?: number
  searchResultIndex?: number | null
  loadPage: (
    offset: number,
    limit: number,
    totalHint?: number,
    cursor?: string
  ) => Promise<EidosFileRowPage>
  onOpenRecord?: (row: EidosFileRow) => void
  onRowCountChange?: (rowCount: number | null) => void
  onError?: (error: unknown) => void
  sidePanel?: ReactNode
}) {
  const { translate: t } = useEidosFileUI()
  const scrollRef = useRef<HTMLDivElement>(null)
  const generationRef = useRef(0)
  const [rows, setRows] = useState<EidosFileRow[]>([])
  const [total, setTotal] = useState(table.rowCount)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failedPage, setFailedPage] = useState<{
    offset: number
    message: string
  } | null>(null)

  const fields = useMemo(
    () => ({
      date: eidosFileFeedCreatedField(table.fields),
      content: eidosFileContentField(table),
    }),
    [table]
  )

  const requestPage = useCallback(
    async (offset: number, mode: "replace" | "append") => {
      const generation = generationRef.current
      if (offset === 0) setLoading(true)
      else setLoadingMore(true)
      setFailedPage(null)
      try {
        const page = await loadPage(offset, FEED_PAGE_SIZE)
        if (generation !== generationRef.current) return
        setRows((current) =>
          mode === "replace" ? page.rows : [...current, ...page.rows]
        )
        setTotal(page.total)
        onRowCountChange?.(page.total)
      } catch (error) {
        if (generation !== generationRef.current) return
        setFailedPage({
          offset,
          message: eidosFileErrorMessage(
            error,
            "The Eidos File service did not return an error message"
          ),
        })
      } finally {
        if (generation === generationRef.current) {
          if (offset === 0) setLoading(false)
          else setLoadingMore(false)
        }
      }
    },
    [loadPage, onRowCountChange]
  )

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    setRows([])
    setTotal(table.rowCount)
    setFailedPage(null)
    onRowCountChange?.(null)
    void requestPage(0, "replace")
    return () => {
      if (generationRef.current === generation) generationRef.current += 1
    }
  }, [onRowCountChange, reloadToken, requestPage, table.table.id, view.id])

  const loadMore = useCallback(() => {
    if (loading || loadingMore || rows.length >= total || failedPage) return
    void requestPage(rows.length, "append")
  }, [failedPage, loading, loadingMore, requestPage, rows.length, total])

  useEffect(() => {
    if (searchResultIndex === null || searchResultIndex < 0) return
    if (searchResultIndex < rows.length) return
    if (rows.length >= total) return
    loadMore()
  }, [loadMore, rows.length, searchResultIndex, total])

  useEffect(() => {
    if (searchResultIndex === null || searchResultIndex < 0) return
    const row = rows[searchResultIndex]
    if (!row) return
    const node = scrollRef.current?.querySelector<HTMLElement>(
      `[data-eidos-file-feed-row="${String(row._id)}"]`
    )
    node?.scrollIntoView?.({ block: "center" })
  }, [rows, searchResultIndex])

  useEidosFileScrollKeys(scrollRef)

  const focusedRow =
    searchResultIndex !== null && searchResultIndex >= 0
      ? rows[searchResultIndex]
      : undefined
  const focusedRowId = focusedRow ? String(focusedRow._id) : null

  return (
    <div className="eidos-file-detail-layout relative flex h-full min-h-0 w-full overflow-hidden">
      <div
        ref={scrollRef}
        data-eidos-file-feed-scroll
        data-eidos-file-window-size={rows.length}
        aria-busy={loading || loadingMore}
        className="relative min-w-0 flex-1 overflow-y-auto"
      >
        {loading && rows.length === 0 ? (
          <div
            className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground"
            role="status"
          >
            <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            {t("Loading feed…")}
          </div>
        ) : failedPage !== null && rows.length === 0 ? (
          <div
            className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground"
            role="alert"
          >
            <span>{t("Could not load feed records.")}</span>
            <span className="max-w-md break-words text-center text-destructive">
              {failedPage.message}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => void requestPage(failedPage.offset, "replace")}
            >
              {t("Retry")}
            </Button>
          </div>
        ) : total === 0 ? (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            {t("No records in this view.")}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6">
            <div
              role="feed"
              aria-label={t("{view} records", { view: view.name })}
              className="grid grid-cols-[minmax(0,1fr)] gap-4"
            >
              {rows.map((row, index) => (
                <EidosFileFeedEntry
                  key={String(row._id)}
                  row={row}
                  table={table}
                  positionInSet={index + 1}
                  setSize={total}
                  fields={fields}
                  focused={focusedRowId === String(row._id)}
                  onOpen={disabled ? undefined : onOpenRecord}
                  onError={onError}
                />
              ))}
            </div>
            {rows.length < total || loadingMore || failedPage ? (
              <div className="mt-6 flex justify-center">
                {failedPage ? (
                  <div
                    className="flex flex-col items-center gap-2 text-xs"
                    role="alert"
                  >
                    <span className="text-destructive">
                      {failedPage.message}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() =>
                        void requestPage(failedPage.offset, "append")
                      }
                    >
                      {t("Retry")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={loading || loadingMore}
                    onClick={loadMore}
                  >
                    {loadingMore ? (
                      <>
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                        {t("Loading…")}
                      </>
                    ) : (
                      t("Load more records")
                    )}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {sidePanel}
    </div>
  )
})
