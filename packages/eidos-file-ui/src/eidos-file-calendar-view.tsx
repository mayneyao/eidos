import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
  EidosFileRelationValue,
  EidosFileSqlPrimitive,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
  FileEntry,
} from "@eidos.space/eidos-file"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  LoaderCircle,
  PanelRightOpen,
  Plus,
  Trash2,
} from "lucide-react"

import { useEidosFileUI } from "./context"
import {
  eidosFileDateKey,
  eidosFileInstantFromWallDate,
  eidosFileWallDate,
} from "./eidos-file-date-time"
import { eidosFileErrorMessage } from "./eidos-file-error-message"
import {
  eidosFileFieldKey,
  isEidosFileRecordLabelField,
} from "./eidos-file-field-visibility"
import { EidosFileRecordDeleteDialog } from "./eidos-file-record-delete-dialog"
import { EidosFileRecordInspector } from "./eidos-file-record-inspector"
import { eidosFileRecordTitle } from "./eidos-file-record-format"
import { orderedEidosFileFields } from "./eidos-file-view-layout"
import { cn } from "./lib/cn"
import { useEidosFileRecordInspectorRow } from "./use-eidos-file-record-inspector-row"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu"
import { Button } from "./ui/primitives"

export interface EidosFileCalendarRange {
  start: Date
  end: Date
}

export interface EidosFileCalendarPage {
  rows: EidosFileRow[]
  total: number
  nextCursor: string | null
}

export interface EidosFileCalendarPageRequest {
  limit: number
  cursor?: string
  totalHint?: number
}

interface EidosFileCalendarDayPage extends EidosFileCalendarPage {
  loadingMore: boolean
  loadMoreError: string | null
}

const CALENDAR_EXPANDED_DAY_LIMIT = 100
const CALENDAR_LOAD_CONCURRENCY = 3

export type EidosFileCalendarFieldType = "date" | "datetime"
export type EidosFileCalendarCreateMode = "all-days" | "today" | "none"
export type EidosFileCalendarLayout = "month" | "week"

const CALENDAR_COLLAPSED_DAY_LIMIT: Record<EidosFileCalendarLayout, number> = {
  month: 3,
  week: 8,
}

export function eidosFileCalendarLayout(
  value: unknown
): EidosFileCalendarLayout {
  return value === "week" ? value : "month"
}

export function eidosFileCalendarFieldType(
  field: EidosFileFieldInfo
): EidosFileCalendarFieldType | null {
  const type =
    (field.type === "formula" || field.type === "lookup") &&
    typeof field.property?.displayType === "string"
      ? field.property.displayType
      : field.type
  if (type === "date") return "date"
  if (
    type === "datetime" ||
    type === "created-time" ||
    type === "last-edited-time"
  ) {
    return "datetime"
  }
  return null
}

export function eidosFileCalendarDateFields(
  fields: readonly EidosFileFieldInfo[]
): EidosFileFieldInfo[] {
  return fields.filter((field) => eidosFileCalendarFieldType(field) !== null)
}

export function eidosFileCalendarCreateMode(
  field: EidosFileFieldInfo
): EidosFileCalendarCreateMode {
  if (
    field.systemRole === "created-time" ||
    field.systemRole === "updated-time" ||
    field.type === "created-time" ||
    field.type === "last-edited-time"
  ) {
    return "today"
  }
  if (
    field.valueKind === "source" &&
    !field.isDerived &&
    (field.type === "date" || field.type === "datetime")
  ) {
    return "all-days"
  }
  return "none"
}

export function eidosFileCalendarCreateValue(
  field: EidosFileFieldInfo,
  day: Date,
  timeZone?: string
): string | undefined {
  if (eidosFileCalendarCreateMode(field) !== "all-days") return undefined
  if (field.type === "date") return localDateKey(day)
  const instant = eidosFileInstantFromWallDate(
    new Date(day.getFullYear(), day.getMonth(), day.getDate()),
    timeZone
  )
  if (!instant) {
    throw new Error("The selected day has no unambiguous midnight instant")
  }
  return instant.toISOString()
}

