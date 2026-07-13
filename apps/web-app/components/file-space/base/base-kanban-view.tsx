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
  BaseRowGroupCount,
  BaseRowMutationResult,
  BaseRowPage,
  BaseRelationValue,
  BaseSqlPrimitive,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import type { SpaceBinaryFile } from "@eidos.space/file-space"
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
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
import { BaseRecordDeleteDialog } from "./base-record-delete-dialog"
import { BaseRecordInspector } from "./base-record-inspector"
import { orderedBaseFields } from "./base-view-layout"
import { useBaseCoverReader } from "./use-base-cover-reader"
import type { BaseCoverLease } from "./use-base-cover-reader"
import { useBaseVirtualLoadMore } from "./use-base-virtual-load-more"

const KANBAN_PAGE_SIZE = 50
const KANBAN_COLUMN_GAP = 12
const EMPTY_GROUP_VALUE = "__eidos_empty_group__"

interface BaseKanbanGroup {
  key: string
  value: string | null
  name: string
  color: string
  rows: BaseRow[]
  total: number
  nextOffset: number
  loaded: boolean
  loadFailed: boolean
  loading: boolean
  loadingMore: boolean
}

function groupKey(value: string | null): string {
  return `base-kanban:${value ?? EMPTY_GROUP_VALUE}`
}

function groupSpecs(options: BaseSelectOption[]): BaseKanbanGroup[] {
  return [
    ...options.map((option) => ({
      key: groupKey(option.id),
      value: option.id,
      name: option.name,
      color: option.color,
      rows: [],
      total: 0,
      nextOffset: 0,
      loaded: false,
      loadFailed: false,
      loading: false,
      loadingMore: false,
    })),
    {
      key: groupKey(null),
      value: null,
      name: "No status",
      color: "gray",
      rows: [],
      total: 0,
      nextOffset: 0,
      loaded: false,
      loadFailed: false,
      loading: false,
      loadingMore: false,
    },
  ]
}

function cardWidth(view: BaseViewInfo): number {
  if (view.properties?.cardSize === "small") return 248
  if (view.properties?.cardSize === "large") return 336
  return 288
}

function estimatedKanbanCardHeight(
  table: BaseTableSnapshot,
  view: BaseViewInfo
): number {
  const hasCover = typeof view.properties?.coverPreview === "string"
  const visibleFieldCount = orderedBaseFields(table.fields, view)
    .filter(
      (field) =>
        field.tableColumnName !== "title" && field.valueKind !== "system"
    )
    .slice(0, 4).length
  return 64 + (hasCover ? 112 : 0) + visibleFieldCount * 32
}

