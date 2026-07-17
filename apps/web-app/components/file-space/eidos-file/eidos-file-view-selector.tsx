import { useEffect, useId, useMemo, useState, type ReactNode } from "react"
import type {
  EidosFileFieldInfo,
  EidosFileViewInfo,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Puzzle,
  SquareKanban,
  Table2,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { FileExtensionEidosFileView } from "@/apps/web-app/hooks/use-file-extension-eidos-file-views"

import { isEidosFileRecordCoverField } from "./eidos-file-record-card-layout"

type Panel = "list" | "create" | "manage" | "delete"
export type EidosFileBuiltInViewType = "grid" | "gallery" | "kanban"
export const EIDOS_FILE_EXTENSION_VIEW_PREFIX = "extension:"

export function eidosFileExtensionViewType(contributionId: string): string {
  return `${EIDOS_FILE_EXTENSION_VIEW_PREFIX}${contributionId}`
}

export function eidosFileExtensionContributionId(type: string): string | null {
  return type.startsWith(EIDOS_FILE_EXTENSION_VIEW_PREFIX)
    ? type.slice(EIDOS_FILE_EXTENSION_VIEW_PREFIX.length) || null
    : null
}

const VIEW_TYPES: Array<{
  type: EidosFileBuiltInViewType
  label: string
  description: string
}> = [
  { type: "grid", label: "Grid", description: "Rows and columns" },
  { type: "gallery", label: "Gallery", description: "Responsive cards" },
  { type: "kanban", label: "Kanban", description: "Grouped by Select" },
]

function defaultViewName(
  type: EidosFileBuiltInViewType,
  views: EidosFileViewInfo[]
): string {
  const label = VIEW_TYPES.find((candidate) => candidate.type === type)?.label
  const prefix = label ?? "View"
  const names = new Set(views.map((view) => view.name.trim().toLowerCase()))
  let suffix = views.filter((view) => view.type === type).length + 1
  while (names.has(`${prefix} ${suffix}`.toLowerCase())) suffix += 1
  return `${prefix} ${suffix}`
}

export function isEidosFileBuiltInViewType(
  type: string
): type is EidosFileBuiltInViewType {
  return type === "grid" || type === "gallery" || type === "kanban"
}

export function EidosFileViewTypeIcon({
  type,
  className,
}: {
  type: string
  className?: string
}) {
  if (type === "gallery") return <LayoutGrid className={className} />
  if (type === "kanban") return <SquareKanban className={className} />
  if (eidosFileExtensionContributionId(type))
    return <Puzzle className={className} />
  return <Table2 className={className} />
}

function EidosFileViewLayoutPicker({
  value,
  disabled,
  hasSelectField,
  onChange,
}: {
  value: EidosFileBuiltInViewType | null
  disabled: boolean
  hasSelectField: boolean
  onChange: (type: EidosFileBuiltInViewType) => void
}) {
  return (
    <div className="grid gap-1.5">
      <div
        className="grid grid-cols-3 gap-1.5"
        role="group"
        aria-label="View layout"
      >
        {VIEW_TYPES.map((candidate) => {
          const unavailable = candidate.type === "kanban" && !hasSelectField
          return (
            <button
              key={candidate.type}
              type="button"
              className={cn(
                "grid min-h-16 place-items-center content-center gap-1 rounded-md border px-1.5 text-center outline-hidden hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45",
                value === candidate.type && "border-foreground/30 bg-accent"
              )}
              disabled={disabled || unavailable}
              aria-pressed={value === candidate.type}
              title={candidate.description}
              onClick={() => onChange(candidate.type)}
            >
              <EidosFileViewTypeIcon
                type={candidate.type}
                className="h-4 w-4"
              />
              <span className="text-[11px]">{candidate.label}</span>
            </button>
          )
        })}
      </div>
      {!hasSelectField ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          Add a Select field to enable Kanban.
        </p>
      ) : null}
    </div>
  )
}