function localDateKey(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export function eidosFileCalendarRowDateKey(
  row: EidosFileRow,
  field: EidosFileFieldInfo,
  timeZone?: string
): string | null {
  const value = row[field.tableColumnName]
  if (typeof value !== "string" || value.length === 0) return null
  if (eidosFileCalendarFieldType(field) === "date") {
    return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null
  }
  const instant = new Date(value)
  return Number.isNaN(instant.getTime())
    ? null
    : eidosFileDateKey(instant, timeZone)
}

function calendarRowTimeLabel(
  row: EidosFileRow,
  field: EidosFileFieldInfo,
  timeZone?: string
): string | null {
  if (eidosFileCalendarFieldType(field) !== "datetime") return null
  const value = row[field.tableColumnName]
  if (typeof value !== "string" || value.length === 0) return null
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(instant)
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfWeek(date: Date, weekStartsOnMonday: boolean): Date {
  const firstDayOfWeek = weekStartsOnMonday ? 1 : 0
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (start.getDay() - firstDayOfWeek + 7) % 7
  start.setDate(start.getDate() - offset)
  return start
}

function calendarRange(
  anchorDate: Date,
  layout: EidosFileCalendarLayout,
  weekStartsOnMonday: boolean
): EidosFileCalendarRange {
  if (layout === "week") {
    const start = startOfWeek(anchorDate, weekStartsOnMonday)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end }
  }
  const start = startOfWeek(startOfMonth(anchorDate), weekStartsOnMonday)
  const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1)
  const nextWeekStart = startOfWeek(end, weekStartsOnMonday)
  if (nextWeekStart.getTime() !== end.getTime()) {
    nextWeekStart.setDate(nextWeekStart.getDate() + 7)
  }
  end.setTime(nextWeekStart.getTime())
  return { start, end }
}

function shiftCalendarAnchor(
  anchorDate: Date,
  layout: EidosFileCalendarLayout,
  amount: -1 | 1
): Date {
  if (layout === "month") {
    return new Date(anchorDate.getFullYear(), anchorDate.getMonth() + amount, 1)
  }
  const next = new Date(anchorDate)
  next.setDate(next.getDate() + amount * 7)
  return next
}

function calendarPeriodLabel(
  anchorDate: Date,
  layout: EidosFileCalendarLayout,
  range: EidosFileCalendarRange
): string {
  if (layout === "month") {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(anchorDate)
  }
  const end = new Date(range.end)
  end.setDate(end.getDate() - 1)
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  return `${formatter.format(range.start)} – ${formatter.format(end)}`
}

function rangeDays(range: EidosFileCalendarRange): Date[] {
  const days: Date[] = []
  for (
    let cursor = new Date(range.start);
    cursor < range.end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    days.push(new Date(cursor))
  }
  return days
}

function calendarPagesTotal(
  pages: ReadonlyMap<string, EidosFileCalendarDayPage>
): number {
  return Array.from(pages.values()).reduce(
    (total, page) => total + page.total,
    0
  )
}

