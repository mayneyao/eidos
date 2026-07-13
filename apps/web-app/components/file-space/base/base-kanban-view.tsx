import {
  memo,
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
  BaseRowGroupCount,
  BaseRowMutationResult,
  BaseRowPage,
  BaseRelationValue,
  BaseSqlPrimitive,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import type { SpaceBinaryFile } from "@eidos.space/file-space"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronLeft, ChevronRight, LoaderCircle, Plus } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  KanbanBoard,
  KanbanCard,
  KanbanHeader,
  KanbanProvider,
  type DragEndEvent,
} from "@/components/ui/kibo-ui/kanban"

import {
  baseOptionColor,
  baseSelectOptions,
  type BaseSelectOption,
} from "./base-field-properties"
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
  type BaseRowWindowRequest,
} from "./base-row-window"
import { orderedBaseFields } from "./base-view-layout"
import { useBaseCoverReader } from "./use-base-cover-reader"
import type { BaseCoverLease } from "./use-base-cover-reader"

const KANBAN_PAGE_SIZE = 50
const KANBAN_MAX_WINDOW_ROWS = 150
const KANBAN_COLUMN_GAP = 12
const KANBAN_COLUMN_CACHE_MARGIN = 2
const KANBAN_PREFETCH_ROWS = Math.floor(KANBAN_PAGE_SIZE / 2)
const EMPTY_GROUP_VALUE = "__eidos_empty_group__"

interface BaseKanbanGroup {
  key: string
  value: string | null
  name: string
  color: string
  rows: BaseRow[]
  startOffset: number
  total: number
  loaded: boolean
  loadFailure: BaseRowWindowRequest | null
  loading: boolean
  loadingMore: boolean
  needsReload: boolean
}

interface BaseKanbanMoveOption {
  id: string
  label: string
}

function groupKey(value: string | null): string {
  return `base-kanban:${value ?? EMPTY_GROUP_VALUE}`
}

function kanbanMutationErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unable to create record"
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
}

function groupSpecs(options: BaseSelectOption[]): BaseKanbanGroup[] {
  return [
    ...options.map((option) => ({
      key: groupKey(option.id),
      value: option.id,
      name: option.name,
      color: option.color,
      rows: [],
      startOffset: 0,
      total: 0,
      loaded: false,
      loadFailure: null,
      loading: false,
      loadingMore: false,
      needsReload: false,
    })),
    {
      key: groupKey(null),
      value: null,
      name: "No status",
      color: "gray",
      rows: [],
      startOffset: 0,
      total: 0,
      loaded: false,
      loadFailure: null,
      loading: false,
      loadingMore: false,
      needsReload: false,
    },
  ]
}

function cardWidth(view: BaseViewInfo): number {
  if (view.properties?.cardSize === "small") return 248
  if (view.properties?.cardSize === "large") return 336
  return 288
}

function estimatedKanbanCardHeight(layout: BaseRecordCardLayout): number {
  const visibleFieldCount = Math.min(layout.fields.length, layout.fieldLimit)
  return 64 + (layout.coverField ? 112 : 0) + visibleFieldCount * 32
}

function replaceLoadedRow(
  groups: BaseKanbanGroup[],
  rowId: string,
  nextRow: BaseRow
): BaseKanbanGroup[] {
  let changed = false
  const nextGroups = groups.map((group) => {
    const rowIndex = group.rows.findIndex(
      (candidate) => String(candidate._id) === rowId
    )
    if (rowIndex < 0) return group
    const rows = [...group.rows]
    rows[rowIndex] = nextRow
    changed = true
    return { ...group, rows }
  })
  return changed ? nextGroups : groups
}

const BaseKanbanCardItem = memo(function BaseKanbanCardItem({
  row,
  index,
  groupKey,
  disabled,
  table,
  view,
  cardLayout,
  acquireCover,
  focused,
  onOpen,
  onDelete,
  moveOptions,
  onMove,
}: {
  row: BaseRow
  index: number
  groupKey: string
  disabled: boolean
  table: BaseTableSnapshot
  view: BaseViewInfo
  cardLayout: BaseRecordCardLayout
  acquireCover?: (path: string) => Promise<BaseCoverLease>
  focused: boolean
  onOpen: (row: BaseRow) => void
  onDelete?: (row: BaseRow) => void
  moveOptions: Array<{
    id: string
    label: string
    disabled?: boolean
  }>
  onMove: (row: BaseRow, targetGroupKey: string) => void
}) {
  return (
    <KanbanCard
      id={String(row._id)}
      name={String(row.title ?? "Untitled")}
      index={index}
      parent={groupKey}
      disabled={disabled}
      className="rounded-lg border-0 bg-transparent shadow-none"
    >
      <BaseRecordCard
        row={row}
        fields={table.fields}
        view={view}
        layout={cardLayout}
        compact
        acquireCover={acquireCover}
        focused={focused}
        onOpen={onOpen}
        onDelete={onDelete}
        moveOptions={moveOptions}
        onMove={onMove}
      />
    </KanbanCard>
  )
})

