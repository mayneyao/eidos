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
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowMutationResult,
  EidosFileRowPage,
  EidosFileRelationValue,
  EidosFileSort,
  EidosFileSqlPrimitive,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
  FileEntry,
} from "@eidos.space/eidos-file"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronLeft, ChevronRight, LoaderCircle, Plus } from "lucide-react"

import { useEidosFileUI } from "./context"
import { cn } from "./lib/cn"
import { Button, Input } from "./ui/primitives"
import {
  KanbanBoard,
  KanbanCard,
  KanbanHeader,
  KanbanProvider,
  type DragEndEvent,
} from "./ui/kanban"

import { eidosFileErrorMessage } from "./eidos-file-error-message"
import { eidosFileFieldKey } from "./eidos-file-field-visibility"
import {
  eidosFileOptionColor,
  eidosFileSelectOptions,
  type EidosFileSelectOption,
} from "./eidos-file-field-properties"
import { EidosFileRecordCard } from "./eidos-file-record-card"
import {
  createEidosFileRecordCardLayout,
  type EidosFileRecordCardLayout,
} from "./eidos-file-record-card-layout"
import { EidosFileRecordDeleteDialog } from "./eidos-file-record-delete-dialog"
import { eidosFileRecordTitle } from "./eidos-file-record-format"
import { EidosFileRecordInspector } from "./eidos-file-record-inspector"
import {
  mergeRowWindowPage,
  requestForPrefetchedRowWindow,
  rowFromWindow,
  type EidosFileRowWindowRequest,
} from "./eidos-file-row-window"
import {
  resetEidosFileVirtualizerMeasurements,
  useEidosFileBoundedVirtualizer,
} from "./eidos-file-virtual-scroll"
import { orderedEidosFileFields } from "./eidos-file-view-layout"
import { useEidosFileRecordInspectorRow } from "./use-eidos-file-record-inspector-row"

const KANBAN_PAGE_SIZE = 50
const KANBAN_MAX_WINDOW_ROWS = 150
const KANBAN_COLUMN_GAP = 12
const KANBAN_COLUMN_CACHE_MARGIN = 2
const KANBAN_PREFETCH_ROWS = Math.floor(KANBAN_PAGE_SIZE / 2)
const EMPTY_GROUP_VALUE = "__eidos_empty_group__"

interface EidosFileKanbanLoadFailure extends EidosFileRowWindowRequest {
  message: string
}

interface EidosFileKanbanGroup {
  key: string
  value: string | null
  name: string
  color: string
  rows: EidosFileRow[]
  startOffset: number
  total: number
  loaded: boolean
  loadFailure: EidosFileKanbanLoadFailure | null
  loading: boolean
  loadingMore: boolean
  needsReload: boolean
  nextCursor?: string
}

interface EidosFileKanbanMoveOption {
  id: string
  label: string
}

function groupKey(value: string | null): string {
  return `eidos-file-kanban:${value ?? EMPTY_GROUP_VALUE}`
}

// The authoritative page order is the view's sort, falling back to _id
// ascending. Only inject an optimistically moved card where that order
// provably places it inside the loaded window; anything else would flash the
// card at the wrong position and jump once the authoritative reload lands.
// The _id comparison mirrors SQLite BINARY collation for the id alphabet.
function optimisticMoveInsertIndex(
  sorts: EidosFileSort[],
  retainedRows: EidosFileRow[],
  retainedTotal: number,
  rowId: string
): number | null {
  if (sorts.length > 0) return null
  if (retainedRows.length === 0) return retainedTotal === 0 ? 0 : null
  let index = 0
  while (
    index < retainedRows.length &&
    String(retainedRows[index]._id) < rowId
  ) {
    index += 1
  }
  if (index === retainedRows.length && retainedRows.length < retainedTotal) {
    return null
  }
  return index
}

function kanbanMutationErrorMessage(error: unknown, fallback: string): string {
  return eidosFileErrorMessage(error, fallback)
}

