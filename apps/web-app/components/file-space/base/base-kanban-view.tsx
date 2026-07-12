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
      loading: true,
      loadingMore: false,
    })),
    {
      key: groupKey(null),
      value: null,
      name: "No status",
      color: "gray",
      rows: [],
      total: 0,
      loading: true,
      loadingMore: false,
    },
  ]
}

function cardWidth(view: BaseViewInfo): number {
  if (view.properties?.cardSize === "small") return 248
  if (view.properties?.cardSize === "large") return 336
  return 288
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
  readBinary,
  onDelete,
  moveGroups,
  onMove,
  focusedRowId,
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
  readBinary?: (path: string) => Promise<SpaceBinaryFile>
  onDelete?: (row: BaseRow) => void
  moveGroups: BaseKanbanGroup[]
  onMove: (row: BaseRow, targetGroupKey: string) => void
  focusedRowId?: string
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState("")
  const [creating, setCreating] = useState(false)

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
          <div className="grid min-h-16 content-start gap-2 overflow-y-auto pr-0.5">
            {group.loading ? (
              <div className="flex h-20 items-center justify-center">
                <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : group.rows.length === 0 ? (
              <div className="flex h-16 items-center justify-center text-[11px] text-muted-foreground">
                No records
              </div>
            ) : (
              group.rows.map((row, index) => (
                <KanbanCard
                  key={String(row._id)}
                  id={String(row._id)}
                  name={String(row.title ?? "Untitled")}
                  index={index}
                  parent={group.key}
                  className="rounded-lg border-0 bg-transparent shadow-none"
                >
                  <BaseRecordCard
                    row={row}
                    fields={table.fields}
                    view={view}
                    compact
                    readBinary={readBinary}
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
              ))
            )}
            {group.rows.length < group.total ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-muted-foreground"
                disabled={group.loadingMore}
                onClick={() => onLoadMore(group)}
              >
                {group.loadingMore ? (
                  <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                Load more · {group.rows.length}/{group.total}
              </Button>
            ) : null}
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
              disabled={disabled}
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
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"
  const generationRef = useRef(0)
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
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    new Set()
  )
  const [dragging, setDragging] = useState(false)
  const [moveAnnouncement, setMoveAnnouncement] = useState("")
  const [inspectedRow, setInspectedRow] = useState<BaseRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<BaseRow | null>(null)
  const fields = orderedBaseFields(table.fields, view)
  const groupCountSignature = groups
    .map((group) => `${group.key}:${group.total}:${group.loading ? 1 : 0}`)
    .join("|")
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
    const generation = generationRef.current
    setInspectedRow(null)
    onRowCountChange?.(null)
    if (!groupField) {
      setGroups([])
      return
    }
    const specs = groupSpecs(options)
    setGroups(specs)
    void Promise.all(
      specs.map(async (group) => ({
        key: group.key,
        page: await loadGroupPage(groupField, group.value, 0, KANBAN_PAGE_SIZE),
      }))
    )
      .then((pages) => {
        if (generation !== generationRef.current) return
        const byKey = new Map(pages.map((entry) => [entry.key, entry.page]))
        setGroups((current) =>
          current.map((group) => {
            const page = byKey.get(group.key)
            return page
              ? {
                  ...group,
                  rows: page.rows,
                  total: page.total,
                  loading: false,
                }
              : { ...group, loading: false }
          })
        )
      })
      .catch((error) => {
        if (generation !== generationRef.current) return
        setGroups((current) =>
          current.map((group) => ({ ...group, loading: false }))
        )
        onError?.(error)
      })
    return () => {
      generationRef.current += 1
    }
  }, [
    groupField,
    loadGroupPage,
    onError,
    optionSignature,
    reloadToken,
    table.table.id,
    view.id,
    onRowCountChange,
  ])

  useEffect(() => {
    if (groups.length === 0 || groups.some((group) => group.loading)) return
    onRowCountChange?.(groups.reduce((count, group) => count + group.total, 0))
  }, [groupCountSignature, groups, onRowCountChange])

  const loadMore = async (group: BaseKanbanGroup) => {
    if (!groupField || group.loadingMore) return
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
        group.rows.length,
        KANBAN_PAGE_SIZE
      )
      setGroups((current) =>
        current.map((candidate) =>
          candidate.key === group.key
            ? {
                ...candidate,
                rows: [...candidate.rows, ...page.rows],
                total: page.total,
                loadingMore: false,
              }
            : candidate
        )
      )
    } catch (error) {
      setGroups((current) =>
        current.map((candidate) =>
          candidate.key === group.key
            ? { ...candidate, loadingMore: false }
            : candidate
        )
      )
      onError?.(error)
    }
  }

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
    columnVirtualizer.scrollToIndex(focusedGroupPosition, { align: "auto" })
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
    const row = focusedGroup.rows[focusedGroupIndex]
    if (!row) return
    const rowId = String(row._id)
    const target = Array.from(
      scrollContainerRef.current?.querySelectorAll<HTMLElement>(
        "[data-base-row-id]"
      ) ?? []
    ).find((element) => element.dataset.baseRowId === rowId)
    target?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [focusedGroup, focusedGroupIndex, virtualColumnSignature])

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

    const previous = groups
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
          return {
            ...group,
            rows: [optimistic, ...group.rows],
            total: group.total + 1,
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
        setGroups(previous)
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
    const result = await onCellEdit(row, field, value)
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        rows: group.rows.map((candidate) =>
          String(candidate._id) === String(result.row._id)
            ? result.row
            : candidate
        ),
      }))
    )
    setInspectedRow(result.row)
    return result
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
                    readBinary={readBinary}
                    onOpen={setInspectedRow}
                    onDelete={onDeleteRow ? setDeleteRow : undefined}
                    moveGroups={groups}
                    onMove={(row, targetGroupKey) =>
                      moveRecord(String(row._id), targetGroupKey)
                    }
                    focusedRowId={
                      focusedRow ? String(focusedRow._id) : undefined
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
          onDelete={onDeleteRow}
          onError={onError}
        />
      ) : null}
    </div>
  )
}