const BaseKanbanColumn = memo(function BaseKanbanColumn({
  group,
  table,
  view,
  cardLayout,
  disabled,
  width,
  color,
  onOpen,
  onRequestRange,
  onRetry,
  onCreate,
  acquireCover,
  onDelete,
  moveOptions,
  onMove,
  focusedRowId,
  focusedRowIndex,
  collapsed,
  onCollapsedChange,
}: {
  group: BaseKanbanGroup
  table: BaseTableSnapshot
  view: BaseViewInfo
  cardLayout: BaseRecordCardLayout
  disabled: boolean
  width: number
  color: string
  onOpen: (row: BaseRow) => void
  onRequestRange: (
    group: BaseKanbanGroup,
    visibleStart: number,
    visibleEnd: number
  ) => void
  onRetry: (group: BaseKanbanGroup) => void
  onCreate: (group: BaseKanbanGroup, title: string) => Promise<void>
  acquireCover?: (path: string) => Promise<BaseCoverLease>
  onDelete?: (row: BaseRow) => void
  moveOptions: BaseKanbanMoveOption[]
  onMove: (rowId: string, targetGroupKey: string) => void
  focusedRowId?: string
  focusedRowIndex?: number
  collapsed: boolean
  onCollapsedChange: (groupKey: string, collapsed: boolean) => void
}) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const groupWindow = {
    rows: group.rows,
    startOffset: group.startOffset,
    total: group.total,
  }
  const cardVirtualizer = useVirtualizer({
    count: group.total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedKanbanCardHeight(cardLayout),
    getItemKey: (index) =>
      String(rowFromWindow(groupWindow, index)?._id ?? `${group.key}:${index}`),
    gap: 8,
    initialRect: { width, height: 560 },
    overscan: 3,
    useAnimationFrameWithResizeObserver: true,
  })
  const virtualItems = cardVirtualizer.getVirtualItems()
  const cardMoveOptions = useMemo(
    () =>
      moveOptions.map((option) => ({
        ...option,
        disabled: option.id === group.key,
      })),
    [group.key, moveOptions]
  )
  const moveCard = useCallback(
    (row: BaseRow, targetGroupKey: string) =>
      onMove(String(row._id), targetGroupKey),
    [onMove]
  )

  useEffect(() => {
    const first = virtualItems.at(0)
    const last = virtualItems.at(-1)
    if (!first || !last || !group.loaded) return
    onRequestRange(group, first.index, last.index + 1)
  }, [group, onRequestRange, virtualItems])

  useEffect(() => {
    if (
      focusedRowIndex === undefined ||
      focusedRowIndex < 0 ||
      focusedRowIndex >= group.total
    ) {
      return
    }
    let active = true
    queueMicrotask(() => {
      if (active) {
        cardVirtualizer.scrollToIndex(focusedRowIndex, { align: "auto" })
      }
    })
    return () => {
      active = false
    }
  }, [cardVirtualizer, focusedRowIndex, group.total])

  useEffect(() => {
    cardVirtualizer.measure()
  }, [cardVirtualizer, table.fields, view.properties])

  const create = async () => {
    const next = title.trim()
    if (!next || creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    setCreateError(null)
    try {
      await onCreate(group, next)
      setTitle("")
      setAdding(false)
    } catch (error) {
      setCreateError(kanbanMutationErrorMessage(error))
    } finally {
      creatingRef.current = false
      setCreating(false)
    }
  }

  return (
    <KanbanBoard
      id={group.key}
      role="region"
      aria-label={`${group.name}, ${group.total} records`}
      className={cn(
        "shrink-0 gap-2 rounded-lg border p-2",
        collapsed && "items-center"
      )}
      style={{
        width: collapsed ? 48 : width,
        backgroundColor: `${color}22`,
      }}
    >
      <KanbanHeader>
        <div
          className={cn(
            "flex min-h-7 items-center gap-2",
            collapsed && "flex-col"
          )}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-foreground/10"
            style={{ backgroundColor: color }}
          />
          {collapsed ? (
            <button
              type="button"
              className="flex flex-1 items-center text-[11px] font-medium [writing-mode:vertical-rl]"
              aria-label={`Expand ${group.name}`}
              onClick={() => onCollapsedChange(group.key, false)}
            >
              {group.name} · {group.total}
            </button>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {group.name}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {group.total}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`Collapse ${group.name}`}
                onClick={() => onCollapsedChange(group.key, true)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </KanbanHeader>
      {collapsed ? (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <>
          <div
            ref={scrollRef}
            data-base-kanban-column-scroll={group.key}
            data-base-window-size={group.rows.length}
            data-base-window-start={group.startOffset}
            className="relative min-h-16 min-w-0 flex-1 overflow-y-auto pr-0.5"
          >
            {(group.loading || !group.loaded) && group.rows.length === 0 ? (
              <div
                className="flex h-20 items-center justify-center"
                role="status"
                aria-label={`Loading ${group.name} records`}
              >
                <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" />
              </div>
            ) : group.loadFailure?.mode === "replace" &&
              group.rows.length === 0 ? (
              <div
                className="flex h-20 flex-col items-center justify-center gap-1 text-[11px] text-destructive"
                role="alert"
              >
                <span>Could not load records</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => onRetry(group)}
                >
                  Retry
                </Button>
              </div>
            ) : group.rows.length === 0 ? (
              <div className="flex h-16 items-center justify-center text-[11px] text-muted-foreground">
                No records
              </div>
            ) : (
              <div
                className="relative w-full"
                style={{ height: cardVirtualizer.getTotalSize() }}
              >
                {virtualItems.map((virtualItem) => {
                  const row = rowFromWindow(groupWindow, virtualItem.index)
                  return (
                    <div
                      key={virtualItem.key}
                      ref={cardVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full [contain:layout_style]"
                      data-index={virtualItem.index}
                      style={{
                        transform: `translate3d(0, ${virtualItem.start}px, 0)`,
                      }}
                    >
                      {row ? (
                        <BaseKanbanCardItem
                          row={row}
                          index={virtualItem.index}
                          groupKey={group.key}
                          disabled={disabled}
                          table={table}
                          view={view}
                          cardLayout={cardLayout}
                          acquireCover={acquireCover}
                          focused={focusedRowId === String(row._id)}
                          onOpen={onOpen}
                          onDelete={onDelete}
                          moveOptions={cardMoveOptions}
                          onMove={moveCard}
                        />
                      ) : (
                        <div
                          data-base-kanban-placeholder
                          className="flex h-9 items-center justify-center text-muted-foreground"
                          role={group.loadFailure !== null ? "alert" : "status"}
                          aria-label={
                            group.loadFailure !== null
                              ? `Could not load more ${group.name} records`
                              : `Loading more ${group.name} records`
                          }
                        >
                          {group.loadFailure !== null ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => onRetry(group)}
                            >
                              Retry loading records
                            </Button>
                          ) : group.loadingMore ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                          ) : null}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {group.loadFailure?.mode === "replace" && group.rows.length > 0 ? (
            <div
              className="flex h-8 shrink-0 items-center justify-center gap-1 text-[11px] text-destructive"
              role="alert"
            >
              <span>Could not refresh records.</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => onRetry(group)}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {adding ? (
            <div className="grid gap-1.5 rounded-md border bg-background p-2 shadow-sm">
              <Input
                autoFocus
                value={title}
                className="h-7 text-xs"
                placeholder="Record title"
                aria-label={`Record title in ${group.name}`}
                disabled={creating}
                onChange={(event) => {
                  setTitle(event.target.value)
                  if (createError) setCreateError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void create()
                  if (event.key === "Escape" && !creatingRef.current) {
                    setAdding(false)
                    setTitle("")
                    setCreateError(null)
                  }
                }}
              />
              {createError ? (
                <p
                  className="break-words text-[11px] leading-4 text-destructive"
                  role="alert"
                >
                  {createError}
                </p>
              ) : null}
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={creating}
                  onClick={() => {
                    setAdding(false)
                    setTitle("")
                    setCreateError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={creating || !title.trim()}
                  onClick={() => void create()}
                >
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 justify-start gap-1.5 text-[11px] text-muted-foreground"
              disabled={disabled || !group.loaded}
              onClick={() => {
                setCreateError(null)
                setAdding(true)
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add record
            </Button>
          )}
        </>
      )}
    </KanbanBoard>
  )
})

export function BaseKanbanView({
  table,
  view,
  disabled = false,
  reloadToken = 0,
  searchResultIndex = null,
  loadGroupCounts,
  loadGroupPage,
  onCellEdit,
  onAddRow,
  readBinary,
  onDeleteRow,
  onImportFiles,
  onImportDroppedFiles,
  onSearchRelation,
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
  loadGroupCounts: (field: BaseFieldInfo) => Promise<BaseRowGroupCount[]>
  loadGroupPage: (
    field: BaseFieldInfo,
    value: string | null,
    offset: number,
    limit: number,
    totalHint: number
  ) => Promise<BaseRowPage>
  onCellEdit: (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => Promise<BaseRowMutationResult>
  onAddRow: (
    field: BaseFieldInfo,
    value: string | null,
    title: string
  ) => Promise<BaseRowMutationResult>
  readBinary?: (path: string) => Promise<SpaceBinaryFile>
  onDeleteRow?: (row: BaseRow) => Promise<void>
  onImportFiles?: () => Promise<string[]>
  onImportDroppedFiles?: (files: File[]) => Promise<string[]>
  onSearchRelation?: (
    field: BaseFieldInfo,
    query: string
  ) => Promise<BaseRelationValue[]>
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => Promise<void> | void
  onRowCountChange?: (rowCount: number | null) => void
  onError?: (error: unknown) => void
  sidePanel?: ReactNode
}) {
  const acquireCover = useBaseCoverReader(readBinary)
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"
  const generationRef = useRef(0)
  const loadingInitialGroupsRef = useRef(new Map<string, number>())
  const loadingMoreGroupsRef = useRef(new Map<string, number>())
  const loadedGroupGenerationsRef = useRef(new Map<string, number>())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const groupFieldName = view.properties?.groupByField
  const groupField = table.fields.find(
    (field) =>
      field.tableColumnName === groupFieldName && field.type === "select"
  )
  const options = useMemo(
    () => (groupField ? baseSelectOptions(groupField) : []),
    [groupField]
  )
  const optionSignature = useMemo(
    () =>
      options
        .map((option) => `${option.id}:${option.name}:${option.color}`)
        .join("|"),
    [options]
  )
  const [groups, setGroups] = useState<BaseKanbanGroup[]>(() =>
    groupField ? groupSpecs(options) : []
  )
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const [countsLoaded, setCountsLoaded] = useState(false)
  const [countsFailure, setCountsFailure] = useState(false)
  const [countsRetryToken, setCountsRetryToken] = useState(0)
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    new Set()
  )
  const [dragging, setDragging] = useState(false)
  const [moveAnnouncement, setMoveAnnouncement] = useState("")
  const [inspectedRow, setInspectedRow] = useState<BaseRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<BaseRow | null>(null)
  const fields = useMemo(
    () => orderedBaseFields(table.fields, view),
    [table.fields, view]
  )
  const cardLayout = useMemo(
    () => createBaseRecordCardLayout(table.fields, view, true),
    [table.fields, view]
  )
  const { boardBusy, cachedGroupWindowCount, groupedRowCount, hasUsableBoard } =
    useMemo(() => {
      let cachedGroupWindowCount = 0
      let groupedRowCount = 0
      let hasBusyGroup = false
      let hasUsableBoard = false
      for (const group of groups) {
        groupedRowCount += group.total
        if (group.rows.length > 0) cachedGroupWindowCount += 1
        if (group.loading || group.loadingMore) hasBusyGroup = true
        if (group.loaded) hasUsableBoard = true
      }
      return {
        boardBusy: (!countsLoaded && !countsFailure) || hasBusyGroup,
        cachedGroupWindowCount,
        groupedRowCount,
        hasUsableBoard,
      }
    }, [countsFailure, countsLoaded, groups])
  const collapsedGroupSignature = useMemo(
    () => [...collapsedGroupKeys].sort().join("|"),
    [collapsedGroupKeys]
  )
  const columnWidth = cardWidth(view)
  const moveOptions = useMemo<BaseKanbanMoveOption[]>(
    () => [
      ...options.map((option) => ({
        id: groupKey(option.id),
        label: option.name,
      })),
      { id: groupKey(null), label: "No status" },
    ],
    [options]
  )
  const columnVirtualizer = useVirtualizer({
    count: moveOptions.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) =>
      collapsedGroupKeys.has(moveOptions[index]?.id ?? "") ? 48 : columnWidth,
    getItemKey: (index) => moveOptions[index]?.id ?? index,
    gap: KANBAN_COLUMN_GAP,
    horizontal: true,
    initialRect: { width: 1024, height: 640 },
    overscan: 2,
    useAnimationFrameWithResizeObserver: true,
  })
  const virtualColumns = columnVirtualizer.getVirtualItems()
  const { estimatedColumnStarts, estimatedTotalWidth } = useMemo(() => {
    const starts: number[] = []
    let totalWidth = 0
    moveOptions.forEach((option, index) => {
      starts.push(totalWidth)
      totalWidth += collapsedGroupKeys.has(option.id) ? 48 : columnWidth
      if (index < moveOptions.length - 1) totalWidth += KANBAN_COLUMN_GAP
    })
    return {
      estimatedColumnStarts: starts,
      estimatedTotalWidth: totalWidth,
    }
  }, [collapsedGroupKeys, columnWidth, moveOptions])
  const renderedColumns =
    virtualColumns.length > 0
      ? virtualColumns
      : groups.slice(0, 4).map((group, index) => ({
          index,
          key: group.key,
          size: collapsedGroupKeys.has(group.key) ? 48 : columnWidth,
          start: estimatedColumnStarts[index] ?? 0,
        }))
  const virtualColumnSignature = renderedColumns
    .map((column) => column.index)
    .join("|")
  const firstRenderedColumnIndex = renderedColumns[0]?.index ?? 0
  const lastRenderedColumnIndex =
    renderedColumns.at(-1)?.index ?? firstRenderedColumnIndex
  const visibleGroupLoadSignature = renderedColumns
    .map((column) => {
      const group = groups[column.index]
      return group
        ? `${group.key}:${group.loaded ? 1 : 0}:${group.loading ? 1 : 0}`
        : "missing"
    })
    .join("|")

  useEffect(() => {
    columnVirtualizer.measure()
  }, [collapsedGroupSignature, columnVirtualizer, columnWidth, groups.length])

  const setGroupCollapsed = useCallback(
    (groupKey: string, collapsed: boolean) => {
      setCollapsedGroupKeys((current) => {
        const hasKey = current.has(groupKey)
        if (hasKey === collapsed) return current
        const next = new Set(current)
        collapsed ? next.add(groupKey) : next.delete(groupKey)
        return next
      })
    },
    []
  )

  useEffect(() => {
    generationRef.current += 1
    loadingInitialGroupsRef.current.clear()
    loadingMoreGroupsRef.current.clear()
    const generation = generationRef.current
    setInspectedRow(null)
    onRowCountChange?.(null)
    if (!groupField) {
      setGroups([])
      setCountsLoaded(false)
      setCountsFailure(false)
      return
    }
    const specs = groupSpecs(options)
    setGroups((current) => {
      const currentByKey = new Map(current.map((group) => [group.key, group]))
      return specs.map((spec) => {
        const existing = currentByKey.get(spec.key)
        return existing
          ? {
              ...existing,
              value: spec.value,
              name: spec.name,
              color: spec.color,
            }
          : spec
      })
    })
    setCountsLoaded(false)
    setCountsFailure(false)
    void loadGroupCounts(groupField)
      .then((counts) => {
        if (generation !== generationRef.current) return
        const totals = new Map(
          counts.map((group) => [
            groupKey(group.value === null ? null : String(group.value)),
            group.total,
          ])
        )
        setGroups((current) => {
          const currentByKey = new Map(
            current.map((group) => [group.key, group])
          )
          return specs.map((spec) => {
            const existing = currentByKey.get(spec.key)
            const refreshedForGeneration =
              loadedGroupGenerationsRef.current.get(spec.key) === generation ||
              loadingInitialGroupsRef.current.get(spec.key) === generation
            return {
              ...(existing ?? spec),
              value: spec.value,
              name: spec.name,
              color: spec.color,
              total: totals.get(spec.key) ?? 0,
              loaded: refreshedForGeneration
                ? (existing?.loaded ?? false)
                : false,
              loadFailure: refreshedForGeneration
                ? (existing?.loadFailure ?? null)
                : null,
              loading: refreshedForGeneration
                ? (existing?.loading ?? false)
                : false,
              loadingMore: false,
            }
          })
        })
        setCountsLoaded(true)
        setCountsFailure(false)
      })
      .catch(() => {
        if (generation !== generationRef.current) return
        setCountsLoaded(false)
        setCountsFailure(true)
      })
    return () => {
      generationRef.current += 1
    }
  }, [
    groupField,
    loadGroupCounts,
    optionSignature,
    countsRetryToken,
    reloadToken,
    table.table.id,
    view.id,
    onRowCountChange,
  ])

  useEffect(() => {
    if (!countsLoaded || groups.length === 0) return
    onRowCountChange?.(groupedRowCount)
  }, [countsLoaded, groupedRowCount, onRowCountChange])

  const loadGroupWindow = useCallback(
    async (
      group: BaseKanbanGroup,
      request: BaseRowWindowRequest,
      retry = false
    ) => {
      if (
        !groupField ||
        group.loading ||
        group.loadingMore ||
        (!retry &&
          group.loadFailure?.offset === request.offset &&
          group.loadFailure.mode === request.mode)
      ) {
        return
      }
      const generation = generationRef.current
      const requestMap =
        request.mode === "replace"
          ? loadingInitialGroupsRef.current
          : loadingMoreGroupsRef.current
      if (requestMap.has(group.key)) return
      requestMap.set(group.key, generation)
      setGroups((current) =>
        current.map((candidate) =>
          candidate.key === group.key
            ? {
                ...candidate,
                loadFailure: null,
                loading: request.mode === "replace",
                loadingMore: request.mode !== "replace",
              }
            : candidate
        )
      )
      try {
        const page = await loadGroupPage(
          groupField,
          group.value,
          request.offset,
          KANBAN_PAGE_SIZE,
          group.total
        )
        if (generation !== generationRef.current) return
        loadedGroupGenerationsRef.current.set(group.key, generation)
        setGroups((current) =>
          current.map((candidate) => {
            if (candidate.key !== group.key) return candidate
            const merged = mergeRowWindowPage(
              {
                rows: candidate.rows,
                startOffset: candidate.startOffset,
                total: candidate.total,
              },
              page,
              request.mode,
              KANBAN_MAX_WINDOW_ROWS
            )
            return {
              ...candidate,
              ...merged,
              loaded: true,
              loadFailure: null,
              loading: false,
              loadingMore: false,
              needsReload: false,
            }
          })
        )
      } catch {
        if (generation !== generationRef.current) return
        loadedGroupGenerationsRef.current.set(group.key, generation)
        setGroups((current) =>
          current.map((candidate) =>
            candidate.key === group.key
              ? {
                  ...candidate,
                  loaded: true,
                  loadFailure: request,
                  loading: false,
                  loadingMore: false,
                }
              : candidate
          )
        )
      } finally {
        if (requestMap.get(group.key) === generation) {
          requestMap.delete(group.key)
        }
      }
    },
    [groupField, loadGroupPage]
  )

  const loadInitialGroup = useCallback(
    (group: BaseKanbanGroup) => {
      if (group.loaded) return Promise.resolve()
      return loadGroupWindow(group, { mode: "replace", offset: 0 })
    },
    [loadGroupWindow]
  )

  useEffect(() => {
    if (!countsLoaded || dragging) return
    const currentGroups = groupsRef.current
    for (const column of renderedColumns) {
      const group = currentGroups[column.index]
      if (group && !collapsedGroupKeys.has(group.key)) {
        void loadInitialGroup(group)
      }
    }
  }, [
    collapsedGroupKeys,
    collapsedGroupSignature,
    countsLoaded,
    dragging,
    loadInitialGroup,
    virtualColumnSignature,
    visibleGroupLoadSignature,
  ])

  const requestGroupRange = useCallback(
    (group: BaseKanbanGroup, visibleStart: number, visibleEnd: number) => {
      if (group.loading || group.loadingMore) return
      const request = requestForPrefetchedRowWindow(
        {
          rows: group.rows,
          startOffset: group.startOffset,
          total: group.total,
        },
        visibleStart,
        visibleEnd,
        KANBAN_PAGE_SIZE,
        KANBAN_PREFETCH_ROWS
      )
      if (request) {
        void loadGroupWindow(
          group,
          group.needsReload ? { mode: "replace", offset: 0 } : request
        )
      }
    },
    [loadGroupWindow]
  )

  useEffect(() => {
    if (!countsLoaded || dragging || groups.length === 0) return
    const keepStart = Math.max(
      0,
      firstRenderedColumnIndex - KANBAN_COLUMN_CACHE_MARGIN
    )
    const keepEnd = Math.min(
      groups.length - 1,
      lastRenderedColumnIndex + KANBAN_COLUMN_CACHE_MARGIN
    )

    setGroups((current) => {
      let changed = false
      const next = current.map((group, index) => {
        if (
          (index >= keepStart && index <= keepEnd) ||
          group.rows.length === 0 ||
          group.loading ||
          group.loadingMore
        ) {
          return group
        }
        changed = true
        return {
          ...group,
          rows: [],
          startOffset: 0,
          loaded: false,
          loadFailure: null,
          needsReload: false,
        }
      })
      return changed ? next : current
    })
  }, [
    countsLoaded,
    dragging,
    firstRenderedColumnIndex,
    groups,
    lastRenderedColumnIndex,
  ])

  const retryGroup = useCallback(
    (group: BaseKanbanGroup) => {
      if (group.loadFailure) {
        void loadGroupWindow(group, group.loadFailure, true)
      }
    },
    [loadGroupWindow]
  )

  let focusedGroup: BaseKanbanGroup | undefined
  let focusedGroupIndex = -1
  if (searchResultIndex !== null && searchResultIndex >= 0) {
    let remaining = searchResultIndex
    for (const group of groups) {
      if (remaining < group.total) {
        focusedGroup = group
        focusedGroupIndex = remaining
        break
      }
      remaining -= group.total
    }
  }
  const focusedRow =
    focusedGroup && focusedGroupIndex >= 0
      ? rowFromWindow(
          {
            rows: focusedGroup.rows,
            startOffset: focusedGroup.startOffset,
            total: focusedGroup.total,
          },
          focusedGroupIndex
        )
      : undefined
  const focusedGroupPosition = focusedGroup
    ? groups.findIndex((group) => group.key === focusedGroup?.key)
    : -1

  useEffect(() => {
    if (!focusedGroup || focusedGroupPosition < 0) return
    setGroupCollapsed(focusedGroup.key, false)
    let active = true
    queueMicrotask(() => {
      if (active) {
        columnVirtualizer.scrollToIndex(focusedGroupPosition, { align: "auto" })
      }
    })
    return () => {
      active = false
    }
  }, [columnVirtualizer, focusedGroup, focusedGroupPosition, setGroupCollapsed])

  const moveRecord = useCallback(
    (rowId: string, targetKey: string) => {
      if (!groupField || disabled) return false
      const currentGroups = groupsRef.current
      const source = currentGroups.find((group) =>
        group.rows.some((row) => String(row._id) === rowId)
      )
      const target = currentGroups.find((group) => group.key === targetKey)
      const row = source?.rows.find(
        (candidate) => String(candidate._id) === rowId
      )
      if (!source || !target || !row || source.key === target.key) return false

      const optimistic = {
        ...row,
        [groupField.tableColumnName]: target.value,
      }
      setGroups((current) =>
        current.map((group) => {
          if (group.key === source.key) {
            return {
              ...group,
              rows: group.rows.filter(
                (candidate) => String(candidate._id) !== rowId
              ),
              total: Math.max(0, group.total - 1),
            }
          }
          if (group.key === target.key) {
            const retainedRows =
              group.startOffset === 0
                ? group.rows.filter(
                    (candidate) => String(candidate._id) !== rowId
                  )
                : []
            return {
              ...group,
              rows: [optimistic, ...retainedRows].slice(
                0,
                KANBAN_MAX_WINDOW_ROWS
              ),
              startOffset: 0,
              total: group.total + 1,
              loaded: true,
              needsReload: true,
            }
          }
          return group
        })
      )
      const title = String(row.title ?? "Untitled")
      setMoveAnnouncement(
        `${title} moved from ${source.name} to ${target.name}.`
      )
      void onCellEdit(row, groupField, target.value)
        .then((result) => {
          setGroups((current) =>
            current.map((group) =>
              group.key === target.key
                ? {
                    ...group,
                    rows: group.rows.map((candidate) =>
                      String(candidate._id) === rowId ? result.row : candidate
                    ),
                  }
                : group
            )
          )
        })
        .catch(() => {
          const sourceIndex = source.rows.findIndex(
            (candidate) => String(candidate._id) === rowId
          )
          setGroups((current) =>
            current.map((group) => {
              if (group.key === source.key) {
                if (
                  group.rows.some(
                    (candidate) => String(candidate._id) === rowId
                  )
                ) {
                  return group
                }
                const rows = [...group.rows]
                rows.splice(Math.min(sourceIndex, rows.length), 0, row)
                return {
                  ...group,
                  rows,
                  total: group.total + 1,
                }
              }
              if (group.key === target.key) {
                const containedOptimisticRow = group.rows.some(
                  (candidate) => String(candidate._id) === rowId
                )
                return {
                  ...group,
                  rows: group.rows.filter(
                    (candidate) => String(candidate._id) !== rowId
                  ),
                  total: containedOptimisticRow
                    ? Math.max(0, group.total - 1)
                    : group.total,
                  startOffset: 0,
                  loaded: true,
                  needsReload: true,
                }
              }
              return group
            })
          )
          setMoveAnnouncement(
            `${title} could not be moved to ${target.name}. The change was reverted.`
          )
        })
      return true
    },
    [disabled, groupField, onCellEdit]
  )

  const dragEnd = (event: DragEndEvent) => {
    setDragging(false)
    if (!event.over) {
      setMoveAnnouncement("Record move cancelled.")
      return
    }
    if (!moveRecord(String(event.active.id), String(event.over.id))) {
      setMoveAnnouncement("Record was not moved.")
    }
  }

  const createInGroup = useCallback(
    async (group: BaseKanbanGroup, title: string) => {
      if (!groupField) return
      const result = await onAddRow(groupField, group.value, title)
      setGroups((current) =>
        current.map((candidate) =>
          candidate.key === group.key
            ? (() => {
                const retainedRows =
                  candidate.startOffset === 0 ? candidate.rows : []
                return {
                  ...candidate,
                  rows: [result.row, ...retainedRows].slice(
                    0,
                    KANBAN_MAX_WINDOW_ROWS
                  ),
                  startOffset: 0,
                  total: candidate.total + 1,
                  loaded: true,
                  needsReload: true,
                }
              })()
            : candidate
        )
      )
    },
    [groupField, onAddRow]
  )

  const copyRecordId = (id: string) => {
    if (!navigator.clipboard) {
      onError?.(new Error("Clipboard access is unavailable"))
      return
    }
    void navigator.clipboard.writeText(id).catch((error) => onError?.(error))
  }

  const editInspectedRecord = async (
    row: BaseRow,
    field: BaseFieldInfo,
    value: BaseSqlPrimitive
  ) => {
    if (!groupField) throw new Error("Kanban group field is unavailable")
    const result = await onCellEdit(row, field, value)
    const rowId = String(result.row._id)
    setGroups((current) => {
      if (field.tableColumnName !== groupField.tableColumnName) {
        return replaceLoadedRow(current, rowId, result.row)
      }

      const source = current.find((group) =>
        group.rows.some((candidate) => String(candidate._id) === rowId)
      )
      const nextGroupValue = result.row[groupField.tableColumnName]
      const target = current.find(
        (group) =>
          group.key ===
          groupKey(
            nextGroupValue === null || nextGroupValue === undefined
              ? null
              : String(nextGroupValue)
          )
      )
      if (!source || !target || source.key === target.key) {
        return replaceLoadedRow(current, rowId, result.row)
      }
      return current.map((group) => {
        if (group.key === source.key) {
          return {
            ...group,
            rows: group.rows.filter(
              (candidate) => String(candidate._id) !== rowId
            ),
            total: Math.max(0, group.total - 1),
          }
        }
        if (group.key === target.key) {
          const retainedRows =
            group.startOffset === 0
              ? group.rows.filter(
                  (candidate) => String(candidate._id) !== rowId
                )
              : []
          return {
            ...group,
            rows: [result.row, ...retainedRows].slice(
              0,
              KANBAN_MAX_WINDOW_ROWS
            ),
            startOffset: 0,
            total: group.total + 1,
            loaded: true,
            needsReload: true,
          }
        }
        return group
      })
    })
    setInspectedRow(result.row)
    return result
  }

  const deleteRecord = async (row: BaseRow) => {
    if (!onDeleteRow) return
    await onDeleteRow(row)
    const rowId = String(row._id)
    setGroups((current) =>
      current.map((group) => {
        const containsRow = group.rows.some(
          (candidate) => String(candidate._id) === rowId
        )
        if (!containsRow) return group
        return {
          ...group,
          rows: group.rows.filter(
            (candidate) => String(candidate._id) !== rowId
          ),
          total: Math.max(0, group.total - 1),
        }
      })
    )
    setInspectedRow((current) =>
      current && String(current._id) === rowId ? null : current
    )
  }

  if (!groupField) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div>
          <h2 className="text-sm font-medium">Choose a Select field</h2>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Open this view's settings and choose the Select field that should
            define Kanban columns.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="base-detail-layout flex h-full min-h-0 w-full overflow-hidden">
      <span
        className="sr-only"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      >
        {moveAnnouncement}
      </span>
      <div className="relative min-w-0 flex-1">
        {countsFailure && hasUsableBoard ? (
          <div
            className="absolute inset-x-3 top-3 z-20 flex h-8 items-center justify-center gap-2 border bg-background px-3 text-[11px] text-muted-foreground shadow-sm"
            role="alert"
          >
            <span>Could not refresh Kanban records.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setCountsRetryToken((current) => current + 1)}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <div
          ref={scrollContainerRef}
          data-base-kanban-scroll
          data-base-cached-group-windows={cachedGroupWindowCount}
          aria-busy={boardBusy}
          className="h-full min-w-0 overflow-x-auto overflow-y-hidden p-3"
        >
          {countsFailure && !hasUsableBoard ? (
            <div
              className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground"
              role="alert"
            >
              <span>Could not load Kanban records.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setCountsRetryToken((current) => current + 1)}
              >
                Retry
              </Button>
            </div>
          ) : (
            <KanbanProvider
              onDragEnd={dragEnd}
              onDragStart={() => setDragging(true)}
              onDragCancel={() => {
                setDragging(false)
                setMoveAnnouncement("Record move cancelled.")
              }}
              className="relative !block h-full"
            >
              <div
                className="relative h-full"
                style={{
                  width:
                    virtualColumns.length > 0
                      ? columnVirtualizer.getTotalSize()
                      : estimatedTotalWidth,
                }}
              >
                {renderedColumns.map((virtualColumn) => {
                  const group = groups[virtualColumn.index]
                  if (!group) return null
                  return (
                    <div
                      key={group.key}
                      className="absolute inset-y-0 left-0 [contain:layout_style]"
                      data-index={virtualColumn.index}
                      style={{
                        width: virtualColumn.size,
                        transform: `translate3d(${virtualColumn.start}px, 0, 0)`,
                      }}
                    >
                      <BaseKanbanColumn
                        group={group}
                        table={table}
                        view={view}
                        cardLayout={cardLayout}
                        disabled={disabled}
                        width={columnWidth}
                        color={baseOptionColor(group.color, theme)}
                        acquireCover={acquireCover}
                        onOpen={setInspectedRow}
                        onDelete={onDeleteRow ? setDeleteRow : undefined}
                        moveOptions={moveOptions}
                        onMove={moveRecord}
                        focusedRowId={
                          focusedGroup?.key === group.key && focusedRow
                            ? String(focusedRow._id)
                            : undefined
                        }
                        focusedRowIndex={
                          focusedGroup?.key === group.key &&
                          focusedGroupIndex >= 0
                            ? focusedGroupIndex
                            : undefined
                        }
                        collapsed={collapsedGroupKeys.has(group.key)}
                        onCollapsedChange={setGroupCollapsed}
                        onRequestRange={requestGroupRange}
                        onRetry={retryGroup}
                        onCreate={createInGroup}
                      />
                    </div>
                  )
                })}
              </div>
            </KanbanProvider>
          )}
        </div>
      </div>
      {sidePanel ??
        (inspectedRow ? (
          <BaseRecordInspector
            row={inspectedRow}
            fields={fields}
            onClose={() => setInspectedRow(null)}
            onCopyRecordId={copyRecordId}
            onCellEdit={editInspectedRecord}
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
