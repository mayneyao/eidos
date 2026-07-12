import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type {
  BaseFieldInfo,
  BaseRow,
  BaseRowMutationResult,
  BaseRowPage,
  BaseSqlPrimitive,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import type { SpaceBinaryFile } from "@eidos.space/file-space"
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
import { BaseRecordInspector } from "./base-record-inspector"
import { orderedBaseFields } from "./base-view-layout"

const KANBAN_PAGE_SIZE = 50
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
}) {
  const [collapsed, setCollapsed] = useState(false)
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
              onClick={() => setCollapsed(false)}
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
                onClick={() => setCollapsed(true)}
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
                    onOpen={onOpen}
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
  loadGroupPage,
  onCellEdit,
  onAddRow,
  readBinary,
  onOpenFile,
  onRevealFile,
  onError,
  sidePanel,
}: {
  table: BaseTableSnapshot
  view: BaseViewInfo
  disabled?: boolean
  reloadToken?: number
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
  onOpenFile?: (path: string) => void
  onRevealFile?: (path: string) => Promise<void> | void
  onError?: (error: unknown) => void
  sidePanel?: ReactNode
}) {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"
  const generationRef = useRef(0)
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
  const [groups, setGroups] = useState<BaseKanbanGroup[]>([])
  const [inspectedRow, setInspectedRow] = useState<BaseRow | null>(null)
  const fields = orderedBaseFields(table.fields, view)

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    setInspectedRow(null)
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
  ])

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

  const dragEnd = (event: DragEndEvent) => {
    if (!groupField || disabled || !event.over) return
    const rowId = String(event.active.id)
    const targetKey = String(event.over.id)
    const source = groups.find((group) =>
      group.rows.some((row) => String(row._id) === rowId)
    )
    const target = groups.find((group) => group.key === targetKey)
    const row = source?.rows.find(
      (candidate) => String(candidate._id) === rowId
    )
    if (!source || !target || !row || source.key === target.key) return

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
        onError?.(error)
      })
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
      <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden p-3">
        <KanbanProvider
          onDragEnd={dragEnd}
          className="!flex h-full min-w-max items-stretch gap-3"
        >
          {groups.map((group) => (
            <BaseKanbanColumn
              key={group.key}
              group={group}
              table={table}
              view={view}
              disabled={disabled}
              width={cardWidth(view)}
              color={baseOptionColor(group.color, theme)}
              readBinary={readBinary}
              onOpen={setInspectedRow}
              onLoadMore={(candidate) => void loadMore(candidate)}
              onCreate={createInGroup}
            />
          ))}
        </KanbanProvider>
      </div>
      {sidePanel ??
        (inspectedRow ? (
          <BaseRecordInspector
            row={inspectedRow}
            fields={fields}
            onClose={() => setInspectedRow(null)}
            onCopyRecordId={copyRecordId}
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
    </div>
  )
}