export function EidosFileCalendarView({
  table,
  view,
  disabled = false,
  reloadToken = 0,
  loadRows,
  loadDayTotals,
  loadRow,
  onCellEdit,
  onAddRow,
  onDeleteRow,
  onImportFiles,
  onImportDroppedFiles,
  onSearchRelation,
  onLayoutChange,
  onRowCountChange,
  onError,
  sidePanel,
}: {
  table: EidosFileTableSnapshot
  view: EidosFileViewInfo
  disabled?: boolean
  reloadToken?: number
  loadRows: (
    field: EidosFileFieldInfo,
    range: EidosFileCalendarRange,
    request: EidosFileCalendarPageRequest
  ) => Promise<EidosFileCalendarPage>
  loadDayTotals?: (
    field: EidosFileFieldInfo,
    range: EidosFileCalendarRange
  ) => Promise<Map<string, number> | null>
  loadRow?: (rowId: string) => Promise<EidosFileRow | null>
  onCellEdit?: (
    row: EidosFileRow,
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => Promise<EidosFileRowMutationResult>
  onAddRow?: (
    field: EidosFileFieldInfo,
    day: Date
  ) => Promise<EidosFileRowMutationResult>
  onDeleteRow?: (row: EidosFileRow) => Promise<void>
  onImportFiles?: () => Promise<FileEntry[]>
  onImportDroppedFiles?: (files: File[]) => Promise<FileEntry[]>
  onSearchRelation?: (
    field: EidosFileFieldInfo,
    query: string
  ) => Promise<EidosFileRelationValue[]>
  onLayoutChange?: (layout: EidosFileCalendarLayout) => void | Promise<void>
  onRowCountChange?: (rowCount: number | null) => void
  onError?: (error: unknown) => void
  sidePanel?: ReactNode
}) {
  const { timeZone, translate: t, weekStartsOnMonday = true } = useEidosFileUI()
  const dateFields = useMemo(
    () => eidosFileCalendarDateFields(table.fields),
    [table.fields]
  )
  const configuredDateField =
    typeof view.properties?.dateField === "string"
      ? view.properties.dateField
      : null
  const dateField =
    dateFields.find(
      (field) => eidosFileFieldKey(field) === configuredDateField
    ) ?? dateFields[0]
  const dateFieldKey = dateField ? eidosFileFieldKey(dateField) : null
  const configuredLayout = eidosFileCalendarLayout(
    view.properties?.calendarLayout
  )
  const [layout, setLayout] =
    useState<EidosFileCalendarLayout>(configuredLayout)
  const [anchorDate, setAnchorDate] = useState(() =>
    eidosFileWallDate(new Date(), timeZone)
  )
  const [dayPages, setDayPages] = useState<
    Map<string, EidosFileCalendarDayPage>
  >(() => new Map())
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set())
  const [creatingDay, setCreatingDay] = useState<string | null>(null)
  const [deleteRow, setDeleteRow] = useState<EidosFileRow | null>(null)
  const requestGenerationRef = useRef(0)
  const collapsedDayLimit = CALENDAR_COLLAPSED_DAY_LIMIT[layout]
  const initialDayLimit = collapsedDayLimit + 1
  const range = useMemo(
    () => calendarRange(anchorDate, layout, weekStartsOnMonday),
    [anchorDate, layout, weekStartsOnMonday]
  )
  const days = useMemo(() => rangeDays(range), [range])
  const fields = useMemo(
    () => orderedEidosFileFields(table.fields, view),
    [table.fields, view]
  )
  const {
    inspectedRow,
    inspectorLoading,
    inspectorLoadError,
    openInspectorRow,
    closeInspectorRow,
    replaceInspectorRow,
    retryInspectorRow,
  } = useEidosFileRecordInspectorRow(loadRow)

  const requestRows = useCallback(async () => {
    if (!dateField) return
    const generation = requestGenerationRef.current + 1
    requestGenerationRef.current = generation
    setLoading(true)
    setLoadError(null)
    setDayPages(new Map())
    onRowCountChange?.(null)
    try {
      const loaded = new Map<string, EidosFileCalendarDayPage>()
      const totals = loadDayTotals
        ? await loadDayTotals(dateField, range)
        : null
      if (generation !== requestGenerationRef.current) return
      const daysToLoad = totals
        ? days.filter((day) => (totals.get(localDateKey(day)) ?? 0) > 0)
        : days
      if (totals) {
        for (const day of days) {
          const total = totals.get(localDateKey(day)) ?? 0
          if (total === 0) {
            loaded.set(localDateKey(day), {
              rows: [],
              total: 0,
              nextCursor: null,
              loadingMore: false,
              loadMoreError: null,
            })
          }
        }
        setDayPages(new Map(loaded))
      }
      for (
        let index = 0;
        index < daysToLoad.length;
        index += CALENDAR_LOAD_CONCURRENCY
      ) {
        const chunk = daysToLoad.slice(index, index + CALENDAR_LOAD_CONCURRENCY)
        const pages = await Promise.all(
          chunk.map(async (day) => {
            const start = new Date(day)
            const end = new Date(day)
            end.setDate(end.getDate() + 1)
            const totalHint = totals?.get(localDateKey(day))
            const page = await loadRows(
              dateField,
              { start, end },
              {
                limit: initialDayLimit,
                ...(totalHint === undefined ? {} : { totalHint }),
              }
            )
            return [
              localDateKey(day),
              {
                ...page,
                loadingMore: false,
                loadMoreError: null,
              },
            ] as const
          })
        )
        if (generation !== requestGenerationRef.current) return
        for (const [key, page] of pages) loaded.set(key, page)
        setDayPages(new Map(loaded))
      }
      onRowCountChange?.(
        Array.from(loaded.values()).reduce(
          (total, page) => total + page.total,
          0
        )
      )
    } catch (error) {
      if (generation !== requestGenerationRef.current) return
      setLoadError(
        eidosFileErrorMessage(
          error,
          "The Eidos File service did not return an error message"
        )
      )
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false)
    }
  }, [
    dateField,
    days,
    initialDayLimit,
    loadDayTotals,
    loadRows,
    onRowCountChange,
    range,
  ])

  useEffect(() => {
    closeInspectorRow()
    setExpandedDays(new Set())
  }, [closeInspectorRow, dateFieldKey, view.id])

  useEffect(() => {
    setLayout(configuredLayout)
  }, [configuredLayout, view.id])

  useEffect(() => {
    if (!dateField) {
      requestGenerationRef.current += 1
      setDayPages(new Map())
      onRowCountChange?.(0)
      return
    }
    void requestRows()
    return () => {
      requestGenerationRef.current += 1
    }
  }, [dateField, onRowCountChange, reloadToken, requestRows])

  const upsertLoadedRow = (row: EidosFileRow) => {
    if (!dateField) return
    const rowId = String(row._id)
    const targetKey = eidosFileCalendarRowDateKey(row, dateField, timeZone)
    setDayPages((current) => {
      const next = new Map(current)
      for (const [key, page] of next) {
        const rows = page.rows.filter(
          (candidate) => String(candidate._id) !== rowId
        )
        if (rows.length === page.rows.length) continue
        next.set(key, {
          ...page,
          rows,
          total: Math.max(0, page.total - 1),
        })
      }
      const target = targetKey ? next.get(targetKey) : undefined
      if (targetKey && target) {
        next.set(targetKey, {
          ...target,
          rows: [...target.rows, row],
          total: target.total + 1,
        })
      } else if (
        targetKey &&
        days.some((day) => localDateKey(day) === targetKey)
      ) {
        next.set(targetKey, {
          rows: [row],
          total: 1,
          nextCursor: null,
          loadingMore: false,
          loadMoreError: null,
        })
      }
      onRowCountChange?.(calendarPagesTotal(next))
      return next
    })
  }

  const loadMoreDay = async (day: Date, dayKey: string) => {
    if (!dateField) return
    const currentPage = dayPages.get(dayKey)
    if (!currentPage?.nextCursor || currentPage.loadingMore) return
    const generation = requestGenerationRef.current
    setDayPages((current) => {
      const page = current.get(dayKey)
      if (!page) return current
      const next = new Map(current)
      next.set(dayKey, { ...page, loadingMore: true, loadMoreError: null })
      return next
    })
    const start = new Date(day)
    const end = new Date(day)
    end.setDate(end.getDate() + 1)
    try {
      const page = await loadRows(
        dateField,
        { start, end },
        {
          limit: CALENDAR_EXPANDED_DAY_LIMIT,
          cursor: currentPage.nextCursor,
          totalHint: currentPage.total,
        }
      )
      if (generation !== requestGenerationRef.current) return
      setDayPages((current) => {
        const existing = current.get(dayKey)
        if (!existing) return current
        const ids = new Set(existing.rows.map((row) => String(row._id)))
        const rows = [
          ...existing.rows,
          ...page.rows.filter((row) => !ids.has(String(row._id))),
        ]
        const next = new Map(current)
        next.set(dayKey, {
          ...page,
          rows,
          loadingMore: false,
          loadMoreError: null,
        })
        return next
      })
    } catch (error) {
      if (generation !== requestGenerationRef.current) return
      setDayPages((current) => {
        const existing = current.get(dayKey)
        if (!existing) return current
        const next = new Map(current)
        next.set(dayKey, {
          ...existing,
          loadingMore: false,
          loadMoreError: eidosFileErrorMessage(
            error,
            "The Eidos File service did not return an error message"
          ),
        })
        return next
      })
    }
  }

  const editRecord = async (
    row: EidosFileRow,
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => {
    if (disabled) throw new Error("Record editing is temporarily unavailable")
    if (!onCellEdit) throw new Error("Record editing is unavailable")
    const result = await onCellEdit(row, field, value)
    upsertLoadedRow(result.row)
    replaceInspectorRow(result.row)
    return result
  }

  const createRecord = async (day: Date) => {
    if (disabled || !onAddRow || !dateField || creatingDay) return
    const dayKey = localDateKey(day)
    setCreatingDay(dayKey)
    try {
      const result = await onAddRow(dateField, day)
      if (
        eidosFileCalendarRowDateKey(result.row, dateField, timeZone) === dayKey
      ) {
        upsertLoadedRow(result.row)
      }
      openInspectorRow(result.row)
    } catch (error) {
      onError?.(error)
    } finally {
      setCreatingDay(null)
    }
  }

  const copyRecordId = (id: string) => {
    if (!navigator.clipboard) {
      onError?.(new Error("Clipboard access is unavailable"))
      return
    }
    void navigator.clipboard.writeText(id).catch((error) => onError?.(error))
  }

  const deleteRecord = async (row: EidosFileRow) => {
    if (disabled || !onDeleteRow) return
    await onDeleteRow(row)
    const rowId = String(row._id)
    setDayPages((current) => {
      const next = new Map(current)
      for (const [key, page] of next) {
        const rows = page.rows.filter(
          (candidate) => String(candidate._id) !== rowId
        )
        if (rows.length === page.rows.length) continue
        next.set(key, {
          ...page,
          rows,
          total: Math.max(0, page.total - 1),
        })
      }
      onRowCountChange?.(calendarPagesTotal(next))
      return next
    })
    if (inspectedRow && String(inspectedRow._id) === rowId) closeInspectorRow()
  }

  if (!dateField) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <CalendarDays className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">
            {t("Calendar needs a date field")}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("Add a Date or Date & time field, then configure this view.")}
          </p>
        </div>
      </div>
    )
  }

  const todayKey = eidosFileDateKey(new Date(), timeZone)
  const createMode = eidosFileCalendarCreateMode(dateField)
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const firstWeekday = new Date(2026, 0, (weekStartsOnMonday ? 5 : 4) + index)
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
      firstWeekday
    )
  })
  const previousPeriodLabel =
    layout === "month" ? t("Previous month") : t("Previous week")
  const nextPeriodLabel = layout === "month" ? t("Next month") : t("Next week")
  const calendarGridClassName = "min-w-[49rem] grid-cols-7"

  const changeLayout = (nextLayout: EidosFileCalendarLayout) => {
    if (nextLayout === layout) return
    const previousLayout = layout
    setLayout(nextLayout)
    setExpandedDays(new Set())
    if (!onLayoutChange) return
    void Promise.resolve()
      .then(() => onLayoutChange(nextLayout))
      .catch((error) => {
        setLayout(previousLayout)
        onError?.(error)
      })
  }

  const canCreateOnDay = (key: string) =>
    Boolean(onAddRow) &&
    !disabled &&
    (createMode === "all-days" || (createMode === "today" && key === todayKey))

  const renderCreateButton = (day: Date, key: string) =>
    canCreateOnDay(key) ? (
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 outline-hidden hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100 disabled:cursor-wait disabled:opacity-50"
        aria-label={t("New record on {date}", { date: key })}
        title={t("New record")}
        disabled={creatingDay !== null}
        onClick={() => void createRecord(day)}
      >
        {creatingDay === key ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </button>
    ) : null

  const activateDayExpansion = (
    day: Date,
    key: string,
    dayPage: EidosFileCalendarDayPage | undefined,
    expanded: boolean
  ) => {
    if (!expanded) {
      setExpandedDays((current) => new Set(current).add(key))
      if (dayPage?.nextCursor) void loadMoreDay(day, key)
      return
    }
    if (dayPage?.nextCursor) {
      void loadMoreDay(day, key)
      return
    }
    setExpandedDays((current) => {
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  const renderDayMoreButton = (
    day: Date,
    key: string,
    dayPage: EidosFileCalendarDayPage | undefined,
    expanded: boolean,
    className?: string
  ) => {
    if ((dayPage?.total ?? 0) <= collapsedDayLimit) return null
    return (
      <button
        type="button"
        className={cn(
          "w-fit rounded px-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
          className
        )}
        disabled={dayPage?.loadingMore}
        aria-expanded={expanded}
        title={dayPage?.loadMoreError ?? undefined}
        onClick={() => activateDayExpansion(day, key, dayPage, expanded)}
      >
        {dayPage?.loadingMore
          ? t("Loading more records…")
          : expanded && dayPage?.nextCursor
            ? t("Load more")
            : expanded
              ? t("Show less")
              : t("{count} more", {
                  count: (dayPage?.total ?? 0) - collapsedDayLimit,
                })}
      </button>
    )
  }

  const renderRecordCard = (
    row: EidosFileRow,
    {
      showTime = false,
      className,
    }: {
      showTime?: boolean
      className?: string
    } = {}
  ) => {
    const title = eidosFileRecordTitle(row, table.fields)
    const timeLabel = showTime
      ? calendarRowTimeLabel(row, dateField, timeZone)
      : null
    return (
      <ContextMenu key={String(row._id)}>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex min-w-0 items-baseline gap-1.5 rounded-[3px] border border-primary/15 bg-primary/10 px-1.5 py-1 text-left text-[11px] leading-4 text-foreground outline-hidden hover:bg-primary/15 focus-visible:ring-1 focus-visible:ring-ring",
              className
            )}
            title={timeLabel ? `${timeLabel} ${title}` : title}
            onClick={() => openInspectorRow(row)}
          >
            {timeLabel ? (
              <time
                className="shrink-0 tabular-nums text-muted-foreground"
                dateTime={String(row[dateField.tableColumnName])}
                data-eidos-file-calendar-record-time
              >
                {timeLabel}
              </time>
            ) : null}
            <span className="min-w-0 truncate">
              {title === "Empty" ? t("Untitled") : title}
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-44"
          data-eidos-file-calendar-record-menu=""
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <ContextMenuItem onSelect={() => openInspectorRow(row)}>
            <PanelRightOpen />
            {t("Open record")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => copyRecordId(String(row._id))}>
            <Copy />
            {t("Copy record ID")}
          </ContextMenuItem>
          {onDeleteRow && !disabled ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleteRow(row)}
              >
                <Trash2 />
                {t("Delete record")}
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return (
    <div className="eidos-file-detail-layout flex h-full min-h-0 w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-10 shrink-0 items-center gap-3 border-b px-3">
          <h2 className="min-w-0 truncate text-sm font-semibold tabular-nums">
            {calendarPeriodLabel(anchorDate, layout, range)}
          </h2>
          <div
            className="ml-auto flex shrink-0 items-center rounded-md border border-border/70 p-0.5"
            role="group"
            aria-label={t("Calendar layout")}
          >
            {(["month", "week"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={cn(
                  "h-6 rounded px-2 text-[11px] font-medium text-muted-foreground outline-hidden hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
                  layout === candidate && "bg-accent text-accent-foreground"
                )}
                aria-pressed={layout === candidate}
                disabled={disabled}
                onClick={() => changeLayout(candidate)}
              >
                {t(candidate === "month" ? "Month" : "Week")}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={previousPeriodLabel}
              onClick={() =>
                setAnchorDate((current) =>
                  shiftCalendarAnchor(current, layout, -1)
                )
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-fit px-2.5 text-xs"
              onClick={() =>
                setAnchorDate(eidosFileWallDate(new Date(), timeZone))
              }
            >
              {t("Today")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={nextPeriodLabel}
              onClick={() =>
                setAnchorDate((current) =>
                  shiftCalendarAnchor(current, layout, 1)
                )
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <div
          className="min-h-0 flex-1 overflow-auto"
          aria-busy={loading}
          data-eidos-file-calendar
          data-eidos-file-calendar-layout={layout}
        >
          <div
            className={cn(
              "sticky top-0 z-10 grid border-b bg-background",
              calendarGridClassName
            )}
            data-eidos-file-calendar-weekdays
          >
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="border-r px-2 py-1.5 text-[11px] font-medium text-muted-foreground last:border-r-0"
              >
                {label}
              </div>
            ))}
          </div>
          {loading && dayPages.size === 0 ? (
            <div
              className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground"
              role="status"
            >
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              {t("Loading calendar…")}
            </div>
          ) : loadError ? (
            <div
              className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground"
              role="alert"
            >
              <span>{t("Could not load calendar records.")}</span>
              <span className="max-w-md break-words text-center text-destructive">
                {loadError}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => void requestRows()}
              >
                {t("Retry")}
              </Button>
            </div>
          ) : (
            <div
              className={cn("grid", calendarGridClassName)}
              role="grid"
              aria-label={t("{view} calendar", { view: view.name })}
            >
              {days.map((day) => {
                const key = localDateKey(day)
                const dayPage = dayPages.get(key)
                const dayRows = dayPage?.rows ?? []
                const expanded = expandedDays.has(key)
                const visibleRows = expanded
                  ? dayRows
                  : dayRows.slice(0, collapsedDayLimit)
                const currentMonth =
                  layout === "week" || day.getMonth() === anchorDate.getMonth()
                return (
                  <div
                    key={key}
                    role="gridcell"
                    aria-label={day.toLocaleDateString()}
                    className={cn(
                      "group border-b border-r p-1.5 last:border-r-0",
                      layout === "month" ? "min-h-28" : "min-h-[24rem]"
                    )}
                    data-eidos-file-calendar-day={key}
                  >
                    <div className="mb-1 flex h-6 items-center justify-between">
                      <time
                        dateTime={key}
                        className={
                          key === todayKey
                            ? "flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
                            : currentMonth
                              ? "px-1 text-[11px] font-medium tabular-nums"
                              : "px-1 text-[11px] tabular-nums text-muted-foreground/60"
                        }
                      >
                        {day.getDate()}
                      </time>
                      {renderCreateButton(day, key)}
                    </div>
                    <div className="grid gap-1">
                      {visibleRows.map((row) =>
                        renderRecordCard(row, {
                          showTime: layout === "week",
                          className: "w-full",
                        })
                      )}
                      {renderDayMoreButton(day, key, dayPage, expanded)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {sidePanel ??
        (inspectedRow ? (
          <EidosFileRecordInspector
            row={inspectedRow}
            fields={fields}
            onClose={closeInspectorRow}
            onCopyRecordId={copyRecordId}
            onCellEdit={onCellEdit ? editRecord : undefined}
            disabled={disabled}
            loading={inspectorLoading}
            loadError={inspectorLoadError}
            onRetryLoad={retryInspectorRow}
            onError={onError}
            onImportFiles={onImportFiles}
            onImportDroppedFiles={onImportDroppedFiles}
            onSearchRelation={onSearchRelation}
          />
        ) : null)}
      {onDeleteRow ? (
        <EidosFileRecordDeleteDialog
          row={deleteRow}
          fields={table.fields}
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
}