function BaseKanbanColumn({
  group,
  table,
  view,
  disabled,
  width,
  color,
  onOpen,
  onLoadMore,
  onCreate,
  acquireCover,
  onDelete,
  moveGroups,
  onMove,
  focusedRowId,
  focusedRowIndex,
  collapsed,
  onCollapsedChange,
}: {
  group: BaseKanbanGroup
  table: BaseTableSnapshot
  view: BaseViewInfo
  disabled: boolean
  width: number
  color: string
  onOpen: (row: BaseRow) => void
  onLoadMore: (group: BaseKanbanGroup) => void
  onCreate: (group: BaseKanbanGroup, title: string) => Promise<void>
  acquireCover?: (path: string) => Promise<BaseCoverLease>
  onDelete?: (row: BaseRow) => void
  moveGroups: BaseKanbanGroup[]
  onMove: (row: BaseRow, targetGroupKey: string) => void
  focusedRowId?: string
  focusedRowIndex?: number
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasMore = !group.loadFailed && group.rows.length < group.total
  const virtualItemCount = group.rows.length + (hasMore ? 1 : 0)
  const cardVirtualizer = useVirtualizer({
    count: virtualItemCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      index < group.rows.length ? estimatedKanbanCardHeight(table, view) : 36,
    getItemKey: (index) =>
      index < group.rows.length
        ? String(group.rows[index]?._id ?? `${group.key}:${index}`)
        : `${group.key}:load-more`,
    gap: 8,
    initialRect: { width, height: 560 },
    overscan: 3,
  })
  const virtualItems = cardVirtualizer.getVirtualItems()
  const lastVirtualIndex = virtualItems.at(-1)?.index ?? -1
  const loadMore = useCallback(() => onLoadMore(group), [group, onLoadMore])

  useBaseVirtualLoadMore({
    enabled: group.loaded && hasMore && !group.loading && !group.loadingMore,
    lastVirtualIndex,
    loadBoundary: group.rows.length,
    onLoadMore: loadMore,
  })

  useEffect(() => {
    if (
      focusedRowIndex === undefined ||
      focusedRowIndex < 0 ||
      focusedRowIndex >= group.rows.length
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
  }, [cardVirtualizer, focusedRowIndex, group.rows.length])

  useEffect(() => {
    cardVirtualizer.measure()
  }, [cardVirtualizer, table.fields, view.properties])

  const create = async () => {
    const next = title.trim()
    if (!next || creating) return
    setCreating(true)
    try {
      await onCreate(group, next)
      setTitle("")
      setAdding(false)
    } finally {
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
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/5"
            style={{ backgroundColor: color }}
          />
          {collapsed ? (
            <button
              type="button"
              className="flex flex-1 items-center text-[11px] font-medium [writing-mode:vertical-rl]"
              aria-label={`Expand ${group.name}`}
              onClick={() => onCollapsedChange(false)}
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
                onClick={() => onCollapsedChange(true)}
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
            className="relative min-h-16 min-w-0 flex-1 overflow-y-auto pr-0.5"
          >
            {(group.loading || !group.loaded) && group.rows.length === 0 ? (
              <div className="flex h-20 items-center justify-center">
                <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : group.loadFailed && group.rows.length === 0 ? (
              <div className="flex h-16 items-center justify-center text-[11px] text-destructive">
                Could not load records
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
                  const row = group.rows[virtualItem.index]
                  return (
                    <div
                      key={virtualItem.key}
                      ref={cardVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full"
                      data-index={virtualItem.index}
                      style={{
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      {row ? (
                        <KanbanCard
                          id={String(row._id)}
                          name={String(row.title ?? "Untitled")}
                          index={virtualItem.index}
                          parent={group.key}
                          className="rounded-lg border-0 bg-transparent shadow-none"
                        >
                          <BaseRecordCard
                            row={row}
                            fields={table.fields}
                            view={view}
                            compact
                            acquireCover={acquireCover}
                            focused={focusedRowId === String(row._id)}
                            onOpen={onOpen}
                            onDelete={onDelete}
                            moveOptions={moveGroups.map((candidate) => ({
                              id: candidate.key,
                              label: candidate.name,
                              disabled: candidate.key === group.key,
                            }))}
                            onMove={onMove}
                          />
                        </KanbanCard>
                      ) : (
                        <div
                          className="flex h-9 items-center justify-center text-muted-foreground"
                          role="status"
                          aria-label={`Loading more ${group.name} records`}
                        >
                          {group.loadingMore ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {adding ? (
            <div className="grid gap-1.5 rounded-md border bg-background p-2 shadow-sm">
              <Input
                autoFocus
                value={title}
                className="h-7 text-xs"
                placeholder="Record title"
                disabled={creating}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void create()
                  if (event.key === "Escape") {
                    setAdding(false)
                    setTitle("")
                  }
                }}
              />
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
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add record
            </Button>
          )}
        </>
      )}
    </KanbanBoard>
  )
}

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
    limit: number
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
  const optionSignature = options
    .map((option) => `${option.id}:${option.name}:${option.color}`)
    .join("|")
  const [groups, setGroups] = useState<BaseKanbanGroup[]>(() =>
    groupField ? groupSpecs(options) : []
  )
  const [countsLoaded, setCountsLoaded] = useState(false)
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    new Set()
  )
  const [dragging, setDragging] = useState(false)
  const [moveAnnouncement, setMoveAnnouncement] = useState("")
  const [inspectedRow, setInspectedRow] = useState<BaseRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<BaseRow | null>(null)
  const fields = orderedBaseFields(table.fields, view)
  const groupedRowCount = groups.reduce(
    (count, group) => count + group.total,
    0
  )
  const boardBusy =
    !countsLoaded || groups.some((group) => group.loading || group.loadingMore)
  const collapsedGroupSignature = [...collapsedGroupKeys].sort().join("|")
  const columnWidth = cardWidth(view)
  const columnVirtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) =>
      collapsedGroupKeys.has(groups[index]?.key ?? "") ? 48 : columnWidth,
    getItemKey: (index) => groups[index]?.key ?? index,
    gap: KANBAN_COLUMN_GAP,
    horizontal: true,
    initialRect: { width: 1024, height: 640 },
    overscan: 2,
    rangeExtractor: dragging
      ? () => groups.map((_, index) => index)
      : defaultRangeExtractor,
  })
  const virtualColumns = columnVirtualizer.getVirtualItems()
  const estimatedColumnStarts = groups.reduce<number[]>((starts, group) => {
    const previousStart = starts.at(-1) ?? 0
    const previousGroup = groups[starts.length - 1]
    const previousWidth = previousGroup
      ? collapsedGroupKeys.has(previousGroup.key)
        ? 48
        : columnWidth
      : 0
    starts.push(
      starts.length === 0
        ? 0
        : previousStart + previousWidth + KANBAN_COLUMN_GAP
    )
    return starts
  }, [])
  const renderedColumns =
    virtualColumns.length > 0
      ? virtualColumns
      : groups.slice(0, 4).map((group, index) => ({
          index,
          key: group.key,
          size: collapsedGroupKeys.has(group.key) ? 48 : columnWidth,
          start: estimatedColumnStarts[index] ?? 0,
        }))
  const estimatedTotalWidth = groups.reduce(
    (width, group, index) =>
      width +
      (collapsedGroupKeys.has(group.key) ? 48 : columnWidth) +
      (index === groups.length - 1 ? 0 : KANBAN_COLUMN_GAP),
    0
  )
  const virtualColumnSignature = renderedColumns
    .map((column) => column.index)
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
              loadFailed: refreshedForGeneration
                ? (existing?.loadFailed ?? false)
                : false,
              loading: refreshedForGeneration
                ? (existing?.loading ?? false)
                : false,
              loadingMore: false,
            }
          })
        })
        setCountsLoaded(true)
      })
      .catch((error) => {
        if (generation !== generationRef.current) return
        onError?.(error)
      })
    return () => {
      generationRef.current += 1
    }
  }, [
    groupField,
    loadGroupCounts,
    onError,
    optionSignature,
    reloadToken,
    table.table.id,
    view.id,
    onRowCountChange,
  ])

  useEffect(() => {
    if (!countsLoaded || groups.length === 0) return
    onRowCountChange?.(groupedRowCount)
  }, [countsLoaded, groupedRowCount, onRowCountChange])

  const loadInitialGroup = useCallback(
    async (group: BaseKanbanGroup) => {
      if (
        !groupField ||
        group.loaded ||
        group.loading ||
        loadingInitialGroupsRef.current.has(group.key)
      ) {
        return
      }
      const generation = generationRef.current
      loadingInitialGroupsRef.current.set(group.key, generation)
      setGroups((current) =>
        current.map((candidate) =>
          candidate.key === group.key
            ? { ...candidate, loading: true }
            : candidate
        )
      )
      try {
        const page = await loadGroupPage(
          groupField,
          group.value,
          0,
          KANBAN_PAGE_SIZE
        )
        if (generation !== generationRef.current) return
        loadedGroupGenerationsRef.current.set(group.key, generation)
        setGroups((current) =>
          current.map((candidate) =>
            candidate.key === group.key
              ? {
                  ...candidate,
                  rows: page.rows,
                  total: page.total,
                  nextOffset: page.offset + page.rows.length,
                  loaded: true,
                  loadFailed: false,
                  loading: false,
                }
              : candidate
          )
        )
      } catch (error) {
        if (generation !== generationRef.current) return
        loadedGroupGenerationsRef.current.set(group.key, generation)
        setGroups((current) =>
          current.map((candidate) =>
            candidate.key === group.key
              ? {
                  ...candidate,
                  loaded: true,
                  loadFailed: true,
                  loading: false,
                }
              : candidate
          )
        )
        onError?.(error)
      } finally {
        if (loadingInitialGroupsRef.current.get(group.key) === generation) {
          loadingInitialGroupsRef.current.delete(group.key)
        }
      }
    },
    [groupField, loadGroupPage, onError]
  )

  useEffect(() => {
    if (dragging) return
    for (const column of renderedColumns) {
      const group = groups[column.index]
      if (group && !collapsedGroupKeys.has(group.key)) {
        void loadInitialGroup(group)
      }
    }
  }, [
    collapsedGroupKeys,
    collapsedGroupSignature,
    dragging,
    groups,
    loadInitialGroup,
    virtualColumnSignature,
  ])

  const loadMore = useCallback(
    async (group: BaseKanbanGroup) => {
      if (
        !groupField ||
        !group.loaded ||
        group.loadFailed ||
        group.loadingMore ||
        loadingMoreGroupsRef.current.has(group.key) ||
        group.rows.length >= group.total
      ) {
        return
      }
      const generation = generationRef.current
      loadingMoreGroupsRef.current.set(group.key, generation)
      setGroups((current) =>
        current.map((candidate) =>
          candidate.key === group.key
            ? { ...candidate, loadingMore: true }
            : candidate
        )
      )
      try {
        const page = await loadGroupPage(
          groupField,
          group.value,
          group.nextOffset,
          KANBAN_PAGE_SIZE
        )
        if (generation !== generationRef.current) return
        setGroups((current) =>
          current.map((candidate) =>
            candidate.key === group.key
              ? {
                  ...candidate,
                  rows: [
                    ...candidate.rows,
                    ...page.rows.filter(
                      (row) =>
                        !candidate.rows.some(
                          (existing) => String(existing._id) === String(row._id)
                        )
                    ),
                  ],
                  total: page.total,
                  nextOffset: Math.max(
                    candidate.nextOffset,
                    page.offset + page.rows.length
                  ),
                  loadingMore: false,
                }
              : candidate
          )
        )
      } catch (error) {
        if (generation !== generationRef.current) return
        setGroups((current) =>
          current.map((candidate) =>
            candidate.key === group.key
              ? { ...candidate, loadingMore: false }
              : candidate
          )
        )
        onError?.(error)
      } finally {
        if (loadingMoreGroupsRef.current.get(group.key) === generation) {
          loadingMoreGroupsRef.current.delete(group.key)
        }
      }
    },
    [groupField, loadGroupPage, onError]
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
      ? focusedGroup.rows[focusedGroupIndex]
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

  useEffect(() => {
    if (!focusedGroup || focusedGroupIndex < 0) return
    if (focusedGroupIndex >= focusedGroup.rows.length) {
      if (
        !focusedGroup.loading &&
        !focusedGroup.loadingMore &&
        focusedGroup.rows.length < focusedGroup.total
      ) {
        void loadMore(focusedGroup)
      }
      return
    }
  }, [focusedGroup, focusedGroupIndex, loadMore, virtualColumnSignature])

  const moveRecord = (rowId: string, targetKey: string) => {
    if (!groupField || disabled) return false
    const source = groups.find((group) =>
      group.rows.some((row) => String(row._id) === rowId)
    )
    const target = groups.find((group) => group.key === targetKey)
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
            nextOffset: Math.max(0, group.nextOffset - 1),
          }
        }
        if (group.key === target.key) {
          return {
            ...group,
            rows: [optimistic, ...group.rows],
            total: group.total + 1,
            nextOffset: 0,
          }
        }
        return group
      })
    )
    const title = String(row.title ?? "Untitled")
    setMoveAnnouncement(`${title} moved from ${source.name} to ${target.name}.`)
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
      .catch((error) => {
        const sourceIndex = source.rows.findIndex(
          (candidate) => String(candidate._id) === rowId
        )
        setGroups((current) =>
          current.map((group) => {
            if (group.key === source.key) {
              if (
                group.rows.some((candidate) => String(candidate._id) === rowId)
              ) {
                return group
              }
              const rows = [...group.rows]
              rows.splice(Math.min(sourceIndex, rows.length), 0, row)
              return {
                ...group,
                rows,
                total: group.total + 1,
                nextOffset: group.nextOffset + 1,
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
                nextOffset: 0,
              }
            }
            return group
          })
        )
        setMoveAnnouncement(
          `${title} could not be moved to ${target.name}. The change was reverted.`
        )
        onError?.(error)
      })
    return true
  }

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

  const createInGroup = async (group: BaseKanbanGroup, title: string) => {
    if (!groupField) return
    try {
      const result = await onAddRow(groupField, group.value, title)
      setGroups((current) =>
        current.map((candidate) =>
          candidate.key === group.key
            ? {
                ...candidate,
                rows: [result.row, ...candidate.rows],
                total: candidate.total + 1,
                nextOffset: 0,
              }
            : candidate
        )
      )
    } catch (error) {
      onError?.(error)
      throw error
    }
  }

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
        return current.map((group) => ({
          ...group,
          rows: group.rows.map((candidate) =>
            String(candidate._id) === rowId ? result.row : candidate
          ),
        }))
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
        return current.map((group) => ({
          ...group,
          rows: group.rows.map((candidate) =>
            String(candidate._id) === rowId ? result.row : candidate
          ),
        }))
      }
      return current.map((group) => {
        if (group.key === source.key) {
          return {
            ...group,
            rows: group.rows.filter(
              (candidate) => String(candidate._id) !== rowId
            ),
            total: Math.max(0, group.total - 1),
            nextOffset: Math.max(0, group.nextOffset - 1),
          }
        }
        if (group.key === target.key) {
          return {
            ...group,
            rows: [
              result.row,
              ...group.rows.filter(
                (candidate) => String(candidate._id) !== rowId
              ),
            ],
            total: group.total + 1,
            nextOffset: 0,
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
          nextOffset: Math.max(0, group.nextOffset - 1),
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
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <span
        className="sr-only"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      >
        {moveAnnouncement}
      </span>
      <div
        ref={scrollContainerRef}
        data-base-kanban-scroll
        aria-busy={boardBusy}
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden p-3"
      >
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
                  className="absolute inset-y-0 left-0"
                  data-index={virtualColumn.index}
                  style={{
                    width: virtualColumn.size,
                    transform: `translateX(${virtualColumn.start}px)`,
                  }}
                >
                  <BaseKanbanColumn
                    group={group}
                    table={table}
                    view={view}
                    disabled={disabled}
                    width={columnWidth}
                    color={baseOptionColor(group.color, theme)}
                    acquireCover={acquireCover}
                    onOpen={setInspectedRow}
                    onDelete={onDeleteRow ? setDeleteRow : undefined}
                    moveGroups={groups}
                    onMove={(row, targetGroupKey) =>
                      moveRecord(String(row._id), targetGroupKey)
                    }
                    focusedRowId={
                      focusedRow ? String(focusedRow._id) : undefined
                    }
                    focusedRowIndex={
                      focusedGroup?.key === group.key && focusedGroupIndex >= 0
                        ? focusedGroupIndex
                        : undefined
                    }
                    collapsed={collapsedGroupKeys.has(group.key)}
                    onCollapsedChange={(collapsed) =>
                      setGroupCollapsed(group.key, collapsed)
                    }
                    onLoadMore={(candidate) => void loadMore(candidate)}
                    onCreate={createInGroup}
                  />
                </div>
              )
            })}
          </div>
        </KanbanProvider>
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
