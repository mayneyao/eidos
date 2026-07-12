import { useEffect, useMemo, useState } from "react"
import type { BaseViewInfo } from "@eidos.space/base"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  MoreHorizontal,
  Plus,
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

type Panel = "list" | "create" | "manage" | "delete"

export function BaseViewSelector({
  views,
  activeView,
  disabled,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onReorder,
}: {
  views: BaseViewInfo[]
  activeView?: BaseViewInfo
  disabled?: boolean
  onSelect: (viewId: string) => void
  onCreate: (name: string) => Promise<void>
  onRename: (viewId: string, name: string) => Promise<void>
  onDuplicate: (viewId: string) => Promise<void>
  onDelete: (viewId: string) => Promise<void>
  onReorder: (viewIds: string[]) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>("list")
  const [managedViewId, setManagedViewId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const managedView = useMemo(
    () => views.find((view) => view.id === managedViewId),
    [managedViewId, views]
  )
  const gridViewCount = views.filter((view) => view.type === "grid").length

  useEffect(() => {
    if (managedView) setName(managedView.name)
  }, [managedView])

  const reset = () => {
    setPanel("list")
    setManagedViewId(null)
    setName("")
    setLocalError(null)
  }
  const run = async (operation: () => Promise<void>, after?: () => void) => {
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
  const openManage = (view: BaseViewInfo) => {
    setManagedViewId(view.id)
    setName(view.name)
    setLocalError(null)
    setPanel("manage")
  }
  const create = () => {
    const nextName = name.trim()
    if (!nextName) return
    void run(
      () => onCreate(nextName),
      () => {
        setOpen(false)
        reset()
      }
    )
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

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) reset()
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 max-w-44 gap-1.5 px-2 text-xs"
          disabled={disabled}
        >
          <Table2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{activeView?.name ?? "Views"}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        {panel === "list" ? (
          <>
            <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Views
            </div>
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {views.map((view) => {
                const supported = view.type === "grid"
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
                      <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
                onClick={() => {
                  setName(`Grid ${views.length + 1}`)
                  setPanel("create")
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                New view
              </button>
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
            <label className="text-xs font-medium" htmlFor="base-view-name">
              View name
            </label>
            <Input
              id="base-view-name"
              autoFocus
              className="mt-1.5 h-8 text-xs"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") create()
              }}
            />
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
              htmlFor="base-managed-view-name"
            >
              View name
            </label>
            <div className="mt-1.5 flex gap-1.5">
              <Input
                id="base-managed-view-name"
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
            <p className="mt-1.5 text-[11px] capitalize text-muted-foreground">
              {managedView.type} layout
            </p>
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
          <p className="mx-2 mb-1 mt-2 text-xs text-destructive">
            {localError}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