export function EidosFileViewSelector({
  views,
  extensionViews = [],
  fields,
  activeView,
  disabled,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onReorder,
  onUpdate,
  viewAction,
  triggerMode = "current",
}: {
  views: EidosFileViewInfo[]
  extensionViews?: FileExtensionEidosFileView[]
  fields: EidosFileFieldInfo[]
  activeView?: EidosFileViewInfo
  disabled?: boolean
  onSelect: (viewId: string) => void
  onCreate: (name: string, type: string) => Promise<void>
  onRename: (viewId: string, name: string) => Promise<void>
  onDuplicate: (viewId: string) => Promise<void>
  onDelete: (viewId: string) => Promise<void>
  onReorder: (viewIds: string[]) => Promise<void>
  onUpdate: (viewId: string, changes: UpdateEidosFileViewInput) => Promise<void>
  viewAction?: ReactNode
  triggerMode?: "current" | "create" | "manage"
}) {
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>("list")
  const [managedViewId, setManagedViewId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [isDefaultName, setIsDefaultName] = useState(false)
  const [createType, setCreateType] = useState<string>("grid")
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const fitImageId = useId()
  const hideEmptyFieldsId = useId()
  const managedView = useMemo(
    () => views.find((view) => view.id === managedViewId),
    [managedViewId, views]
  )
  const gridViewCount = views.filter((view) => view.type === "grid").length
  const selectFields = fields.filter((field) => field.type === "select")
  const coverFields = fields.filter(isEidosFileRecordCoverField)

  useEffect(() => {
    if (managedView) setName(managedView.name)
  }, [managedView])

  const reset = () => {
    setPanel("list")
    setManagedViewId(null)
    setName("")
    setIsDefaultName(false)
    setCreateType("grid")
    setLocalError(null)
  }
  const prepareCreate = () => {
    setName(defaultViewName("grid", views))
    setIsDefaultName(true)
    setCreateType("grid")
    setLocalError(null)
    setPanel("create")
  }
  const run = async (operation: () => Promise<void>, after?: () => void) => {
    setLocalError(null)
    setBusy(true)
    try {
      await operation()
      setLocalError(null)
      after?.()
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Unable to update view"
      )
    } finally {
      setBusy(false)
    }
  }
  const openManage = (view: EidosFileViewInfo) => {
    setManagedViewId(view.id)
    setName(view.name)
    setLocalError(null)
    setPanel("manage")
  }
  const create = () => {
    const nextName = name.trim()
    if (!nextName) return
    void run(
      () => onCreate(nextName, createType),
      () => {
        setOpen(false)
        reset()
      }
    )
  }
  const selectCreateType = (type: string, label: string) => {
    setCreateType(type)
    if (isDefaultName) {
      setName(
        isEidosFileBuiltInViewType(type)
          ? defaultViewName(type, views)
          : `${label} ${views.filter((view) => view.type === type).length + 1}`
      )
    }
  }
  const saveName = () => {
    const nextName = name.trim()
    if (!managedView || !nextName || nextName === managedView.name) return
    void run(() => onRename(managedView.id, nextName))
  }
  const move = (direction: -1 | 1) => {
    if (!managedView) return
    const index = views.findIndex((view) => view.id === managedView.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= views.length) return
    const next = views.map((view) => view.id)
    ;[next[index], next[target]] = [next[target], next[index]]
    void run(() => onReorder(next))
  }
  const updateProperties = (changes: Record<string, unknown>) => {
    if (!managedView) return
    void run(() =>
      onUpdate(managedView.id, {
        properties: { ...(managedView.properties ?? {}), ...changes },
      })
    )
  }
  const changeManagedLayout = (type: EidosFileBuiltInViewType) => {
    if (
      !managedView ||
      !isEidosFileBuiltInViewType(managedView.type) ||
      managedView.type === type
    ) {
      return
    }
    if (type !== "kanban") {
      void run(() => onUpdate(managedView.id, { type }))
      return
    }
    const currentGroup = managedView.properties?.groupByField
    const groupByField =
      typeof currentGroup === "string" &&
      selectFields.some((field) => field.tableColumnName === currentGroup)
        ? currentGroup
        : selectFields[0]?.tableColumnName
    if (!groupByField) return
    void run(() =>
      onUpdate(managedView.id, {
        type,
        properties: {
          ...(managedView.properties ?? {}),
          groupByField,
        },
      })
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) reset()
        else if (triggerMode === "create") prepareCreate()
      }}
    >
      <PopoverTrigger asChild>
        {triggerMode === "current" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 max-w-44 gap-1.5 px-2 text-xs"
            disabled={disabled}
          >
            <EidosFileViewTypeIcon
              type={activeView?.type ?? "grid"}
              className="h-3.5 w-3.5 shrink-0"
            />
            <span className="truncate">{activeView?.name ?? "Views"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-8 shrink-0 rounded-none text-muted-foreground hover:text-foreground"
            aria-label={
              triggerMode === "create"
                ? "Add Eidos File view"
                : "Manage Eidos File views"
            }
            title={triggerMode === "create" ? "New view" : "Manage views"}
            disabled={disabled}
          >
            {triggerMode === "create" ? (
              <Plus className="h-3.5 w-3.5" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={triggerMode === "current" ? "end" : "start"}
        className="w-72 p-1.5"
      >
        {panel === "list" ? (
          <>
            <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Views
            </div>
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {views.map((view) => {
                const supported =
                  isEidosFileBuiltInViewType(view.type) ||
                  Boolean(eidosFileExtensionContributionId(view.type))
                return (
                  <div
                    key={view.id}
                    className={cn(
                      "group flex min-w-0 items-center rounded-md",
                      view.id === activeView?.id && "bg-accent"
                    )}
                  >
                    <button
                      type="button"
                      className="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-55"
                      disabled={!supported}
                      onClick={() => {
                        onSelect(view.id)
                        setOpen(false)
                      }}
                    >
                      <EidosFileViewTypeIcon
                        type={view.type}
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {view.name}
                      </span>
                      {!supported ? (
                        <span className="text-[10px] capitalize text-muted-foreground">
                          {view.type}
                        </span>
                      ) : view.id === activeView?.id ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mr-0.5 h-7 w-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Manage ${view.name} view`}
                      onClick={() => openManage(view)}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
            <div className="mt-1 border-t pt-1">
              <button
                type="button"
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent"
                onClick={prepareCreate}
              >
                <Plus className="h-3.5 w-3.5" />
                New view
              </button>
              {viewAction}
            </div>
          </>
        ) : null}

        {panel === "create" ? (
          <div className="p-1.5">
            <button
              type="button"
              className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setPanel("list")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Views
            </button>
            <label
              className="text-xs font-medium"
              htmlFor="eidos-file-view-name"
            >
              View name
            </label>
            <Input
              id="eidos-file-view-name"
              autoFocus
              className="mt-1.5 h-8 text-xs"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setIsDefaultName(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") create()
              }}
            />
            <div className="mt-3 grid gap-1.5">
              <p className="text-xs font-medium">Layout</p>
              <EidosFileViewLayoutPicker
                value={
                  isEidosFileBuiltInViewType(createType) ? createType : null
                }
                disabled={busy}
                hasSelectField={selectFields.length > 0}
                onChange={(type) => {
                  selectCreateType(
                    type,
                    VIEW_TYPES.find((candidate) => candidate.type === type)
                      ?.label ?? "View"
                  )
                }}
              />
              {extensionViews.length > 0 ? (
                <div className="mt-2 border-t pt-2">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Extensions
                  </p>
                  <div className="grid gap-1">
                    {extensionViews.map((extensionView) => {
                      const type = eidosFileExtensionViewType(extensionView.id)
                      return (
                        <button
                          key={extensionView.id}
                          type="button"
                          className={cn(
                            "flex min-h-10 items-center gap-2 rounded-md border px-2 text-left outline-hidden hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring",
                            createType === type &&
                              "border-foreground/30 bg-accent"
                          )}
                          aria-pressed={createType === type}
                          disabled={busy}
                          onClick={() =>
                            selectCreateType(type, extensionView.displayName)
                          }
                        >
                          <Puzzle className="h-4 w-4 shrink-0" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">
                              {extensionView.displayName}
                            </span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {extensionView.description ??
                                extensionView.extensionDisplayName}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPanel("list")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                disabled={busy || !name.trim()}
                onClick={create}
              >
                Create
              </Button>
            </div>
          </div>
        ) : null}

        {panel === "manage" && managedView ? (
          <div className="p-1.5">
            <button
              type="button"
              className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setPanel("list")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Views
            </button>
            <label
              className="text-xs font-medium"
              htmlFor="eidos-file-managed-view-name"
            >
              View name
            </label>
            <div className="mt-1.5 flex gap-1.5">
              <Input
                id="eidos-file-managed-view-name"
                className="h-8 min-w-0 text-xs"
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveName()
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={
                  busy || !name.trim() || name.trim() === managedView.name
                }
                onClick={saveName}
              >
                Save
              </Button>
            </div>
            {isEidosFileBuiltInViewType(managedView.type) ? (
              <div className="mt-3 grid gap-1.5 border-t pt-3">
                <p className="text-xs font-medium">Layout</p>
                <EidosFileViewLayoutPicker
                  value={managedView.type}
                  disabled={busy}
                  hasSelectField={selectFields.length > 0}
                  onChange={changeManagedLayout}
                />
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] capitalize text-muted-foreground">
                {managedView.type} layout
              </p>
            )}
            {managedView.type === "kanban" ? (
              <div className="mt-3 grid gap-1.5 border-t pt-3">
                <p className="text-xs font-medium">Group by</p>
                <Select
                  value={
                    typeof managedView.properties?.groupByField === "string"
                      ? managedView.properties.groupByField
                      : undefined
                  }
                  disabled={busy || selectFields.length === 0}
                  onValueChange={(groupByField) =>
                    updateProperties({ groupByField })
                  }
                >
                  <SelectTrigger
                    className="h-8 text-xs"
                    aria-label="Kanban group field"
                  >
                    <SelectValue placeholder="Choose a Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectFields.map((field) => (
                      <SelectItem
                        key={field.tableColumnName}
                        value={field.tableColumnName}
                      >
                        {field.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectFields.length === 0 ? (
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Add a Select field before configuring this Kanban.
                  </p>
                ) : null}
              </div>
            ) : null}
            {managedView.type === "gallery" || managedView.type === "kanban" ? (
              <div className="mt-3 grid gap-3 border-t pt-3">
                <div className="grid gap-1.5">
                  <p className="text-xs font-medium">Card cover</p>
                  <Select
                    value={
                      typeof managedView.properties?.coverPreview === "string"
                        ? managedView.properties.coverPreview
                        : "__none__"
                    }
                    disabled={busy}
                    onValueChange={(coverPreview) =>
                      updateProperties({
                        coverPreview:
                          coverPreview === "__none__" ? null : coverPreview,
                      })
                    }
                  >
                    <SelectTrigger
                      className="h-8 text-xs"
                      aria-label={`${managedView.type === "kanban" ? "Kanban" : "Gallery"} card cover`}
                    >
                      <SelectValue placeholder="No cover" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No cover</SelectItem>
                      {coverFields.map((field) => (
                        <SelectItem
                          key={field.tableColumnName}
                          value={field.tableColumnName}
                        >
                          {field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {coverFields.length === 0 ? (
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      Add a File or URL field to use record images as card
                      covers.
                    </p>
                  ) : null}
                </div>
                {managedView.properties?.coverPreview ? (
                  <label
                    className="flex items-center justify-between gap-3 text-xs"
                    htmlFor={fitImageId}
                  >
                    <span>Fit image</span>
                    <Switch
                      id={fitImageId}
                      aria-label="Fit image"
                      checked={managedView.properties?.fitContent !== false}
                      disabled={busy}
                      onCheckedChange={(fitContent) =>
                        updateProperties({ fitContent })
                      }
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
            {managedView.type === "gallery" || managedView.type === "kanban" ? (
              <div className="mt-3 grid gap-1.5 border-t pt-3">
                <p className="text-xs font-medium">Card size</p>
                <div
                  className="grid grid-cols-3 rounded-md border p-0.5"
                  role="group"
                  aria-label="Card size"
                >
                  {(["small", "medium", "large"] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={cn(
                        "h-7 rounded-[3px] text-[11px] capitalize hover:text-foreground",
                        (managedView.properties?.cardSize ?? "medium") === size
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground"
                      )}
                      disabled={busy}
                      aria-pressed={
                        (managedView.properties?.cardSize ?? "medium") === size
                      }
                      onClick={() => updateProperties({ cardSize: size })}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {managedView.type === "gallery" || managedView.type === "kanban" ? (
              <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
                <label htmlFor={hideEmptyFieldsId}>
                  <p className="text-xs font-medium">Hide empty fields</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Keep cards focused on populated properties.
                  </p>
                </label>
                <Switch
                  id={hideEmptyFieldsId}
                  aria-label="Hide empty fields"
                  checked={managedView.properties?.hideEmptyFields !== false}
                  disabled={busy}
                  onCheckedChange={(hideEmptyFields) =>
                    updateProperties({ hideEmptyFields })
                  }
                />
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-1.5 text-xs"
                disabled={busy || views[0]?.id === managedView.id}
                onClick={() => move(-1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
                Move up
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-start gap-1.5 text-xs"
                disabled={busy || views.at(-1)?.id === managedView.id}
                onClick={() => move(1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Move down
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="col-span-2 h-8 justify-start gap-1.5 text-xs"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => onDuplicate(managedView.id),
                    () => {
                      setOpen(false)
                      reset()
                    }
                  )
                }
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate view
              </Button>
            </div>
            <button
              type="button"
              className="mt-3 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                busy ||
                views.length <= 1 ||
                (managedView.type === "grid" && gridViewCount <= 1)
              }
              title={
                managedView.type === "grid" && gridViewCount <= 1
                  ? "A table must keep one Grid view"
                  : undefined
              }
              onClick={() => setPanel("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete view
            </button>
          </div>
        ) : null}

        {panel === "delete" && managedView ? (
          <div className="p-2">
            <p className="text-sm font-medium">Delete “{managedView.name}”?</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              This removes the saved layout, filters, and sorts. Table records
              are not deleted.
            </p>
            <div className="mt-3 flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => setPanel("manage")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => onDelete(managedView.id),
                    () => {
                      setOpen(false)
                      reset()
                    }
                  )
                }
              >
                Delete
              </Button>
            </div>
          </div>
        ) : null}

        {localError ? (
          <p
            className="mx-2 mb-1 mt-2 break-words text-xs text-destructive"
            role="alert"
          >
            {localError}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