function groupSpecs(
  options: EidosFileSelectOption[],
  emptyGroupName = "No status"
): EidosFileKanbanGroup[] {
  return [
    ...options.map((option) => ({
      key: groupKey(option.value),
      value: option.value,
      name: option.value,
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
      name: emptyGroupName,
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

function reconcileKanbanGroupSpec(
  existing: EidosFileKanbanGroup | undefined,
  spec: EidosFileKanbanGroup
): EidosFileKanbanGroup {
  if (!existing) return spec
  if (
    existing.value === spec.value &&
    existing.name === spec.name &&
    existing.color === spec.color
  ) {
    return existing
  }
  return {
    ...existing,
    value: spec.value,
    name: spec.name,
    color: spec.color,
  }
}

function reconcileEmptyKanbanGroup(
  existing: EidosFileKanbanGroup | undefined,
  spec: EidosFileKanbanGroup
): EidosFileKanbanGroup {
  const group = reconcileKanbanGroupSpec(existing, spec)
  if (
    group.rows.length === 0 &&
    group.startOffset === 0 &&
    group.total === 0 &&
    group.nextCursor === undefined &&
    group.loaded &&
    group.loadFailure === null &&
    !group.loading &&
    !group.loadingMore &&
    !group.needsReload
  ) {
    return group
  }
  return {
    ...group,
    rows: [],
    startOffset: 0,
    total: 0,
    nextCursor: undefined,
    loaded: true,
    loadFailure: null,
    loading: false,
    loadingMore: false,
    needsReload: false,
  }
}

function cardWidth(view: EidosFileViewInfo): number {
  if (view.properties?.cardSize === "small") return 248
  if (view.properties?.cardSize === "large") return 336
  return 288
}

function estimatedKanbanCardHeight(layout: EidosFileRecordCardLayout): number {
  const visibleFieldCount = Math.min(layout.fields.length, layout.fieldLimit)
  return 64 + (layout.coverField ? 112 : 0) + visibleFieldCount * 32
}

function replaceLoadedRow(
  groups: EidosFileKanbanGroup[],
  rowId: string,
  nextRow: EidosFileRow
): EidosFileKanbanGroup[] {
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

const EidosFileKanbanCardItem = memo(function EidosFileKanbanCardItem({
  row,
  index,
  groupKey,
  disabled,
  moveBusy,
  table,
  view,
  cardLayout,
  focused,
  onOpen,
  onDelete,
  moveOptions,
  onMove,
}: {
  row: EidosFileRow
  index: number
  groupKey: string
  disabled: boolean
  moveBusy?: boolean
  table: EidosFileTableSnapshot
  view: EidosFileViewInfo
  cardLayout: EidosFileRecordCardLayout
  focused: boolean
  onOpen: (row: EidosFileRow) => void
  onDelete?: (row: EidosFileRow) => void
  moveOptions: Array<{
    id: string
    label: string
    disabled?: boolean
  }>
  onMove: (row: EidosFileRow, targetGroupKey: string) => void
}) {
  return (
    <KanbanCard
      id={String(row._id)}
      name={eidosFileRecordTitle(row, table.fields)}
      index={index}
      parent={groupKey}
      disabled={disabled}
      className={cn(
        "rounded-lg border-0 bg-transparent shadow-none",
        // A move-in-flight lock disables dragging without dimming the column;
        // the dim would read as a flash every time a card is saved.
        moveBusy && "opacity-100"
      )}
    >
      <EidosFileRecordCard
        row={row}
        fields={table.fields}
        view={view}
        layout={cardLayout}
        compact
        cardWidth={cardWidth(view) - 20}
        focused={focused}
        onOpen={onOpen}
        onDelete={disabled ? undefined : onDelete}
        moveOptions={moveOptions}
        disabledMoveOptionId={groupKey}
        moveDisabled={disabled}
        onMove={onMove}
      />
    </KanbanCard>
  )
})

interface EidosFileKanbanVirtualCardProps {
  group: EidosFileKanbanGroup
  globalCardIndex: number
  virtualIndex: number
  offset: number
  disabled: boolean
  moveBusy?: boolean
  table: EidosFileTableSnapshot
  view: EidosFileViewInfo
  cardLayout: EidosFileRecordCardLayout
  focusedRowId?: string
  onOpen: (row: EidosFileRow) => void
  onDelete?: (row: EidosFileRow) => void
  moveOptions: EidosFileKanbanMoveOption[]
  onMove: (row: EidosFileRow, targetGroupKey: string) => void
  onRetry: (group: EidosFileKanbanGroup) => void
  measureElement: (node: HTMLDivElement | null | undefined) => void
}

function kanbanGroupRow(
  group: EidosFileKanbanGroup,
  globalCardIndex: number
): EidosFileRow | undefined {
  const localIndex = globalCardIndex - group.startOffset
  return localIndex >= 0 ? group.rows[localIndex] : undefined
}

function kanbanVirtualCardPropsEqual(
  previous: EidosFileKanbanVirtualCardProps,
  next: EidosFileKanbanVirtualCardProps
): boolean {
  if (
    previous.globalCardIndex !== next.globalCardIndex ||
    previous.virtualIndex !== next.virtualIndex ||
    previous.offset !== next.offset ||
    previous.disabled !== next.disabled ||
    previous.moveBusy !== next.moveBusy ||
    previous.group.key !== next.group.key ||
    previous.group.total !== next.group.total ||
    previous.table !== next.table ||
    previous.view !== next.view ||
    previous.cardLayout !== next.cardLayout ||
    previous.onOpen !== next.onOpen ||
    previous.onDelete !== next.onDelete ||
    previous.moveOptions !== next.moveOptions ||
    previous.onMove !== next.onMove ||
    previous.onRetry !== next.onRetry ||
    previous.measureElement !== next.measureElement
  ) {
    return false
  }

  const previousRow = kanbanGroupRow(previous.group, previous.globalCardIndex)
  const nextRow = kanbanGroupRow(next.group, next.globalCardIndex)
  if (previousRow !== nextRow) return false
  if (!nextRow) return previous.group === next.group
  const rowId = String(nextRow._id)
  return (previous.focusedRowId === rowId) === (next.focusedRowId === rowId)
}

const EidosFileKanbanVirtualCard = memo(function EidosFileKanbanVirtualCard({
  group,
  globalCardIndex,
  virtualIndex,
  offset,
  disabled,
  moveBusy,
  table,
  view,
  cardLayout,
  focusedRowId,
  onOpen,
  onDelete,
  moveOptions,
  onMove,
  onRetry,
  measureElement,
}: EidosFileKanbanVirtualCardProps) {
  const { translate: t } = useEidosFileUI()
  const row = rowFromWindow(
    {
      rows: group.rows,
      startOffset: group.startOffset,
      total: group.total,
    },
    globalCardIndex
  )
  return (
    <div
      ref={measureElement}
      className="absolute left-0 top-0 w-full [contain:layout_style]"
      data-index={globalCardIndex}
      data-eidos-file-virtual-index={virtualIndex}
      role={row ? "listitem" : "presentation"}
      aria-posinset={row ? globalCardIndex + 1 : undefined}
      aria-setsize={row ? group.total : undefined}
      style={{ transform: `translate3d(0, ${offset}px, 0)` }}
    >
      {row ? (
        <EidosFileKanbanCardItem
          row={row}
          index={globalCardIndex}
          groupKey={group.key}
          disabled={disabled}
          moveBusy={moveBusy}
          table={table}
          view={view}
          cardLayout={cardLayout}
          focused={focusedRowId === String(row._id)}
          onOpen={onOpen}
          onDelete={onDelete}
          moveOptions={moveOptions}
          onMove={onMove}
        />
      ) : (
        <div
          data-eidos-file-kanban-placeholder
          className="flex h-9 items-center justify-center text-muted-foreground"
          role={group.loadFailure !== null ? "alert" : "status"}
          aria-label={
            group.loadFailure !== null
              ? t("Could not load more {group} records", {
                  group: group.name,
                })
              : t("Loading more {group} records", { group: group.name })
          }
        >
          {group.loadFailure !== null ? (
            <div className="flex w-full min-w-0 items-center justify-center gap-1 px-1">
              <span
                className="min-w-0 truncate text-[11px] text-destructive"
                title={group.loadFailure.message}
              >
                {group.loadFailure.message}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-[11px]"
                onClick={() => onRetry(group)}
              >
                {t("Retry")}
                <span className="sr-only"> {t("loading records")}</span>
              </Button>
            </div>
          ) : group.loadingMore ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : null}
        </div>
      )}
    </div>
  )
}, kanbanVirtualCardPropsEqual)

const EidosFileKanbanCreateRecord = memo(function EidosFileKanbanCreateRecord({
  group,
  disabled,
  visible,
  onCreate,
}: {
  group: EidosFileKanbanGroup
  disabled: boolean
  visible: boolean
  onCreate: (group: EidosFileKanbanGroup, title: string) => Promise<void>
}) {
  const { translate: t } = useEidosFileUI()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const create = async () => {
    const next = title.trim()
    if (disabled || !next || creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    setCreateError(null)
    try {
      await onCreate(group, next)
      setTitle("")
      setAdding(false)
    } catch (error) {
      setCreateError(
        kanbanMutationErrorMessage(error, t("Unable to create record"))
      )
    } finally {
      creatingRef.current = false
      setCreating(false)
    }
  }

  if (!visible) return null
  return adding ? (
    <div className="grid gap-1.5 rounded-md border bg-background p-2 shadow-sm">
      <Input
        autoFocus
        value={title}
        className="h-7 text-xs"
        placeholder={t("Record title")}
        aria-label={t("Record title in {group}", { group: group.name })}
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
          {t("Cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-6 px-2 text-[11px]"
          disabled={disabled || creating || !title.trim()}
          onClick={() => void create()}
        >
          {t("Add")}
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
      {t("Add record")}
    </Button>
  )
})

const EidosFileKanbanColumn = memo(function EidosFileKanbanColumn({
  group,
  table,
  view,
  cardLayout,
  disabled,
  moveBusy,
  width,
  color,
  onOpen,
  onRequestRange,
  onRetry,
  onCreate,
  onDelete,
  moveOptions,
  onMove,
  focusedRowId,
  focusedRowIndex,
  collapsed,
  onCollapsedChange,
}: {
  group: EidosFileKanbanGroup
  table: EidosFileTableSnapshot
  view: EidosFileViewInfo
  cardLayout: EidosFileRecordCardLayout
  disabled: boolean
  moveBusy?: boolean
  width: number
  color: string
  onOpen: (row: EidosFileRow) => void
  onRequestRange: (
    group: EidosFileKanbanGroup,
    visibleStart: number,
    visibleEnd: number
  ) => void
  onRetry: (group: EidosFileKanbanGroup) => void
  onCreate: (group: EidosFileKanbanGroup, title: string) => Promise<void>
  onDelete?: (row: EidosFileRow) => void
  moveOptions: EidosFileKanbanMoveOption[]
  onMove: (rowId: string, targetGroupKey: string) => void
  focusedRowId?: string
  focusedRowIndex?: number
  collapsed: boolean
  onCollapsedChange: (groupKey: string, collapsed: boolean) => void
}) {
  const { translate: t } = useEidosFileUI()
  const scrollRef = useRef<HTMLDivElement>(null)
  const getVirtualCardKey = useCallback(
    (index: number) => `${group.key}:${index}`,
    [group.key]
  )
  const {
    virtualizer: cardVirtualizer,
    virtualItems,
    logicalSize: logicalVirtualSize,
    physicalSize: physicalVirtualSize,
    measurementCount,
    globalIndex: globalVirtualCardIndex,
    itemOffset: virtualCardOffset,
    scrollToIndex: scrollToVirtualCardIndex,
  } = useEidosFileBoundedVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: group.total,
    getScrollElement: () => scrollRef.current,
    estimatedItemSize: estimatedKanbanCardHeight(cardLayout),
    getItemKey: getVirtualCardKey,
    gap: 8,
    initialRect: { width, height: 560 },
    overscan: 3,
    useAnimationFrameWithResizeObserver: true,
  })
  const moveCard = useCallback(
    (row: EidosFileRow, targetGroupKey: string) =>
      onMove(String(row._id), targetGroupKey),
    [onMove]
  )

  useEffect(() => {
    const first = virtualItems.at(0)
    const last = virtualItems.at(-1)
    if (!first || !last || !group.loaded) return
    onRequestRange(
      group,
      globalVirtualCardIndex(first.index),
      globalVirtualCardIndex(last.index) + 1
    )
  }, [globalVirtualCardIndex, group, onRequestRange, virtualItems])

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
        scrollToVirtualCardIndex(focusedRowIndex, { align: "auto" })
      }
    })
    return () => {
      active = false
    }
  }, [focusedRowIndex, group.total, scrollToVirtualCardIndex])

  const layoutSignature = `${table.fields.map((field) => field.id).join("")}${JSON.stringify(view.properties ?? null)}`

  useEffect(() => {
    // Snapshot updates replace table.fields/view.properties identities on every
    // edit, so this effect also runs after plain card updates. Resetting the
    // measurement cache without re-measuring the mounted cards would leave
    // every card at its estimated height and squeeze the gaps between them.
    resetEidosFileVirtualizerMeasurements(cardVirtualizer)
  }, [cardVirtualizer, layoutSignature])

  useLayoutEffect(() => {
    // Row insertions and removals shift every index behind them while the
    // virtualizer keys measurements by index. Re-measure the mounted cards
    // before paint so following cards do not bounce through stale heights.
    resetEidosFileVirtualizerMeasurements(cardVirtualizer)
  }, [cardVirtualizer, group.rows, group.key])

  return (
    <KanbanBoard
      id={group.key}
      role="region"
      aria-label={t("{group}, {count} records", {
        group: group.name,
        count: group.total,
      })}
      className={cn(
        "shrink-0 gap-2 rounded-md border-0 p-2",
        collapsed && "items-center"
      )}
      style={{
        width: collapsed ? 48 : width,
        backgroundColor: `${color}14`,
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
              className="flex min-h-7 flex-1 items-center rounded-sm text-[11px] font-medium outline-hidden [writing-mode:vertical-rl] focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={t("Expand {group}", { group: group.name })}
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
                aria-label={t("Collapse {group}", { group: group.name })}
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
            data-eidos-file-kanban-column-scroll={group.key}
            data-eidos-file-window-size={group.rows.length}
            data-eidos-file-window-start={group.startOffset}
            className="relative min-h-16 min-w-0 flex-1 overflow-y-auto pr-0.5"
          >
            {(group.loading || !group.loaded) && group.rows.length === 0 ? (
              <div
                className="flex h-20 items-center justify-center"
                role="status"
                aria-label={t("Loading {group} records", {
                  group: group.name,
                })}
              >
                <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" />
              </div>
            ) : group.loadFailure?.mode === "replace" &&
              group.rows.length === 0 ? (
              <div
                className="flex h-20 flex-col items-center justify-center gap-1 text-[11px] text-destructive"
                role="alert"
              >
                <span>{t("Could not load records.")}</span>
                <span
                  className="max-w-full truncate px-2 text-muted-foreground"
                  title={group.loadFailure.message}
                >
                  {group.loadFailure.message}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => onRetry(group)}
                >
                  {t("Retry")}
                </Button>
              </div>
            ) : group.rows.length === 0 ? (
              <div className="flex h-16 items-center justify-center text-[11px] text-muted-foreground">
                {t("No records")}
              </div>
            ) : (
              <div
                className="relative w-full"
                role="list"
                aria-label={t("{group} records", { group: group.name })}
                data-eidos-file-logical-size={logicalVirtualSize}
                data-eidos-file-physical-size={physicalVirtualSize}
                data-eidos-file-measurement-count={measurementCount}
                style={{ height: physicalVirtualSize }}
              >
                {virtualItems.map((virtualItem) => {
                  const globalCardIndex = globalVirtualCardIndex(
                    virtualItem.index
                  )
                  return (
                    <EidosFileKanbanVirtualCard
                      key={virtualItem.key}
                      group={group}
                      globalCardIndex={globalCardIndex}
                      virtualIndex={virtualItem.index}
                      offset={virtualCardOffset(virtualItem)}
                      disabled={disabled}
                      moveBusy={moveBusy}
                      table={table}
                      view={view}
                      cardLayout={cardLayout}
                      focusedRowId={focusedRowId}
                      onOpen={onOpen}
                      onDelete={onDelete}
                      moveOptions={moveOptions}
                      onMove={moveCard}
                      onRetry={onRetry}
                      measureElement={cardVirtualizer.measureElement}
                    />
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
              <span
                className="min-w-0 truncate"
                title={group.loadFailure.message}
              >
                {t("Could not refresh records.")} {group.loadFailure.message}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => onRetry(group)}
              >
                {t("Retry")}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <EidosFileKanbanCreateRecord
        group={group}
        disabled={disabled}
        visible={!collapsed}
        onCreate={onCreate}
      />
    </KanbanBoard>
  )
})

export const EidosFileKanbanView = memo(function EidosFileKanbanView({
  table,
  view,
  disabled = false,
  reloadToken = 0,
  searchResultIndex = null,
  loadGroupCounts,
  loadGroupPage,
  loadRow,
  onCellEdit,
  onAddRow,
  onDeleteRow,
  onImportFiles,
  onImportDroppedFiles,
  onSearchRelation,
  onOpenRecordInTab,
  onRowCountChange,
  onError,
  sidePanel,
}: {
  table: EidosFileTableSnapshot
  view: EidosFileViewInfo
  disabled?: boolean
  reloadToken?: number
  searchResultIndex?: number | null
  loadGroupCounts: (
    field: EidosFileFieldInfo
  ) => Promise<EidosFileRowGroupCount[]>
  loadGroupPage: (
    field: EidosFileFieldInfo,
    value: string | null,
    offset: number,
    limit: number,
    totalHint: number,
    cursor?: string
  ) => Promise<EidosFileRowPage>
  loadRow?: (rowId: string) => Promise<EidosFileRow | null>
  onCellEdit: (
    row: EidosFileRow,
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => Promise<EidosFileRowMutationResult>
  onAddRow: (
    field: EidosFileFieldInfo,
    value: string | null,
    title: string
  ) => Promise<EidosFileRowMutationResult>
  onDeleteRow?: (row: EidosFileRow) => Promise<void>
  onImportFiles?: () => Promise<FileEntry[]>
  onImportDroppedFiles?: (
    files: File[],
    source?: "drop" | "paste"
  ) => Promise<FileEntry[]>
  onSearchRelation?: (
    field: EidosFileFieldInfo,
    query: string
  ) => Promise<EidosFileRelationValue[]>
  onOpenRecordInTab?: (row: EidosFileRow) => void
  onRowCountChange?: (rowCount: number | null) => void
  onError?: (error: unknown) => void
  sidePanel?: ReactNode
}) {
  const { themeName: theme, translate: t } = useEidosFileUI()
  const generationRef = useRef(0)
  const loadingInitialGroupsRef = useRef(new Map<string, number>())
  const loadingMoreGroupsRef = useRef(new Map<string, number>())
  const loadedGroupGenerationsRef = useRef(new Map<string, number>())
  const onRowCountChangeRef = useRef(onRowCountChange)
  onRowCountChangeRef.current = onRowCountChange
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const groupFieldName = view.properties?.groupField
  const groupField = table.fields.find(
    (field) =>
      eidosFileFieldKey(field) === groupFieldName && field.type === "select"
  )
  const options = useMemo(
    () => (groupField ? eidosFileSelectOptions(groupField) : []),
    [groupField]
  )
  const optionSignature = useMemo(
    () => options.map((option) => `${option.value}:${option.color}`).join("|"),
    [options]
  )
  const [groups, setGroups] = useState<EidosFileKanbanGroup[]>(() =>
    groupField ? groupSpecs(options, t("No status")) : []
  )
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const [countsLoaded, setCountsLoaded] = useState(false)
  const [countsError, setCountsError] = useState<string | null>(null)
  const [countsRetryToken, setCountsRetryToken] = useState(0)
  const boardGroups = useMemo(
    () =>
      countsLoaded && view.properties?.showEmptyGroups === false
        ? groups.filter((group) => group.total > 0)
        : groups,
    [countsLoaded, groups, view.properties?.showEmptyGroups]
  )
  const groupCount = boardGroups.length
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    new Set()
  )
  const [dragging, setDragging] = useState(false)
  const [movingGroupKeys, setMovingGroupKeys] =
    useState<ReadonlySet<string> | null>(null)
  const moveInFlight = movingGroupKeys !== null
  const moveInFlightRef = useRef(false)
  const [moveAnnouncement, setMoveAnnouncement] = useState("")
  const [deleteRow, setDeleteRow] = useState<EidosFileRow | null>(null)
  const {
    inspectedRow,
    inspectorLoading,
    inspectorLoadError,
    openInspectorRow,
    closeInspectorRow,
    replaceInspectorRow,
    retryInspectorRow,
  } = useEidosFileRecordInspectorRow(loadRow)
  const fields = useMemo(
    () => orderedEidosFileFields(table.fields, view),
    [table.fields, view]
  )
  const cardLayout = useMemo(
    () => createEidosFileRecordCardLayout(table.fields, view, true),
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
        boardBusy: (!countsLoaded && countsError === null) || hasBusyGroup,
        cachedGroupWindowCount,
        groupedRowCount,
        hasUsableBoard,
      }
    }, [countsError, countsLoaded, groups])
  const collapsedGroupSignature = useMemo(
    () => [...collapsedGroupKeys].sort().join("|"),
    [collapsedGroupKeys]
  )
  const columnWidth = cardWidth(view)
  const moveOptions = useMemo<EidosFileKanbanMoveOption[]>(
    () => [
      ...options.map((option) => ({
        id: groupKey(option.value),
        label: option.value,
      })),
      { id: groupKey(null), label: t("No status") },
    ],
    [options, t]
  )
  const columnVirtualizer = useVirtualizer({
    count: boardGroups.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) =>
      collapsedGroupKeys.has(boardGroups[index]?.key ?? "") ? 48 : columnWidth,
    getItemKey: (index) => boardGroups[index]?.key ?? index,
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
    boardGroups.forEach((group, index) => {
      starts.push(totalWidth)
      totalWidth += collapsedGroupKeys.has(group.key) ? 48 : columnWidth
      if (index < boardGroups.length - 1) totalWidth += KANBAN_COLUMN_GAP
    })
    return {
      estimatedColumnStarts: starts,
      estimatedTotalWidth: totalWidth,
    }
  }, [boardGroups, collapsedGroupKeys, columnWidth])
  const renderedColumns =
    virtualColumns.length > 0
      ? virtualColumns
      : boardGroups.slice(0, 4).map((group, index) => ({
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
      const group = boardGroups[column.index]
      return group
        ? `${group.key}:${group.loaded ? 1 : 0}:${group.loading ? 1 : 0}`
        : "missing"
    })
    .join("|")

  useEffect(() => {
    columnVirtualizer.measure()
  }, [
    boardGroups.length,
    collapsedGroupSignature,
    columnVirtualizer,
    columnWidth,
  ])

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
    closeInspectorRow()
    onRowCountChangeRef.current?.(null)
    if (!groupField) {
      setGroups([])
      setCountsLoaded(false)
      setCountsError(null)
      return
    }
    const specs = groupSpecs(options, t("No status"))
    setGroups((current) => {
      const currentByKey = new Map(current.map((group) => [group.key, group]))
      const next = specs.map((spec) =>
        reconcileKanbanGroupSpec(currentByKey.get(spec.key), spec)
      )
      return next.every((group, index) => group === current[index])
        ? current
        : next
    })
    setCountsLoaded(false)
    setCountsError(null)
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
          const next = specs.map((spec) => {
            const existing = currentByKey.get(spec.key)
            const total = totals.get(spec.key) ?? 0
            if (total === 0) {
              return reconcileEmptyKanbanGroup(existing, spec)
            }
            const refreshedForGeneration =
              loadedGroupGenerationsRef.current.get(spec.key) === generation ||
              loadingInitialGroupsRef.current.get(spec.key) === generation
            return {
              ...(existing ?? spec),
              value: spec.value,
              name: spec.name,
              color: spec.color,
              total,
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
          return next.every((group, index) => group === current[index])
            ? current
            : next
        })
        setCountsLoaded(true)
        setCountsError(null)
      })
      .catch((error) => {
        if (generation !== generationRef.current) return
        setCountsLoaded(false)
        setCountsError(
          eidosFileErrorMessage(
            error,
            "The Eidos File service did not return an error message"
          )
        )
      })
    return () => {
      generationRef.current += 1
    }
  }, [
    groupField,
    closeInspectorRow,
    loadGroupCounts,
    optionSignature,
    countsRetryToken,
    reloadToken,
    table.table.id,
    view.id,
    t,
  ])

  useEffect(() => {
    if (!countsLoaded || groups.length === 0) return
    onRowCountChangeRef.current?.(groupedRowCount)
  }, [countsLoaded, groupedRowCount])

  const loadGroupWindow = useCallback(
    async (
      group: EidosFileKanbanGroup,
      request: EidosFileRowWindowRequest,
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
        const cursor =
          request.mode === "append" &&
          request.offset === group.startOffset + group.rows.length
            ? group.nextCursor
            : undefined
        const page = cursor
          ? await loadGroupPage(
              groupField,
              group.value,
              request.offset,
              KANBAN_PAGE_SIZE,
              group.total,
              cursor
            )
          : await loadGroupPage(
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
      } catch (error) {
        if (generation !== generationRef.current) return
        loadedGroupGenerationsRef.current.set(group.key, generation)
        setGroups((current) =>
          current.map((candidate) =>
            candidate.key === group.key
              ? {
                  ...candidate,
                  loaded: true,
                  loadFailure: {
                    ...request,
                    message: eidosFileErrorMessage(
                      error,
                      "The Eidos File service did not return an error message"
                    ),
                  },
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
    (group: EidosFileKanbanGroup) => {
      if (group.loaded) return Promise.resolve()
      return loadGroupWindow(group, { mode: "replace", offset: 0 })
    },
    [loadGroupWindow]
  )

  useEffect(() => {
    if (!countsLoaded || dragging) return
    for (const column of renderedColumns) {
      const group = boardGroups[column.index]
      if (group && !collapsedGroupKeys.has(group.key)) {
        void loadInitialGroup(group)
      }
    }
  }, [
    boardGroups,
    collapsedGroupKeys,
    collapsedGroupSignature,
    countsLoaded,
    dragging,
    loadInitialGroup,
    virtualColumnSignature,
    visibleGroupLoadSignature,
  ])

  const requestGroupRange = useCallback(
    (group: EidosFileKanbanGroup, visibleStart: number, visibleEnd: number) => {
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
          group.needsReload
            ? { mode: "replace", offset: group.startOffset }
            : request
        )
      }
    },
    [loadGroupWindow]
  )

  useEffect(() => {
    if (!countsLoaded || dragging || groupCount === 0) return
    const keepStart = Math.max(
      0,
      firstRenderedColumnIndex - KANBAN_COLUMN_CACHE_MARGIN
    )
    const keepEnd = Math.min(
      groupCount - 1,
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
          nextCursor: undefined,
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
    groupCount,
    lastRenderedColumnIndex,
  ])

  const retryGroup = useCallback(
    (group: EidosFileKanbanGroup) => {
      if (group.loadFailure) {
        void loadGroupWindow(group, group.loadFailure, true)
      }
    },
    [loadGroupWindow]
  )

  let focusedGroup: EidosFileKanbanGroup | undefined
  let focusedGroupIndex = -1
  if (searchResultIndex !== null && searchResultIndex >= 0) {
    let remaining = searchResultIndex
    for (const group of boardGroups) {
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
    ? boardGroups.findIndex((group) => group.key === focusedGroup?.key)
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
      if (moveInFlightRef.current) {
        setMoveAnnouncement("Another record move is still saving.")
        return true
      }
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
      moveInFlightRef.current = true
      setMovingGroupKeys(new Set([source.key, target.key]))
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
            // A scrolled column keeps its window anchored: wiping the rows and
            // restarting at offset 0 would flash the column back to the top
            // before the authoritative reload lands.
            const anchored = group.startOffset !== 0 && group.rows.length > 0
            const retainedRows = anchored
              ? group.rows
              : group.rows.filter(
                  (candidate) => String(candidate._id) !== rowId
                )
            const insertIndex = anchored
              ? null
              : optimisticMoveInsertIndex(
                  view.sorts,
                  retainedRows,
                  group.total,
                  String(optimistic._id)
                )
            return {
              ...group,
              rows:
                insertIndex === null
                  ? retainedRows
                  : [
                      ...retainedRows.slice(0, insertIndex),
                      optimistic,
                      ...retainedRows.slice(insertIndex),
                    ].slice(0, KANBAN_MAX_WINDOW_ROWS),
              startOffset: anchored ? group.startOffset : 0,
              total: group.total + 1,
              loaded: true,
              needsReload: true,
            }
          }
          return group
        })
      )
      const title = eidosFileRecordTitle(row, table.fields)
      setMoveAnnouncement(`${title} is moving to ${target.name}.`)
      void Promise.resolve()
        .then(() => onCellEdit(row, groupField, target.value))
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
          setMoveAnnouncement(
            `${title} moved from ${source.name} to ${target.name}.`
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
                  loaded: true,
                  needsReload: true,
                }
              }
              return group
            })
          )
          setMoveAnnouncement(
            `${title} could not be moved to ${target.name}: ${eidosFileErrorMessage(error, "Unable to save the move")}. The change was reverted.`
          )
          onError?.(error)
        })
        .finally(() => {
          moveInFlightRef.current = false
          setMovingGroupKeys(null)
        })
      return true
    },
    [disabled, groupField, onCellEdit, onError, view.sorts]
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
    async (group: EidosFileKanbanGroup, title: string) => {
      if (disabled) throw new Error("Eidos File is temporarily read-only")
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
    [disabled, groupField, onAddRow]
  )

  const copyRecordId = (id: string) => {
    if (!navigator.clipboard) {
      onError?.(new Error("Clipboard access is unavailable"))
      return
    }
    void navigator.clipboard.writeText(id).catch((error) => onError?.(error))
  }

  const editInspectedRecord = async (
    row: EidosFileRow,
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => {
    if (disabled) throw new Error("Record editing is temporarily unavailable")
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
    replaceInspectorRow(result.row)
    return result
  }

  const deleteRecord = async (row: EidosFileRow) => {
    if (disabled || !onDeleteRow) return
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
    if (inspectedRow && String(inspectedRow._id) === rowId) closeInspectorRow()
  }

  if (!groupField) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div>
          <h2 className="text-sm font-medium">{t("Choose a Select field")}</h2>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {t(
              "Open this view's settings and choose the Select field that should define Kanban columns."
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="eidos-file-detail-layout flex h-full min-h-0 w-full overflow-hidden">
      <span
        className="sr-only"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      >
        {moveAnnouncement}
      </span>
      <div className="relative min-w-0 flex-1">
        {countsError !== null && hasUsableBoard ? (
          <div
            className="absolute inset-x-3 top-3 z-20 flex h-8 items-center justify-center gap-2 border bg-background px-3 text-[11px] text-muted-foreground shadow-sm"
            role="alert"
          >
            <span className="min-w-0 truncate" title={countsError}>
              {t("Could not refresh Kanban records.")} {countsError}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setCountsRetryToken((current) => current + 1)}
            >
              {t("Retry")}
            </Button>
          </div>
        ) : null}
        <div
          ref={scrollContainerRef}
          data-eidos-file-kanban-scroll
          data-eidos-file-cached-group-windows={cachedGroupWindowCount}
          aria-busy={boardBusy || moveInFlight}
          className="h-full min-w-0 overflow-x-auto overflow-y-hidden p-3"
        >
          {countsError !== null && !hasUsableBoard ? (
            <div
              className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground"
              role="alert"
            >
              <span>{t("Could not load Kanban records.")}</span>
              <span className="max-w-md break-words text-center text-destructive">
                {countsError}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setCountsRetryToken((current) => current + 1)}
              >
                {t("Retry")}
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
                  const group = boardGroups[virtualColumn.index]
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
                      <EidosFileKanbanColumn
                        group={group}
                        table={table}
                        view={view}
                        cardLayout={cardLayout}
                        disabled={
                          disabled || movingGroupKeys?.has(group.key) === true
                        }
                        moveBusy={movingGroupKeys?.has(group.key) === true}
                        width={columnWidth}
                        color={eidosFileOptionColor(group.color, theme)}
                        onOpen={openInspectorRow}
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
          <EidosFileRecordInspector
            row={inspectedRow}
            fields={fields}
            onClose={closeInspectorRow}
            onOpenInTab={onOpenRecordInTab}
            onCopyRecordId={copyRecordId}
            onCellEdit={editInspectedRecord}
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
})
